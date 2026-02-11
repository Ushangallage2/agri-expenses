import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import ExpenseChart from "../components/ExpenseChart";
import ThemeToggle from "../components/ThemeToggle";

/* ======================= TYPES ======================= */
type Expense = {
  id: string;
  amount: number;
  reason: string;
  user: string;
  crop?: string;      // joined name
  crop_id?: string;   // FK
  created_at: string;
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


  const isValid = user && reason && amount && crop;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
  
    const payload = {
      user,
      reason,
      crop,
      amount: type === "expense"
        ? -Math.abs(Number(amount))
        : Math.abs(Number(amount)),
    };
  
    console.log("Submitting payload:", payload);
  
    onAdd(payload);
    setAmount("");
  }
  










  return (
    <form onSubmit={submit} className="glass-card mb-6 p-4">
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

        <button className={`glass-btn ${!isValid ? "opacity-50" : ""}`} disabled={!isValid}>
          Save
        </button>
      </div>
    </form>
  );
}

/* ======================= EXPENSE TABLE ======================= */
function ExpenseTable({
  expenses,
  crops, 
  onDelete,
  onUpdateCrop,
}: {
  expenses: Expense[];
  crops: Crop[];
  amounts: number[];
  onDelete: (id: string) => void;
  onUpdateCrop: (id: string, crop_id: string) => void;
}) {
  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-white/10">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Crop</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id} className="border-t border-white/10">
                <td className="p-3">{e.user}</td>
                <td className="p-3">{e.reason}</td>
                <td className="p-3">
                  <select
                    className="glass-input"
                    value={e.crop_id || ""}
                    onChange={(ev) => onUpdateCrop(e.id, ev.target.value)}
                  >
                    <option value="">Select crop</option>
                    {crops.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </td>
                <td className={`p-3 text-right ${e.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                  {e.amount}
                </td>
                <td className="p-3 text-sm opacity-70">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => window.confirm("Delete this expense?") && onDelete(e.id)}
                    className="text-red-400"
                  >
                    ✖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  useEffect(() => {
    fetchAll();
  }, []);


  async function fetchAll() {
    const [u, r, c, e, a ] = await Promise.all([
      fetch("/.netlify/functions/getUsers", { credentials: "include" }).then(r => r.json()),
      fetch("/.netlify/functions/getReasons", { credentials: "include" }).then(r => r.json()),
      fetch("/.netlify/functions/getCrops", { credentials: "include" }).then(r => r.json()),
      fetch("/.netlify/functions/getExpenses", { credentials: "include" }).then(r => r.json()),
      fetch("/.netlify/functions/getAmounts", { credentials: "include" }).then(r => r.json()),
    ]);

    setUsers(u);
    setReasons(r);
    setCrops(c);
    setExpenses(e);
    setAmounts(a);
  }


  async function fetchExpenses() {
    const e = await fetch("/.netlify/functions/getExpenses", {
      credentials: "include",
    }).then(r => r.json());
  
    setExpenses(e);
  }
  

  async function addRecord(data: any) {
    await fetch("/.netlify/functions/addExpense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    fetchExpenses();
  }

  async function updateCrop(id: string, crop_id: string) {
    await fetch("/.netlify/functions/updateExpenseCrop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, crop_id }),
    });
    fetchAll();
  }

  async function deleteRecord(id: string) {
    await fetch("/.netlify/functions/deleteExpense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    fetchExpenses();
  }

  async function logout() {
    await fetch("/.netlify/functions/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/login");
  }

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
        <h2 className="text-center mb-2">Expenses Overview</h2>
        <div className="h-24">
          <ExpenseChart expenses={expenses} />
        </div>
      </div>
    </div>
  );
}

