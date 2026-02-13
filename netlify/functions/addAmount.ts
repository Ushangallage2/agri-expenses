import { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { amount } = JSON.parse(event.body || "{}");

  if (amount === undefined || isNaN(Number(amount))) {
    return { statusCode: 400, body: "Valid amount required" };
  }

  try {
    const res = await pool.query(
      `
      INSERT INTO saved_amounts (amount)
      VALUES ($1)
      RETURNING id, amount
      `,
      [Number(amount)]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0]),
    };
  } catch (err: any) {
    if (err.code === "23505") {
      return { statusCode: 400, body: "Amount already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
