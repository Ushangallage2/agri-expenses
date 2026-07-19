import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import SoundToggle from "../components/SoundToggle";
import { play, unlockAudio } from "../utils/sounds";

type Config = {
  frequency: "weekly" | "monthly";
  enabled: boolean;
  lastSentAt: string | null;
  lastPeriodKey: string | null;
  emails: { id: number; email: string; created_at: string }[];
};

export default function EmailReports() {
  const navigate = useNavigate();
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [enabled, setEnabled] = useState(true);
  const [emailsText, setEmailsText] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/getSummarySettings");
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as Config;
      setFrequency(data.frequency);
      setEnabled(data.enabled);
      setEmailsText(data.emails.map((e) => e.email).join("\n"));
      setLastSentAt(data.lastSentAt);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function persist() {
    const res = await apiFetch("/saveSummarySettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frequency,
        enabled,
        emails: emailsText.split(/[\n,;]+/),
      }),
    });
    if (res.status === 401) {
      navigate("/login");
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error("Save failed");
    const data = (await res.json()) as Config;
    setEmailsText(data.emails.map((e) => e.email).join("\n"));
    setLastSentAt(data.lastSentAt);
    return data;
  }

  async function save() {
    void unlockAudio();
    play("click");
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await persist();
      play("success");
      setMessage("Report settings saved.");
    } catch (e: any) {
      play("error");
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow(previousPeriod: boolean) {
    void unlockAudio();
    play("click");
    setSending(true);
    setMessage("");
    setError("");
    try {
      await persist();
      const res = await apiFetch("/sendLedgerSummary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousPeriod }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
        if (typeof data === "string") data = JSON.parse(data);
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(data?.error || "Send failed — check Mailtrap env vars");
      }
      if (data.skipped) {
        setMessage(`Skipped: ${data.reason || "not sent"}`);
        play("error");
      } else {
        play("success");
        const count = data.sent ?? data.recipientCount;
        const label = data.periodLabel;
        const profit = Number(data.periodProfit);
        if (count != null && label && Number.isFinite(profit)) {
          setMessage(
            `Sent to ${count} address(es) · ${label} · profit ${profit.toLocaleString()}`
          );
        } else {
          setMessage("Summary email sent successfully.");
        }
        setLastSentAt(new Date().toISOString());
      }
    } catch (e: any) {
      play("error");
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-container min-h-screen animate-rise">
      <header className="flex justify-between items-center mb-8 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Communications</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Email reports
          </h1>
          <p className="text-gold-muted text-sm mt-2 max-w-xl">
            Weekly or monthly ledger summaries — income, expenses, profit, crop
            breakdowns, and all-time totals — sent to your saved addresses.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <SoundToggle />
          <button className="glass-btn" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-gold-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="glass-card gold-sheen">
            <p className="eyebrow">Schedule</p>
            <h2 className="font-display text-xl text-gold mb-4">When to send</h2>

            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-[#d4af37] w-4 h-4"
              />
              <span className="text-sm">Automatic reports enabled</span>
            </label>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className={`glass-btn flex-1 ${frequency === "weekly" ? "gold-btn" : ""}`}
                onClick={() => setFrequency("weekly")}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`glass-btn flex-1 ${frequency === "monthly" ? "gold-btn" : ""}`}
                onClick={() => setFrequency("monthly")}
              >
                Monthly
              </button>
            </div>

            <p className="text-xs text-gold-muted leading-relaxed mb-6">
              {frequency === "weekly"
                ? "Automatic send: every Monday (UTC) for the previous week."
                : "Automatic send: 1st of each month (UTC) for the previous month."}
              {lastSentAt
                ? ` Last sent: ${new Date(lastSentAt).toLocaleString()}.`
                : " No report sent yet."}
            </p>

            <button
              className={"glass-btn gold-btn w-full " + (saving ? "opacity-50" : "")}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </section>

          <section className="glass-card">
            <p className="eyebrow">Recipients</p>
            <h2 className="font-display text-xl text-gold mb-4">Saved emails</h2>
            <textarea
              className="glass-input min-h-[160px] font-mono text-sm"
              placeholder={"owner@uni-soft.uk\npartner@example.com"}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
            />
            <p className="text-xs text-gold-muted mt-2 mb-4">
              One address per line (commas also fine). From address uses your
              Mailtrap domain (e.g. info@uni-soft.uk).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                className={"glass-btn gold-btn flex-1 " + (sending ? "opacity-50" : "")}
                disabled={sending}
                onClick={() => void sendNow(false)}
              >
                {sending ? "Sending…" : "Send this period now"}
              </button>
              <button
                className={"glass-btn flex-1 " + (sending ? "opacity-50" : "")}
                disabled={sending}
                onClick={() => void sendNow(true)}
              >
                Send previous period
              </button>
            </div>
          </section>
        </div>
      )}

      {(message || error) && (
        <div className="mt-6 glass-card">
          {message && <p className="text-emerald-300 text-sm">{message}</p>}
          {error && <p className="text-red-300 text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}
