import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API } from "../utils/api";
import SoundToggle from "../components/SoundToggle";
import { sortExpensesByDate } from "../utils/sortExpenses";

type Entry = {
  id: string | number;
  expender: string;
  reason: string;
  crop: string | null;
  amount: number;
  created_at: string;
};

export default function ActivityLog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userFilter = searchParams.get("user") || "all";
  const typeFilter = searchParams.get("type") || "all";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [eRes, uRes] = await Promise.all([
          fetch(`${API}/getExpenses`, { credentials: "include" }),
          fetch(`${API}/getUsers`, { credentials: "include" }),
        ]);
        if (eRes.status === 401 || uRes.status === 401) {
          navigate("/login");
          return;
        }
        if (!eRes.ok) throw new Error(await eRes.text());
        const rows = await eRes.json();
        setEntries(
          sortExpensesByDate(
            rows.map((r: Entry) => ({ ...r, amount: Number(r.amount) }))
          )
        );
        if (uRes.ok) setUsers(await uRes.json());
      } catch (err: any) {
        setError(err.message || "Failed to load backlog");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (userFilter !== "all" && e.expender !== userFilter) return false;
      if (typeFilter === "income" && e.amount <= 0) return false;
      if (typeFilter === "expense" && e.amount >= 0) return false;
      return true;
    });
  }, [entries, userFilter, typeFilter]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of filtered) {
      if (e.amount > 0) income += e.amount;
      else expense += Math.abs(e.amount);
    }
    return { income, expense, profit: income - expense, count: filtered.length };
  }, [filtered]);

  function setFilter(key: "user" | "type", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  return (
    <div className="page-container animate-rise">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="glass-btn"
          onClick={() => navigate("/dashboard")}
        >
          ← Dashboard
        </button>
        <div className="text-center flex-1 min-w-[180px]">
          <p className="eyebrow">Full history</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Activity backlog
          </h1>
        </div>
        <SoundToggle />
      </header>

      <div className="glass-card mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">User</span>
          <select
            className="glass-input"
            value={userFilter}
            onChange={(e) => setFilter("user", e.target.value)}
          >
            <option value="all">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="eyebrow mb-2 block">Type</span>
          <select
            className="glass-input"
            value={typeFilter}
            onChange={(e) => setFilter("type", e.target.value)}
          >
            <option value="all">Income & expenses</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
          </select>
        </label>
        <div className="sm:col-span-2 lg:col-span-2 flex flex-wrap gap-3 items-end">
          <div className="stat-pill !text-xs !px-3 !py-2">
            {totals.count} entries
          </div>
          <div className="stat-pill !text-xs !px-3 !py-2 text-emerald-300">
            +{totals.income.toLocaleString()}
          </div>
          <div className="stat-pill !text-xs !px-3 !py-2 text-red-300">
            −{totals.expense.toLocaleString()}
          </div>
          <div className="stat-pill !text-xs !px-3 !py-2 text-gold">
            profit {totals.profit.toLocaleString()}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3 glass-panel">{error}</p>
      )}

      <div className="glass-card p-0 overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto custom-scroll">
          <table className="w-full table-fixed text-left text-sm md:text-base">
            <thead className="sticky top-0 bg-black/70 backdrop-blur-md border-b border-[var(--glass-border)]">
              <tr>
                <th className="p-3 w-[14%]">When</th>
                <th className="p-3 w-[16%]">User</th>
                <th className="p-3 w-[28%]">Reason</th>
                <th className="p-3 w-[16%] hidden sm:table-cell">Crop</th>
                <th className="p-3 w-[12%] hidden md:table-cell">Type</th>
                <th className="p-3 w-[14%] text-right pr-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gold-muted">
                    Loading backlog…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gold-muted">
                    No entries for this filter.
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
                      <td className="p-3 hidden md:table-cell">
                        <span
                          className={`stat-pill ${
                            isIncome ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {isIncome ? "Income" : "Expense"}
                        </span>
                      </td>
                      <td
                        className={`p-3 text-right pr-4 font-medium ${
                          isIncome ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {isIncome ? "+" : "−"}
                        {Math.abs(e.amount).toLocaleString()}
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
