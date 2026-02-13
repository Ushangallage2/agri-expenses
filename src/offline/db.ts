import fs from "fs";
import path from "path";
import pkg from "pg";
const { Pool } = pkg;

const isDev = process.env.NODE_ENV !== "production";

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: isDev
    ? {
        rejectUnauthorized: false, // 🔹 ignore SSL in local dev
      }
    : {
        rejectUnauthorized: true,
        ca: process.env.PG_CA_CERT, // 🔹 use CA in production
      },
});

export default pool;
