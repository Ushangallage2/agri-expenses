import type { Handler, HandlerEvent } from "@netlify/functions";
import {
  buildLedgerSummary,
  periodKeyFor,
} from "./utils/buildSummaryData";
import {
  buildSummaryEmailHtml,
  buildSummarySubject,
} from "./utils/summaryEmailHtml";
import { sendMailtrapEmail } from "./utils/mailtrap";
import {
  getSummaryConfig,
  markSummarySent,
} from "./utils/summaryDb";
import {
  isErrorResponse,
  readAuthUser,
  requireAdminUser,
} from "./utils/session";

function isUserAuthed(event: HandlerEvent) {
  return Boolean(readAuthUser(event));
}

function isCronOrSecret(event: HandlerEvent) {
  // Netlify scheduled invocations
  if (event.headers["x-netlify-event"] === "schedule") return true;
  const secret = (process.env.SUMMARY_CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = event.headers["x-summary-secret"] || "";
  const q = event.queryStringParameters?.secret || "";
  return header === secret || q === secret;
}

function shouldAutoSend(
  frequency: "weekly" | "monthly",
  now: Date,
  lastPeriodKey: string | null
) {
  const key = periodKeyFor(frequency, { usePreviousPeriod: true, now });
  if (lastPeriodKey === key) return { send: false as const, key };

  if (frequency === "weekly") {
    // Mondays UTC
    if (now.getUTCDay() !== 1) return { send: false as const, key };
  } else {
    // 1st of month UTC
    if (now.getUTCDate() !== 1) return { send: false as const, key };
  }
  return { send: true as const, key };
}

async function dispatchSummary(opts: {
  force: boolean;
  usePreviousPeriod: boolean;
}) {
  const config = await getSummaryConfig();
  if (!config.enabled && !opts.force) {
    return { skipped: true, reason: "disabled" as const };
  }
  if (!config.emails.length) {
    return { skipped: true, reason: "no_recipients" as const };
  }

  const summary = await buildLedgerSummary(config.frequency, {
    usePreviousPeriod: opts.usePreviousPeriod,
  });
  const key = periodKeyFor(config.frequency, {
    usePreviousPeriod: opts.usePreviousPeriod,
  });

  const html = buildSummaryEmailHtml(
    summary,
    process.env.APP_URL || "https://agriexpenses.netlify.app"
  );
  const subject = buildSummarySubject(summary);

  await sendMailtrapEmail({
    to: config.emails.map((e) => e.email),
    subject,
    html,
  });

  await markSummarySent(key);

  return {
    skipped: false as const,
    recipientCount: config.emails.length,
    sent: config.emails.length,
    periodKey: key,
    periodLabel: summary.periodLabel,
    periodProfit: Number(summary.period.profit) || 0,
    allTimeProfit: Number(summary.allTime.profit) || 0,
  };
}

export const handler: Handler = async (event) => {
  const isSchedule = event.headers["x-netlify-event"] === "schedule";
  const manual = event.httpMethod === "POST" || event.httpMethod === "GET";

  try {
    if (isSchedule || (manual && isCronOrSecret(event) && !isUserAuthed(event))) {
      // Automated path: only send on the right day for previous completed period
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
    }

    // Manual "Send now" from the app (current period)
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
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
      body: JSON.stringify({
        ok: false,
        error: err?.message || "Server error",
      }),
    };
  }
};
