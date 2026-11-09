# PostgreSQL (Aiven MySQL free tier retirement)

Aiven no longer offers a MySQL free tier. New free MySQL services cannot be
created (from 6 Nov 2026); remaining free MySQL instances are powered off and
deleted on **21 December 2026**.

This app now talks **only** to PostgreSQL (`postgres://` / `postgresql://`).
MySQL URLs are rejected at startup and login.

## What to do on Aiven

1. Create an **Aiven for PostgreSQL** free-tier service (same project is fine).
2. Copy the service URI from the Aiven console. Add `?sslmode=require` if it is
   not already present.
3. Convert your MySQL dump and load it (see below). Existing logins stay the
   same; password hashes are copied as-is.
4. In Netlify site env vars, set `DATABASE_URL` to that URI (replace the old
   MySQL URL). Keep `JWT_SECRET`.
5. Redeploy the `main` branch (Deploys → Trigger deploy). Changing env vars
   does not take effect until a new deploy.

On first request the functions also create any missing tables
(`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN`).

If `/.netlify/functions/health` shows `"database":"postgres"` but login or
`warmApis` still 500, that JSON only checked the URL prefix. DBeaver can
work while Netlify fails because `pg` treats `sslmode=require` as certificate
verification; the app now strips that query param and uses TLS without
Aiven’s CA file.

- Aiven → your **PostgreSQL** service → **Settings → Allowed IP addresses** →
  add `0.0.0.0/0` (Netlify functions have no static IPs).
- Confirm **public access** is on, and the service is running (not the old
  MySQL instance).
- `DATABASE_URL` must be that Postgres **Service URI**, with
  `?sslmode=require`. Special characters in the password must be URL-encoded.
- Open `/.netlify/functions/health` — `dbConnected` must be `true`. If it is
  `false`, `dbError` is the Postgres/Aiven reason (no password is shown).

## Import a mysqldump

Do not load the Aiven MySQL `.sql` into Postgres. Convert it first:

```bash
python3 scripts/mysql-dump-to-postgres.py dump.sql > dump.pg.sql
psql "$PGURL" -v ON_ERROR_STOP=1 -f dump.pg.sql
```

In DBeaver: **SQL Editor → Execute SQL Script** (Alt+X) on `dump.pg.sql`, not
Ctrl+Enter. `table "…" does not exist, skipping` is only `DROP TABLE IF EXISTS`
on an empty database.

The converted dump is one `BEGIN` … `COMMIT` transaction. It succeeded if
`psql` exits 0, the log contains `COMMIT`, and there is no `ERROR`.

Do not commit dump files — they contain password hashes, emails, and receipts.

## Local

```bash
# Debian/Ubuntu
sudo apt-get install -y postgresql
sudo service postgresql start
sudo -u postgres createuser -P agri   # prompts for a local password
sudo -u postgres createdb -O agri agri

cp .env.example .env
# DATABASE_URL=postgres://agri@127.0.0.1:5432/agri

npm install
npm run create-admin -- --username admin --password 'your-admin-password'
npm run dev
```
