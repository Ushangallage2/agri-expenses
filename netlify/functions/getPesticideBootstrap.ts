import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { readToken } from "./utils/session";
import {
  ensurePesticideTables,
  listPesticideSets,
  listPesticideUseLogs,
} from "./utils/pesticideDb";
import { ensureFertilizerTables } from "./utils/fertilizerDb";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = readToken(event);
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const body = await cached("pesticide:bootstrap", 15_000, async () => {
      await ensureFertilizerTables();
      await ensurePesticideTables();
      const [sets, logs] = await Promise.all([
        listPesticideSets(),
        listPesticideUseLogs(60),
      ]);
      return JSON.stringify({ sets, logs });
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=10",
      },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
