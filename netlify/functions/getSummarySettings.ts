import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { getSummaryConfig } from "./utils/summaryDb";

const JWT_SECRET = process.env.JWT_SECRET!;

function authed(event: Parameters<Handler>[0]) {
  const token = event.headers.cookie?.split("token=")?.[1]?.split(";")[0];
  if (!token) return false;
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (!authed(event)) {
    return { statusCode: 401, body: "Unauthorized" };
  }
  try {
    const config = await getSummaryConfig();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    };
  } catch (err: any) {
    console.error("getSummarySettings:", err?.message || err);
    return { statusCode: 500, body: "Server error" };
  }
};
