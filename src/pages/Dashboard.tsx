import React, { useEffect, useRef,useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import ExpenseChart from "../components/ExpenseChart";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";
import { play, unlockAudio } from "../utils/sounds";



/* ======================= TYPES ======================= */
export type Expense = {
  id: string;
  expender: string;
  reason: string;
  crop: string | null;
  amount: number;
  created_at: string;
};


type Trend = {
  crop: string;
  date: string;
  income?: number;
  expense?: number;
  profit?: number;
  total?: number;
};

type Crop = {
  id: string;
  name: string;
};


type Option = {
  value: string;
  label: string;
};

function splitTotals(items: Expense[]) {
  let income = 0;
  let expense = 0;
  for (const e of items) {
    if (e.amount > 0) income += e.amount;
    else expense += Math.abs(e.amount);
  }
  return { income, expense, profit: income - expense };
}

function CounterCard({
  label,
  income,
  expense,
  profit,
  size = 140,
  imgSrc,
  onClick,
  onDelete,
}: {
  label: string;
  income: number;
  expense: number;
  profit: number;
  size?: number;
  imgSrc?: string;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const formatted = profit.toLocaleString();
  const isHero = label === "Ledger";

  const fontSize =
    formatted.length <= 5
      ? size * 0.2
      : Math.max(size * (0.2 - (formatted.length - 3.5) * 0.018), size * 0.11);

  const Wrapper: any = onClick ? "button" : "div";

  return (
    <div className="flex flex-col items-center relative group animate-rise">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 z-10 w-7 h-7 rounded-full
                     bg-black/70 border border-red-400/40 text-red-400
                     hover:bg-red-500/20 text-xs"
          title={`Delete ${label}`}
          aria-label={`Delete ${label}`}
        >
          ✕
        </button>
      )}
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={`relative rounded-full counter-ring ${onClick ? "cursor-pointer" : ""}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        {imgSrc && (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full rounded-full object-cover opacity-90"
          />
        )}
        {!imgSrc && (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-[#2a2418] to-[#0c0b09]" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <span
            className="font-extrabold select-none text-gold glow-text"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
          >
            {formatted}
          </span>
          {isHero && (
            <span className="text-[9px] uppercase tracking-widest text-gold-muted mt-1">
              profit
            </span>
          )}
        </div>
      </Wrapper>

      <div className="mt-2 text-center w-full max-w-[160px]">
        <div
          className={`font-medium text-sm truncate ${onClick ? "text-gold hover:underline" : "text-white"}`}
        >
          {label}
          {onClick ? " →" : ""}
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          <span className="stat-pill text-emerald-300/90">+{income.toLocaleString()}</span>
          <span className="stat-pill text-red-300/90">−{expense.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}





export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  /* =======================
     Close when clicking outside
  ======================== */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  /* =======================
     Update dropdown position
  ======================== */
  const updatePosition = () => {
    if (!inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  /* Recalculate when opened */
  useEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open]);

  const selectedLabel =
    options.find(o => o.value === value)?.label || "";

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* ================= INPUT ================= */}
      <input
        ref={inputRef}
        readOnly
        value={selectedLabel}
        placeholder={placeholder}
        className="glass-input pr-10 cursor-pointer min-h-[44px]"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
      />

      {/* ================= ARROW ================= */}
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs min-h-[44px] px-2"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
      >
        ▼
      </button>

      {/* ================= DROPDOWN MENU ================= */}
      {open &&
        createPortal(
          <ul
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="max-h-48 overflow-y-auto
                       bg-black/80 backdrop-blur-md
                       border border-white/20
                       rounded-md shadow-lg"
          >
            {options.map(opt => (
              <li
                key={opt.value}
                className="p-3 cursor-pointer hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}



/* ======================= COMBO BOX ======================= */





function ComboBox({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  /* =========================
     UPDATE POSITION
  ========================== */
  const updatePosition = () => {
    if (!inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();

    setPos({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  /* =========================
     OUTSIDE CLICK (POINTER SAFE)
  ========================== */
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;

      const insideWrapper =
        wrapperRef.current?.contains(target);
      const insideDropdown =
        dropdownRef.current?.contains(target);

      if (!insideWrapper && !insideDropdown) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  /* =========================
     FILTER
  ========================== */
  const filtered = options.filter((o) =>
    o.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* INPUT */}
      <input
        ref={inputRef}
        className="glass-input pr-8 min-h-[44px]"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          updatePosition();
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          updatePosition();
        }}
      />

      {/* ARROW */}
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2"
        onPointerDown={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
          updatePosition();
        }}
      >
        ▼
      </button>

      {/* DROPDOWN */}
      {open &&
        createPortal(
          <ul
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="
              max-h-56 overflow-y-auto
              bg-black/85 backdrop-blur-md
              border border-white/20
              rounded-lg shadow-2xl
            "
          >
            {filtered.length === 0 && (
              <li className="p-3 text-white/60">
                No results
              </li>
            )}

            {filtered.map((opt) => (
              <li
                key={opt}
                className="p-3 cursor-pointer hover:bg-white/20"
                onPointerDown={(e) => {
                  e.preventDefault(); // prevents blur before select
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}














/* ======================= ADD RECORD FORM ======================= */
function AddRecordForm({
  users,
  reasons,
  crops,
  amounts,
  onAdd,
}: {
  users: string[];
  reasons: string[];
  crops: Crop[];
  amounts: number[];
  onAdd: (data: any) => void;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [user, setUser] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [crop, setCrop] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  //const [deleteId, setDeleteId] = useState<string | null>(null);


  const isValid = user && reason && amount && crop;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    void unlockAudio();
    play("click");

    const payload = {
      user,
      reason,
      crop,
      amount:
        type === "expense"
          ? -Math.abs(Number(amount))
          : Math.abs(Number(amount)),
    };

    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      await onAdd(payload);

      play("save");
      setMessage("Record saved successfully ✔");
      setAmount("");

      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      play("error");
      setError(err.message || "Failed to save record ❌");

      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  }
  
  










  return (
    <form onSubmit={submit} className="glass-card mb-6 p-4 gold-sheen">
      
      {message && (
  <div className="mb-3 text-emerald-300 text-sm font-medium">
    {message}
  </div>
)}

{error && (
  <div className="mb-3 text-red-400 text-sm font-medium">
    {error}
  </div>
)}


      
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
      <DropdownSelect
  value={type}
  onChange={(v) => setType(v as "expense" | "income")}
  placeholder="Type"
  options={[
    { value: "expense", label: "➖ Expense" },
    { value: "income", label: "➕ Income" },
  ]}
/>


        <ComboBox options={users} value={user} onChange={setUser} placeholder="User" />
        <ComboBox options={reasons} value={reason} onChange={setReason} placeholder="Reason" />
        <ComboBox options={amounts.map(a => a.toString())} value={amount} onChange={setAmount} placeholder="Amount" />

        <DropdownSelect
  value={crop}
  onChange={setCrop}
  placeholder="Select crop"
  options={crops.map(c => ({
    value: c.name,   // 👈 send name
    label: c.name,
  }))}
/>

<button
  className={`glass-btn ${!isValid || loading ? "opacity-50" : ""}`}
  disabled={!isValid || loading}
>
  {loading ? "Saving..." : "Save"}
</button>
      </div>

    </form>





  );
}






/* ======================= EXPENSE TABLE ======================= */


type ExpenseTableProps = {
  expenses: Expense[];
  crops: Crop[];
  amounts?: number[];
  onDelete: (id: string) => void;
  onUpdateCrop?: (id: string, crop_id: string) => void;
};

function ExpenseTable({
  expenses,
  onDelete,
}: ExpenseTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="glass-card p-0 overflow-hidden">





      <div className="max-h-[50vh] overflow-y-auto custom-scroll">
        <table className="w-full table-fixed text-left text-sm md:text-base">
          <thead className="sticky top-0 bg-white/10 backdrop-blur-md">
            <tr>
              <th className="p-3 w-[18%]">User</th>
              <th className="p-3 w-[32%]">Reason</th>
              <th className="p-3 w-[15%] hidden sm:table-cell">Crop</th>
              <th className="p-3 w-[20%] text-right pr-4">Amount</th>
              <th className="p-3 w-[10%] text-right pr-2 hidden md:table-cell">Date</th>
              <th className="w-[5%] text-right pr-3" />
            </tr>
          </thead>

          <tbody>
            {expenses.map((e) => {
         //     const cropName = crops.find(c => c.id === e.crop)?.name || "-";

              return (
                <tr key={e.id} className="border-t border-white/10 hover:bg-white/5 transition">
                  
                  <td className="p-3 truncate">{e.expender}</td>
                  <td className="p-3 truncate">{e.reason}</td>
                  <td className="p-3 truncate hidden sm:table-cell">{e.crop}</td>
                  <td className={`p-3 text-right pr-4 font-medium ${e.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                    {e.amount.toLocaleString()}
                  </td>
                  <td className="p-3 text-right pr-2 opacity-70 hidden md:table-cell">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right pr-3">
                    <button
                      onClick={() => setDeleteId(e.id)}
  
                      className="text-red-400 hover:text-red-300 transition text-lg"
                    >
                      ✖
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {deleteId && (
          <ConfirmModal
            open
            title="Delete this record?"
            message="This action cannot be undone."
            confirmLabel="Delete"
            onCancel={() => setDeleteId(null)}
            onConfirm={() => {
              onDelete(deleteId);
              setDeleteId(null);
            }}
          />
        )}
      </div>

      <style>
{`
.custom-scroll {
  max-height: 50vh;
  overflow-y: auto;
  position: relative;

  /* Firefox */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

/* WebKit */
.custom-scroll::-webkit-scrollbar {
  width: 12px;  /* reserve space */
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  border-radius: 10px;
  background: rgba(255,255,255,0.4); /* more visible */
  transition: background 0.5s ease, transform 0.2s ease;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.6); /* brighter on hover */
  transform: scaleX(1.2); /* optional thicker feel */
}

/* Firefox hover */
.custom-scroll:hover {
  scrollbar-color: rgba(255,255,255,0.4) transparent;
}
`}
</style>



    </div>
  );
}













/* ======================= DASHBOARD ======================= */
export default function Dashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [amounts, setAmounts] = useState<number[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);


  useEffect(() => {
    fetchAll();
    loadTrends();
  }, []);

  async function loadTrends() {
    try {
      const data = await safeFetch("/.netlify/functions/getCropsTrend");
      setTrends(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function safeFetch(url: string, options: RequestInit = {}) {
    const res = await fetch(url, { ...options, credentials: "include" });

    if (res.status === 401) {
      setSessionExpired(true);
      throw new Error("Unauthorized / token expired");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${text}`);
    }

    return res.json();
  }

async function fetchAll() {
  const [u, r, c, e, a] = await Promise.all([
    safeFetch("/.netlify/functions/getUsers"),
    safeFetch("/.netlify/functions/getReasons"),
    safeFetch("/.netlify/functions/getCrops"),
    safeFetch("/.netlify/functions/getExpenses"),
    safeFetch("/.netlify/functions/getAmounts"),
  ]);

  if (!u || !r || !c || !e || !a) return;

  setUsers(u);
  setReasons(r);
  setCrops(c);
  setExpenses(
    e.map((item: any) => ({
      ...item,
      amount: Number(item.amount),
    }))
  );
  setAmounts(a);
}

async function fetchExpenses() {
  const e = await safeFetch("/.netlify/functions/getExpenses");

  if (e) {
    setExpenses(
      e.map((item: any) => ({
        ...item,
        amount: Number(item.amount),
      }))
    );
  }
}



async function addRecord(data: any) {
  const res = await safeFetch("/.netlify/functions/addExpense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await fetchExpenses();
  await loadTrends();
  return res;
}


async function updateCrop(id: string, crop_id: string) {
  await safeFetch("/.netlify/functions/updateExpenseCrop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, crop_id }),
  });
  fetchAll();
}

async function deleteRecord(id: string) {
  void unlockAudio();
  try {
    const data = await safeFetch("/.netlify/functions/deleteExpense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (data.success) {
      play("delete");
      await fetchExpenses();
      await loadTrends();
    }
  } catch {
    play("error");
  }
}

async function deleteUser(username: string) {
  void unlockAudio();
  try {
    await safeFetch("/.netlify/functions/deleteUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    play("delete");
    setUserToDelete(null);
    await fetchAll();
  } catch {
    play("error");
  }
}



async function logout() {
  await fetch("/.netlify/functions/logout", {
    method: "POST",
    credentials: "include",
  });
  navigate("/login");
}



// Total value of all crops (expenses + incomes)
//const total = expenses.reduce((sum, e) => sum + e.amount, 0);

const ledger = splitTotals(expenses);

  return (
    <div className="page-container flex flex-col min-h-screen animate-rise">
      <header className="flex justify-between items-center mb-8 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Agri Ledger
          </h1>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button className="glass-btn" onClick={() => navigate("/add-expense?type=user")}>
            + User
          </button>
          <button className="glass-btn" onClick={() => navigate("/add-expense?type=reason")}>
            + Reason
          </button>
          <button className="glass-btn" onClick={() => navigate("/add-expense?type=crop")}>
            + Crop
          </button>
          <button className="glass-btn" onClick={() => navigate("/add-expense?type=amount")}>
            + Amount
          </button>
          <SoundToggle />
          <button className="glass-btn text-red-400" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Summary: Income / Expense / Profit kept separate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card gold-sheen text-center py-6">
          <p className="eyebrow">Total income</p>
          <p className="font-display text-3xl text-emerald-300">
            {ledger.income.toLocaleString()}
          </p>
        </div>
        <div className="glass-card text-center py-6">
          <p className="eyebrow">Total expenses</p>
          <p className="font-display text-3xl text-red-300">
            {ledger.expense.toLocaleString()}
          </p>
        </div>
        <div className="glass-card text-center py-6">
          <p className="eyebrow">Final profit</p>
          <p className={`font-display text-3xl glow-text ${ledger.profit >= 0 ? "text-gold" : "text-red-300"}`}>
            {ledger.profit.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="glass-card p-4 mb-6 flex flex-wrap gap-8 justify-center">
        <CounterCard
          label="Ledger"
          {...ledger}
          size={150}
          imgSrc="/normalCounter.png"
        />

        {crops.map((c) => {
          const t = splitTotals(expenses.filter((e) => e.crop === c.name));
          return (
            <CounterCard
              key={c.name}
              label={c.name}
              {...t}
              imgSrc="/normalCounter.png"
              onClick={() =>
                navigate(`/crops/${encodeURIComponent(c.name)}/notes`)
              }
            />
          );
        })}

        {users.map((u) => {
          const t = splitTotals(expenses.filter((e) => e.expender === u));
          return (
            <CounterCard
              key={u}
              label={u}
              {...t}
              imgSrc="/normalCounter.png"
              onDelete={() => setUserToDelete(u)}
            />
          );
        })}
      </div>

      <AddRecordForm
        users={users}
        reasons={reasons}
        crops={crops}
        amounts={amounts}
        onAdd={addRecord}
      />

      <ExpenseTable
        expenses={expenses}
        crops={crops}
        amounts={amounts}
        onDelete={deleteRecord}
        onUpdateCrop={updateCrop}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="glass-card p-4">
          <h2 className="font-display text-xl text-center text-gold mb-2">
            Cumulative income
          </h2>
          <div className="w-full" style={{ height: "320px" }}>
            <ExpenseChart trends={trends} metric="income" />
          </div>
        </div>
        <div className="glass-card p-4">
          <h2 className="font-display text-xl text-center text-gold mb-2">
            Cumulative expenses
          </h2>
          <div className="w-full" style={{ height: "320px" }}>
            <ExpenseChart trends={trends} metric="expense" />
          </div>
        </div>
      </div>

      <div className="glass-card p-4 mt-4">
        <h2 className="font-display text-xl text-center text-gold mb-2">
          Cumulative profit by crop
        </h2>
        <div className="w-full" style={{ height: "360px" }}>
          <ExpenseChart trends={trends} metric="profit" />
        </div>
      </div>

{sessionExpired && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 animate-fadeIn">
    <div className="glass-card p-6 w-[90%] max-w-[340px] text-center space-y-4">
      <h2 className="font-display text-2xl text-gold">Session expired</h2>
      <p className="text-sm text-gold-muted">Please login again.</p>
      <div className="flex justify-center gap-4 mt-4">
        <button className="glass-btn" onClick={() => setSessionExpired(false)}>
          Close
        </button>
        <button className="glass-btn gold-btn" onClick={() => navigate("/login")}>
          Login
        </button>
      </div>
    </div>
  </div>
)}

      <ConfirmModal
        open={!!userToDelete}
        title="Delete user?"
        message={
          userToDelete
            ? `Remove “${userToDelete}” from the ledger? Past records will keep the name.`
            : undefined
        }
        confirmLabel="Delete"
        onCancel={() => setUserToDelete(null)}
        onConfirm={() => {
          if (userToDelete) void deleteUser(userToDelete);
        }}
      />

    </div>
  );
}

