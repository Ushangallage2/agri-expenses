import mysql from "mysql2/promise";
import type {
  ExecuteValues,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

function parseDatabaseUrl(url: string) {
  const cleaned = url
    .replace(/[?&]ssl-mode=[^&]*/gi, "")
    .replace(/\?$/, "")
    .trim();
  const u = new URL(cleaned);

  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
  };
}

const pool = mysql.createPool(
  parseDatabaseUrl(
    (process.env.DATABASE_URL || "").trim() ||
      (() => {
        throw new Error("DATABASE_URL is not set");
      })()
  )
);

function toMysql(sql: string) {
  return sql.replace(/\$(\d+)/g, "?");
}

async function query(sql: string, params: ExecuteValues[] = []) {
  const text = toMysql(sql.trim());
  const returningMatch = text.match(/\sRETURNING\s+(.+)$/i);

  if (returningMatch && /^INSERT\s+INTO/i.test(text)) {
    const cols = returningMatch[1];
    const insertSql = text.replace(/\sRETURNING\s+.+$/i, "");
    const tableMatch = insertSql.match(/INSERT\s+INTO\s+(\w+)/i);
    if (!tableMatch) throw new Error("Could not parse INSERT table name");

    const [result] = await pool.execute<ResultSetHeader>(insertSql, params);
    const insertId = result.insertId;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${cols} FROM ${tableMatch[1]} WHERE id = ?`,
      [insertId]
    );
    return { rows, rowCount: rows.length };
  }

  const [rows] = await pool.execute<RowDataPacket[] | ResultSetHeader>(
    text,
    params
  );

  if (Array.isArray(rows)) {
    return { rows, rowCount: rows.length };
  }

  return {
    rows: [],
    rowCount: rows.affectedRows ?? 0,
    insertId: rows.insertId,
  };
}

export default { query, end: () => pool.end() };
