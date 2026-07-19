import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { saveSummaryConfig, type SummaryFrequency } from "./utils/summaryDb";

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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!authed(event)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const frequency: SummaryFrequency =
      body.frequency === "monthly" ? "monthly" : "weekly";
    const enabled = Boolean(body.enabled);
    const emails = Array.isArray(body.emails)
      ? body.emails.map(String)
      : typeof body.emails === "string"
        ? body.emails.split(/[\n,;]+/)
        : [];

    const config = await saveSummaryConfig({ frequency, enabled, emails });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    };
  } catch (err: any) {
    console.error("saveSummarySettings:", err?.message || err);
    return { statusCode: 500, body: "Server error" };
  }
};
