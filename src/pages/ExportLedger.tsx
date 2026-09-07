import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API } from "../utils/api";
import SoundToggle from "../components/SoundToggle";
import Money from "../components/Money";
import { play, unlockAudio } from "../utils/sounds";
import { useAuth } from "../utils/AuthContext";
import { sortExpensesByDate } from "../utils/sortExpenses";

type Expense = {
  id: string | number;
  expender: string;
  reason: string;
  crop: string | null;
  amount: number;
  created_at: string;
};

type Crop = { name: string };

function dayStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function downloadBase64(filename: string, mime: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportLedger() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const [crop, setCrop] = useState(searchParams.get("crop") || "");
  const [reason, setReason] = useState(searchParams.get("reason") || "");
  const [user, setUser] = useState(searchParams.get("user") || "");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [dateFrom, setDateFrom] = useState(searchParams.get("from") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("to") || "");

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [eRes, cRes, uRes, rRes] = await Promise.all([
          fetch(`${API}/getExpenses`, { credentials: "include" }),
          fetch(`${API}/getCrops`, { credentials: "include" }),
          fetch(`${API}/getUsers`, { credentials: "include" }),
          fetch(`${API}/getReasons`, { credentials: "include" }),
        ]);
        if ([eRes, cRes, uRes, rRes].some((r) => r.status === 401)) {
          navigate("/login");
          return;
        }
        if (!eRes.ok) throw new Error(await eRes.text());
        const rows = (await eRes.json()) as Expense[];
        setExpenses(
          sortExpensesByDate(
            rows.map((r) => ({ ...r, amount: Number(r.amount) }))
          )
        );
        if (cRes.ok) {
          const list = (await cRes.json()) as Crop[];
          setCrops(list.map((c) => c.name));
        }
        if (uRes.ok) setUsers(await uRes.json());
        if (rRes.ok) setReasons(await rRes.json());
      } catch (err: any) {
        setError(err.message || "Failed to load ledger");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isAdmin, navigate]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (crop && String(e.crop || "") !== crop) return false;
      if (reason && String(e.reason || "") !== reason) return false;
      if (user && e.expender !== user) return false;
      if (type === "income" && e.amount <= 0) return false;
      if (type === "expense" && e.amount >= 0) return false;
      const day = dayStamp(e.created_at);
      if (dateFrom && day && day < dateFrom) return false;
      if (dateTo && day && day > dateTo) return false;
      return true;
    });
  }, [expenses, crop, reason, user, type, dateFrom, dateTo]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of filtered) {
      if (e.amount > 0) income += e.amount;
      else expense += Math.abs(e.amount);
    }
    return { income, expense, profit: income - expense, count: filtered.length };
  }, [filtered]);

  function clearFilters() {
    setCrop("");
    setReason("");
    setUser("");
    setType("all");
    setDateFrom("");
    setDateTo("");
  }

  async function exportFile(format: "pdf" | "docx" | "csv") {
    setExporting(format);
    setError(null);
    void unlockAudio();
    play("click");
    try {
      const res = await fetch(`${API}/exportLedger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          format,
          crop,
          reason,
          user,
          type,
          dateFrom,
          dateTo,
        }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        filename: string;
        mime: string;
        base64: string;
      };
      downloadBase64(data.filename, data.mime, data.base64);
      play("save");
    } catch (err: any) {
      play("error");
      setError(err.message || "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="page-container min-h-screen animate-rise">
      <header className="flex justify-between items-center mb-8 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Official documents</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Export statement
          </h1>
          <p className="text-gold-muted text-sm mt-2 max-w-xl">
            Filter the record table, then download an Agri Ledger invoice —
            budget totals plus crop, user, and reason summaries.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <SoundToggle />
          <button className="glass-btn" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </div>
      </header>

      <section className="glass-card mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">Crop</span>
          <select className="glass-input" value={crop} onChange={(e) => setCrop(e.target.value)}>
            <option value="">All crops</option>
            {crops.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">Reason</span>
          <select className="glass-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">All reasons</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">User</span>
          <select className="glass-input" value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">Type</span>
          <select className="glass-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Income & expenses</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">From date</span>
          <input
            type="date"
            className="glass-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">To date</span>
          <input
            type="date"
            className="glass-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
          <button type="button" className="glass-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="glass-card text-center py-4">
          <p className="eyebrow">Entries</p>
          <p className="font-display text-2xl text-gold">{totals.count}</p>
        </div>
        <div className="glass-card text-center py-4">
          <p className="eyebrow">Income</p>
          <p className="font-display text-2xl text-emerald-300">
            <Money value={totals.income} />
          </p>
        </div>
        <div className="glass-card text-center py-4">
          <p className="eyebrow">Expenses</p>
          <p className="font-display text-2xl text-red-300">
            <Money value={totals.expense} />
          </p>
        </div>
        <div className="glass-card text-center py-4">
          <p className="eyebrow">Profit</p>
          <p className={`font-display text-2xl ${totals.profit >= 0 ? "text-gold" : "text-red-300"}`}>
            <Money value={totals.profit} />
          </p>
        </div>
      </div>

      <section className="glass-card mb-6">
        <p className="eyebrow">Download</p>
        <h2 className="font-display text-xl text-gold mb-2">Official invoice</h2>
        <p className="text-sm text-gold-muted mb-4">
          Same Agri Ledger statement layout as email reports: header, filters,
          totals, summaries, then the record table.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="glass-btn gold-btn"
            disabled={!!exporting}
            onClick={() => void exportFile("pdf")}
          >
            {exporting === "pdf" ? "Preparing…" : "Export PDF"}
          </button>
          <button
            type="button"
            className="glass-btn gold-btn"
            disabled={!!exporting}
            onClick={() => void exportFile("docx")}
          >
            {exporting === "docx" ? "Preparing…" : "Export Word"}
          </button>
          <button
            type="button"
            className="glass-btn"
            disabled={!!exporting}
            onClick={() => void exportFile("csv")}
          >
            {exporting === "csv" ? "Preparing…" : "Export CSV"}
          </button>
        </div>
      </section>

      {error && <p className="text-red-400 text-sm mb-3 glass-panel">{error}</p>}

      <div className="glass-card p-0 overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto custom-scroll">
          <table className="w-full table-fixed text-left text-sm md:text-base">
            <thead className="sticky top-0 bg-black/70 backdrop-blur-md border-b border-[var(--glass-border)]">
              <tr>
                <th className="p-3 w-[14%]">When</th>
                <th className="p-3 w-[16%]">User</th>
                <th className="p-3 w-[28%]">Reason</th>
                <th className="p-3 w-[16%] hidden sm:table-cell">Crop</th>
                <th className="p-3 w-[14%] text-right pr-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gold-muted">
                    Loading records…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gold-muted">
                    No records match these filters.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((e) => {
                  const isIncome = e.amount > 0;
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-white/10 hover:bg-white/5 transition"
                    >
                      <td className="p-3 text-gold-muted text-xs md:text-sm">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 truncate font-medium">{e.expender}</td>
                      <td className="p-3 truncate">{e.reason}</td>
                      <td className="p-3 truncate hidden sm:table-cell">
                        {e.crop || "—"}
                      </td>
                      <td
                        className={`p-3 text-right pr-4 font-medium ${
                          isIncome ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {isIncome ? "+" : "−"}
                        <Money value={Math.abs(e.amount)} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
