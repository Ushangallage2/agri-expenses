import type { Handler } from "@netlify/functions";
import {
  dispatchSummary,
  shouldAutoSend,
} from "./utils/dispatchLedgerSummary";
import { getSummaryConfig } from "./utils/summaryDb";

/** Daily cron only. Manual send uses sendLedgerSummary (HTTP). */
export const handler: Handler = async () => {
  try {
    const config = await getSummaryConfig();
    const now = new Date();
    const gate = shouldAutoSend(config.frequency, now, config.lastPeriodKey);
    if (!gate.send) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          skipped: true,
          reason: "not_due",
          periodKey: gate.key,
        }),
      };
    }
    const result = await dispatchSummary({
      force: false,
      usePreviousPeriod: true,
    });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (err: any) {
    console.error("sendLedgerSummaryCron:", err?.message || err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err?.message || "Server error",
      }),
    };
  }
};
