import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import ExpenseChart from "../components/ExpenseChart";
import ThemeToggle from "../components/ThemeToggle";


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
  total: number;
};

type Crop = {
  id: string;
  name: string;
};


type Option = {
  value: string;
  label: string;
};

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
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY + 4,
      left: r.left + window.scrollX,
      width: r.width,
    });
  };

  const selectedLabel =
    options.find(o => o.value === value)?.label || "";

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        ref={inputRef}
        readOnly
        className="glass-input pr-8 cursor-pointer"
        value={selectedLabel}
        placeholder={placeholder}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen(v => !v);
          updatePos();
        }}
      />

      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen(v => !v);
          updatePos();
        }}
      >
        ▼
      </button>

      {open &&
        createPortal(
          <ul
            style={pos}
            className="fixed z-50 max-h-48 overflow-y-auto
                       bg-black/70 backdrop-blur-md
                       border border-white/20 rounded-md"
          >
            {options.map(opt => (
              <li
                key={opt.value}
                className="p-2 cursor-pointer hover:bg-white/20"
                onMouseDown={(e) => {
                  e.preventDefault();
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
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
  };

  const filtered = options.filter(o =>
    o.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        ref={inputRef}
        className="glass-input pr-8"
        value={value}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); updatePos(); }}
        onChange={(e) => { onChange(e.target.value); setOpen(true); updatePos(); }}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
        onMouseDown={(e) => { e.preventDefault(); setOpen(v => !v); updatePos(); }}
      >
        ▼
      </button>

      {open && createPortal(
        <ul style={pos} className="fixed z-50 max-h-48 overflow-y-auto bg-black/70 border border-white/20 rounded-md">
          {filtered.map(opt => (
            <li
              key={opt}
              className="p-2 cursor-pointer hover:bg-white/20"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
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
  
      setMessage("Record saved successfully ✔");
      setAmount("");
  
      // Auto hide after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save record ❌");
  
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  }
  
  










  return (
    <form onSubmit={submit} className="glass-card mb-6 p-4">
      
      {message && (
  <div className="mb-3 text-green-400 text-sm font-medium">
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
  crops,
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
              const cropName = crops.find(c => c.id === e.crop)?.name || "-";

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
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50 animate-fadeIn">
            <div className="glass-card p-6 w-[90%] max-w-[340px] text-center space-y-4">
              <h2 className="text-lg font-semibold">Delete this expense?</h2>
              <p className="text-sm opacity-70">This action cannot be undone.</p>
              <div className="flex justify-center gap-4 mt-4">
                <button className="glass-btn" onClick={() => setDeleteId(null)}>Cancel</button>
                <button className="glass-btn text-red-400" onClick={() => { onDelete(deleteId); setDeleteId(null); }}>Delete</button>
              </div>
            </div>
          </div>
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


  useEffect(() => {
    fetchAll();
  }, []);




  async function safeFetch(url: string, options: RequestInit = {}) {
    const res = await fetch(url, { ...options, credentials: "include" });
  
    if (res.status === 401) {
      setSessionExpired(true); // trigger popup
      throw new Error("Unauthorized / token expired");
    }
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${text}`);
    }
  
    return res.json();
  }

  
  
  useEffect(() => {
    async function load() {
      try {
        const data = await safeFetch(
          "/.netlify/functions/getCropsTrend"
        );
        setTrends(data);
      } catch (err) {
        console.error(err);
      }
    }
  
    load();
  }, []);
  
 

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
  ;
  setAmounts(a);
}


function CounterCard({
  label,
  value,
  size = 140,
  imgSrc,
}: {
  label: string;
  value: number;
  size?: number;
  imgSrc?: string;
}) {
  const formatted = value.toLocaleString();
  const isTotal = label === "Total";

  // Dynamically shrink font if number is long
  const fontSize =
    formatted.length <= 5
      ? size * 0.22
      : Math.max(size * (0.22 - (formatted.length - 3.5) * 0.02), size * 0.12);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative rounded-full shadow-2xl transition-transform hover:scale-105 hover:shadow-2xl"
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
        }}
      >
        {imgSrc && (
          <img
            src={imgSrc}
            alt="Counter background"
            className="w-full h-full rounded-full object-cover"
          />
        )}

        {/* Number displayed on top */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: isTotal ? "translateY(-6%)" : "none",
          }}
        >
          <span
            className="font-extrabold select-none"
            style={{
              fontSize: `${fontSize}px`,
              color: isTotal ? "#000" : "#fff",
              lineHeight: 1,
            }}
          >
            {formatted}
          </span>
        </div>
      </div>

      {/* Label below counter */}
      <div className="mt-2 text-center text-white font-medium text-sm truncate w-full">
        {label}
      </div>
    </div>
  );
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
  fetchExpenses();
  return res; // IMPORTANT
  
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
  const data = await safeFetch("/.netlify/functions/deleteExpense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });


  if (data.success) {
    console.log(data.message); // "Deleted"
    fetchExpenses();
    
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
const total = expenses.reduce((sum, e) => sum + e.amount, 0);

// Total per crop
const cropTotals: Record<string, number> = {};
expenses.forEach(e => {
  if (!e.crop) return;
  if (!cropTotals[e.crop]) cropTotals[e.crop] = 0;
  cropTotals[e.crop] += e.amount;
});

// Total per user / expender
const userTotals: Record<string, number> = {};
expenses.forEach(e => {
  if (!userTotals[e.expender]) userTotals[e.expender] = 0;
  userTotals[e.expender] += e.amount;
});

const gradients = [
  "from-red-400 to-red-600",
  "from-green-400 to-green-600",
  "from-blue-400 to-blue-600",
  "from-purple-400 to-purple-600",
  "from-yellow-400 to-yellow-500",
];




  return (
    <div className="page-container flex flex-col min-h-screen">
      {/* ================= MENU ================= */}
      <header className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl">📊 Dashboard</h1>

        <div className="flex gap-2 items-center flex-wrap">
          <button
            className="glass-btn"
            onClick={() => navigate("/add-expense?type=user")}
          >
            ➕ User
          </button>

          <button
            className="glass-btn"
            onClick={() => navigate("/add-expense?type=reason")}
          >
            ➕ Reason
          </button>

          <button
            className="glass-btn"
            onClick={() => navigate("/add-expense?type=crop")}
          >
            ➕ Crop
          </button>
          <button
  className="glass-btn"
  onClick={() => navigate("/add-expense?type=amount")}
>
  ➕ Amount
</button>
          <button
            className="glass-btn text-red-400"
            onClick={logout}
          >
            Logout
          </button>

          <ThemeToggle />
        </div>
      </header>

{/* ================= COUNTERS ================= */}

<div className="glass-card p-4 mb-6 flex flex-wrap gap-6 justify-center">
  {/* Main Total */}
  <CounterCard
    label="Total"
    value={expenses.reduce((sum, e) => sum + e.amount, 0)}
    size={140}
    imgSrc="/mainCounter.png" // <-- public folder path
  />

  {/* Crop totals */}
  {crops.map(c => {
    const total = expenses
      .filter(e => e.crop === c.name)
      .reduce((sum, e) => sum + e.amount, 0);
      console.log(total)
    return (
      <CounterCard
        key={c.name}
        label={c.name}
        value={total}
        imgSrc="/normalCounter.png"
      />
    );
  })}

  {/* User totals */}
  {users.map(u => {
    const total = expenses
      .filter(e => e.expender === u)
      .reduce((sum, e) => sum + e.amount, 0);
    return (
      <CounterCard
        key={u}
        label={u}
        value={total}
        imgSrc="/normalCounter.png"
      />
    );
  })}
</div>




      {/* ================= CONTENT ================= */}
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

<div className="glass-card p-4 mt-4">
  <h2 className="text-center mb-2">Daily Expenses Overview</h2>
  <div className="w-full" style={{ height: "400px" }}>
    <ExpenseChart trends={trends} />
  </div>
</div>

{sessionExpired && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50 animate-fadeIn">
    <div className="glass-card p-6 w-[90%] max-w-[340px] text-center space-y-4">
      <h2 className="text-lg font-semibold">Session Expired</h2>
      <p className="text-sm opacity-70">Your session has expired. Please login again.</p>
      <div className="flex justify-center gap-4 mt-4">
        <button
          className="glass-btn"
          onClick={() => setSessionExpired(false)}
        >
          Close
        </button>
        <button
          className="glass-btn text-red-400"
          onClick={() => navigate("/login")}
        >
          Login
        </button>
      </div>
    </div>
  </div>
)}




    </div>
  );
}

