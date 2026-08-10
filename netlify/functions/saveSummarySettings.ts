import type { Handler } from "@netlify/functions";
import { saveSummaryConfig, type SummaryFrequency } from "./utils/summaryDb";
import { isErrorResponse, requireAdminUser } from "./utils/session";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const auth = await requireAdminUser(event);
  if (isErrorResponse(auth)) return auth;

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
