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
3. In Netlify site env vars, set `DATABASE_URL` to that URI (replace the old
   MySQL URL). Keep `JWT_SECRET`.
4. Redeploy the `sellerProduction` (or `main`) branch.

On first request the functions create tables (`CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE … ADD COLUMN`). Then:

```bash
# against the new Postgres URL in .env
npm run create-admin -- --username admin --password 'your-admin-password'
```

Existing **MySQL data is not copied automatically**. To move a `mysqldump`
before 21 Dec:

```bash
# converts CREATE/INSERT to PostgreSQL (do not commit the dump files)
python3 scripts/mysql-dump-to-postgres.py dump.sql > dump.pg.sql
psql "$PGURL" -v ON_ERROR_STOP=1 -f dump.pg.sql

# sellerProduction only — adds farms + users.farm_id, keeps ledger rows
npm run migrate-seller-production
```

`pgloader` is an alternative if you still have a live MySQL URI. After cutover,
point Netlify at Postgres only. Do not commit dump files — they contain password
hashes, emails, and receipts.

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
