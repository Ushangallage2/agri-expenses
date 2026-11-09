# PostgreSQL (Aiven MySQL free tier retirement)

Aiven no longer offers a MySQL free tier. New free MySQL services cannot be
created (from 6 Nov 2026); remaining free MySQL instances are powered off and
deleted on **21 December 2026**.

This app now talks **only** to PostgreSQL (`postgres://` / `postgresql://`).
MySQL URLs are rejected at startup and login.

## What to do on Aiven

1. Create an **Aiven for PostgreSQL** free-tier service (same project is fine).
2. Copy the service URI. It looks like:
   `postgres://avnadmin:…@….a.aivencloud.com:PORT/defaultdb?sslmode=require`
3. In Netlify site env vars, set `DATABASE_URL` to that URI (replace the old
   `mysql://…` value). Keep `JWT_SECRET`.
4. Redeploy the `sellerProduction` (or `main`) branch.

On first request the functions create tables (`CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE … ADD COLUMN`). Then:

```bash
# against the new Postgres URL in .env
npm run create-admin -- --username admin --password 'your-admin-password'
```

Existing **MySQL data is not copied automatically**. To move it before 21 Dec:

```bash
# example using pgloader (install separately)
pgloader mysql://USER:PASS@MYSQL_HOST:3306/DB \
        postgres://avnadmin:PASS@PG_HOST:PORT/defaultdb?sslmode=require
```

Or `mysqldump` the old service and load a converted dump. After cutover, point
Netlify at Postgres only.

## Local

```bash
# Debian/Ubuntu
sudo apt-get install -y postgresql
sudo service postgresql start
sudo -u postgres createuser -P agri   # prompts for a local password
sudo -u postgres createdb -O agri agri

cp .env.example .env
# DATABASE_URL=postgres://agri:<password>@127.0.0.1:5432/agri

npm install
npm run create-admin -- --username admin --password 'your-admin-password'
npm run dev
```
