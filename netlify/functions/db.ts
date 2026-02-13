import pkg from "pg";
const { Pool } = pkg;

const isDev = process.env.NODE_ENV !== "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isDev
    ? { rejectUnauthorized: false } // local dev
    : { rejectUnauthorized: false }, // 🔹 ignore self-signed cert in production
});



export default pool;
