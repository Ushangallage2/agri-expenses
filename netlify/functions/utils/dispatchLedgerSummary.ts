import {
  buildLedgerSummary,
  periodKeyFor,
} from "./buildSummaryData";
import {
  buildSummaryEmailHtml,
  buildSummarySubject,
} from "./summaryEmailHtml";
import { sendMailtrapEmail } from "./mailtrap";
import { getSummaryConfig, markSummarySent } from "./summaryDb";

export function shouldAutoSend(
  frequency: "weekly" | "monthly",
  now: Date,
  lastPeriodKey: string | null
) {
  const key = periodKeyFor(frequency, { usePreviousPeriod: true, now });
  if (lastPeriodKey === key) return { send: false as const, key };

  if (frequency === "weekly") {
    if (now.getUTCDay() !== 1) return { send: false as const, key };
  } else if (now.getUTCDate() !== 1) {
    return { send: false as const, key };
  }
  return { send: true as const, key };
}

export async function dispatchSummary(opts: {
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
    process.env.APP_URL || "https://agri-expenses.netlify.app"
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
