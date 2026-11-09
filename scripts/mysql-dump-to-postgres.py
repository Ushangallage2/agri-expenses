#!/usr/bin/env python3
"""Convert a mysqldump of Agri Ledger (or similar) into PostgreSQL SQL.

Usage:
  python3 scripts/mysql-dump-to-postgres.py dump.sql > dump.pg.sql
  psql "$PGURL" -v ON_ERROR_STOP=1 -f dump.pg.sql

Keep dump files out of git.
"""
from __future__ import annotations

import re
import sys
from typing import Iterable


def unescape_mysql_string(s: str) -> str:
    out = []
    i = 0
    while i < len(s):
        if s[i] != "\\" or i == len(s) - 1:
            out.append(s[i])
            i += 1
            continue
        nxt = s[i + 1]
        mapping = {
            "0": "\0",
            "b": "\b",
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "Z": "\x1a",
            "\\": "\\",
            "'": "'",
            '"': '"',
        }
        out.append(mapping.get(nxt, nxt))
        i += 2
    return "".join(out)


def pg_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def split_mysql_tuples(values_sql: str) -> list[str]:
    """Split ` (a,b),(c,d); ` into tuple strings including parens."""
    tuples = []
    i = 0
    n = len(values_sql)
    while i < n:
        while i < n and values_sql[i] in " \t\r\n,;":
            i += 1
        if i >= n:
            break
        if values_sql[i] != "(":
            raise ValueError(f"expected '(' at {i}: {values_sql[i:i+40]!r}")
        depth = 0
        in_str = False
        esc = False
        start = i
        while i < n:
            ch = values_sql[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == "'":
                    in_str = False
                i += 1
                continue
            if ch == "'":
                in_str = True
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    i += 1
                    tuples.append(values_sql[start:i])
                    break
            i += 1
        else:
            raise ValueError("unterminated value tuple")
    return tuples


def convert_tuple_values(tuple_sql: str) -> str:
    inner = tuple_sql.strip()
    if inner.startswith("(") and inner.endswith(")"):
        inner = inner[1:-1]
    parts = []
    i = 0
    n = len(inner)
    while i < n:
        while i < n and inner[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        if inner.startswith("NULL", i) and (i + 4 == n or inner[i + 4] in ", \t"):
            parts.append("NULL")
            i += 4
        elif inner[i] == "'":
            i += 1
            buf = []
            esc = False
            while i < n:
                ch = inner[i]
                if esc:
                    buf.append("\\" + ch)
                    esc = False
                    i += 1
                    continue
                if ch == "\\":
                    esc = True
                    i += 1
                    continue
                if ch == "'":
                    i += 1
                    break
                buf.append(ch)
                i += 1
            raw = unescape_mysql_string("".join(buf))
            parts.append(pg_quote(raw))
        else:
            j = i
            while j < n and inner[j] != ",":
                j += 1
            token = inner[i:j].strip()
            if token.endswith(")"):
                token = token[:-1].strip()
            parts.append(token)
            i = j
        while i < n and inner[i] in " \t":
            i += 1
        if i < n and inner[i] == ",":
            i += 1
    return "(" + ", ".join(parts) + ")"


def convert_type(col: str) -> tuple[str, bool]:
    """Return (postgres column def, is_identity)."""
    identity = bool(re.search(r"\bAUTO_INCREMENT\b", col, re.I))
    col = re.sub(r"\bAUTO_INCREMENT\b", "", col, flags=re.I)
    col = re.sub(r"\bUNSIGNED\b", "", col, flags=re.I)
    col = re.sub(r"\bCHARACTER SET \w+", "", col, flags=re.I)
    col = re.sub(r"\bCOLLATE \w+", "", col, flags=re.I)
    col = re.sub(
        r"\bON UPDATE CURRENT_TIMESTAMP\b", "", col, flags=re.I
    )
    col = re.sub(r"tinyint\(\d+\)", "SMALLINT", col, flags=re.I)
    col = re.sub(r"\btinyint\b", "SMALLINT", col, flags=re.I)
    col = re.sub(r"mediumint\(\d+\)", "INTEGER", col, flags=re.I)
    col = re.sub(r"\bint\(\d+\)", "INTEGER", col, flags=re.I)
    col = re.sub(r"\bint\b", "INTEGER", col, flags=re.I)
    col = re.sub(r"\bbigint\b", "BIGINT", col, flags=re.I)
    col = re.sub(r"\bdouble\b(\s+PRECISION)?", "DOUBLE PRECISION", col, flags=re.I)
    col = re.sub(r"\bfloat\b", "DOUBLE PRECISION", col, flags=re.I)
    col = re.sub(r"\bdatetime\b", "TIMESTAMP", col, flags=re.I)
    col = re.sub(r"\btinytext\b|\bmediumtext\b|\blongtext\b", "TEXT", col, flags=re.I)
    col = re.sub(r"`([^`]+)`", r'"\1"', col)
    col = re.sub(r"\s+", " ", col).strip().rstrip(",")
    if identity:
        # GENERATED BY DEFAULT so explicit dumped ids are kept.
        col = re.sub(
            r"\bINTEGER\b",
            "INTEGER GENERATED BY DEFAULT AS IDENTITY",
            col,
            count=1,
        )
    # Numeric defaults were quoted in MySQL: DEFAULT '0' / DEFAULT '17'
    def unquote_num(m: re.Match) -> str:
        return f"DEFAULT {m.group(1)}"

    col = re.sub(r"DEFAULT '(-?\d+(?:\.\d+)?)'", unquote_num, col)
    return col, identity


def convert_create(table: str, body: str) -> tuple[str, list[str], list[str]]:
    indexes: list[str] = []
    identity_cols: list[str] = []
    col_defs: list[str] = []
    raw_lines = [ln.strip().rstrip(",") for ln in body.split("\n") if ln.strip()]
    for ln in raw_lines:
        if ln.upper().startswith("PRIMARY KEY"):
            ln = ln.replace("`", '"')
            col_defs.append(ln)
            continue
        if ln.upper().startswith("UNIQUE KEY") or ln.upper().startswith("UNIQUE INDEX"):
            m = re.match(r"UNIQUE KEY `?([^`(]+)`?\s*\((.*)\)", ln, re.I)
            if not m:
                m = re.match(r"UNIQUE INDEX `?([^`(]+)`?\s*\((.*)\)", ln, re.I)
            name, cols = m.group(1), m.group(2).replace("`", '"')
            indexes.append(
                f'CREATE UNIQUE INDEX IF NOT EXISTS "{name}" ON "{table}" ({cols});'
            )
            continue
        if ln.upper().startswith("KEY ") or ln.upper().startswith("INDEX "):
            m = re.match(r"(?:KEY|INDEX) `?([^`(]+)`?\s*\((.*)\)", ln, re.I)
            name, cols = m.group(1), m.group(2).replace("`", '"')
            indexes.append(
                f'CREATE INDEX IF NOT EXISTS "{name}" ON "{table}" ({cols});'
            )
            continue
        converted, ident = convert_type(ln)
        col_defs.append(converted)
        if ident:
            cm = re.match(r'"?(\w+)"?', converted)
            if cm:
                identity_cols.append(cm.group(1))
    ddl = f'CREATE TABLE IF NOT EXISTS "{table}" (\n  ' + ",\n  ".join(col_defs) + "\n);"
    return ddl, indexes, identity_cols


def convert_dump(text: str) -> Iterable[str]:
    yield "-- Converted from mysqldump for PostgreSQL"
    yield "SET client_encoding = 'UTF8';"
    yield "SET client_min_messages = warning;"
    yield "BEGIN;"
    yield ""

    identity_by_table: dict[str, list[str]] = {}
    inserted_tables: set[str] = set()

    # Strip MySQL conditional comments that wrap whole statements, keep others out.
    text = re.sub(r"/\*!50003.*?\*/", "", text, flags=re.S)
    lines = text.splitlines()
    buf: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            i += 1
            continue
        if stripped.startswith("/*") or stripped.startswith("SET ") or stripped.startswith("LOCK TABLES") or stripped.startswith("UNLOCK TABLES"):
            i += 1
            continue
        if stripped.startswith("/*!") or stripped.startswith("SET @@") or "SQL_LOG_BIN" in stripped:
            i += 1
            continue

        if stripped.upper().startswith("DROP TABLE"):
            m = re.search(r"DROP TABLE IF EXISTS `([^`]+)`", stripped)
            if m:
                yield f'DROP TABLE IF EXISTS "{m.group(1)}" CASCADE;'
            i += 1
            continue

        if stripped.upper().startswith("CREATE TABLE"):
            chunk = [line]
            i += 1
            while i < len(lines) and "ENGINE=" not in lines[i]:
                chunk.append(lines[i])
                i += 1
            if i < len(lines):
                chunk.append(lines[i])
                i += 1
            create_sql = "\n".join(chunk)
            m = re.search(
                r"CREATE TABLE `([^`]+)` \((.*)\) ENGINE=",
                create_sql,
                re.S,
            )
            if not m:
                raise SystemExit("could not parse CREATE TABLE:\n" + create_sql[:400])
            table, body = m.group(1), m.group(2)
            ddl, indexes, identity_cols = convert_create(table, body)
            identity_by_table[table] = identity_cols
            yield ddl
            for idx in indexes:
                yield idx
            yield ""
            continue

        if stripped.upper().startswith("INSERT INTO"):
            chunk = [line]
            # mysqldump INSERT is usually one line; join if not terminated
            while not chunk[-1].rstrip().endswith(";"):
                i += 1
                if i >= len(lines):
                    break
                chunk.append(lines[i])
            i += 1
            insert_sql = "\n".join(chunk)
            m = re.match(
                r"INSERT INTO `([^`]+)` VALUES\s*(.*)\s*;\s*$",
                insert_sql,
                re.S | re.I,
            )
            if not m:
                raise SystemExit("could not parse INSERT:\n" + insert_sql[:200])
            table, values = m.group(1), m.group(2)
            tuples = split_mysql_tuples(values)
            converted = [convert_tuple_values(t) for t in tuples]
            # Keep inserts reasonably sized for psql
            batch = 50
            for start in range(0, len(converted), batch):
                piece = ",\n".join(converted[start : start + batch])
                yield f'INSERT INTO "{table}" VALUES\n{piece};'
            inserted_tables.add(table)
            yield ""
            continue

        # ALTER TABLE ... ENABLE/DISABLE KEYS
        if "ENABLE KEYS" in stripped or "DISABLE KEYS" in stripped:
            i += 1
            continue

        i += 1

    yield "-- Reset identity sequences so new rows continue after dumped ids"
    for table, cols in identity_by_table.items():
        for col in cols:
            yield (
                f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                f"COALESCE((SELECT MAX(\"{col}\") FROM \"{table}\"), 1));"
            )
    yield ""
    yield "COMMIT;"


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: mysql-dump-to-postgres.py <mysqldump.sql>", file=sys.stderr)
        sys.exit(2)
    src = sys.argv[1]
    with open(src, encoding="utf-8", errors="replace") as f:
        text = f.read()
    for line in convert_dump(text):
        sys.stdout.write(line)
        if not line.endswith("\n"):
            sys.stdout.write("\n")


if __name__ == "__main__":
    main()
