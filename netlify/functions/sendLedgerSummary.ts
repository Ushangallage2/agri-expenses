import type { Handler } from "@netlify/functions";
import { dispatchSummary } from "./utils/dispatchLedgerSummary";
import { isErrorResponse, requireAdminUser } from "./utils/session";

/** Manual send from the Email reports page. Do not attach a cron schedule —
 * scheduled + public HTTP on the same function returns 403 in the browser. */
export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const auth = await requireAdminUser(event);
    if (isErrorResponse(auth)) return auth;

    const body = JSON.parse(event.body || "{}");
    const usePrevious = Boolean(body.previousPeriod);
    const result = await dispatchSummary({
      force: true,
      usePreviousPeriod: usePrevious,
    });

    const payload = {
      ok: true,
      skipped: Boolean(result.skipped),
      reason: "reason" in result ? result.reason : undefined,
      sent: "sent" in result ? result.sent : 0,
      recipientCount: "recipientCount" in result ? result.recipientCount : 0,
      periodKey: "periodKey" in result ? result.periodKey : null,
      periodLabel: "periodLabel" in result ? result.periodLabel : null,
      periodProfit: "periodProfit" in result ? result.periodProfit : null,
      allTimeProfit: "allTimeProfit" in result ? result.allTimeProfit : null,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err: any) {
    console.error("sendLedgerSummary:", err?.message || err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err?.message || "Server error",
      }),
    };
  }
};
