import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function AddExpense() {
  const [user, setUser] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [crop, setCrop] = useState("");

  const [users, setUsers] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [savedAmounts, setSavedAmounts] = useState<number[]>([]);
  const [crops, setCrops] = useState<string[]>([]); // optional if endpoint exists

  const [status, setStatus] = useState<null | {
    type: "success" | "error";
    message: string;
  }>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "expense";

  /* ================= FETCH DATA ================= */
  useEffect(() => {
    if (type === "user") {
    fetch("/.netlify/functions/getUsers", { credentials: "include" })
      .then(r => r.json())
      .then(setUsers)
      .catch(console.error);
    }
    if (type === "reason") {
    fetch("/.netlify/functions/getReasons", { credentials: "include" })
      .then(r => r.json())
      .then(setReasons)
      .catch(console.error);
    }
    if (type === "amount") {
    fetch("/.netlify/functions/getAmounts", { credentials: "include" })
      .then(r => r.json())
      .then(setSavedAmounts)
      .catch(console.error);
    }
    if (type === "crop") {
      fetch("/.netlify/functions/getCrops", { credentials: "include" })
        .then(r => r.json())
        .then((c) => setCrops(c.map((x: any) => x.name)))
        .catch(console.error);
    }
  }, [type]);

  /* ================= SUBMIT ================= */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      let res: Response;

      if (type === "user") {
        res = await fetch("/.netlify/functions/addUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user }),
        });
      } else if (type === "reason") {
        res = await fetch("/.netlify/functions/addReason", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason }),
        });
      } else if (type === "amount") {
        res = await fetch("/.netlify/functions/addAmount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: Number(amount) }),
        });
      } else if (type === "crop") {
        res = await fetch("/.netlify/functions/addCrop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: crop }),
        });
      } else {
        throw new Error("Invalid type");
      }

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed");
      }

      setStatus({ type: "success", message: "Saved successfully ✅" });

      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err: any) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }

  /* ================= LOGOUT ================= */
  async function logout() {
    await fetch("/.netlify/functions/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/login");
  }

  /* ================= UI ================= */
  return (
    <div className="page-container">
      {/* HEADER */}
      <header className="mb-4 grid grid-cols-3 items-center">
      <button
  type="button"
  onClick={() => navigate(-1)}
  aria-label="Go back"
  className="
    flex items-center justify-center
    w-20 h-10
    rounded-lg
    glass-card
    hover:bg-white/20
    active:scale-95
  "
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
</button>

        <h2 className="text-xl text-center capitalize">Add {type}</h2>
        <div className="text-right">
          <button onClick={logout} className="glass-btn text-red-400">
            Logout
          </button>
        </div>
      </header>

      <form onSubmit={submit} className="glass-card max-w-md mx-auto">
        {/* STATUS */}
        {status && (
          <div
            className={`mb-3 p-2 rounded text-sm ${
              status.type === "success"
                ? "bg-green-500/20 text-green-300"
                : "bg-red-500/20 text-red-300"
            }`}
          >
            {status.message}
          </div>
        )}

        {type === "user" && (
          <input className="glass-input mb-3" placeholder="User name" value={user} onChange={e => setUser(e.target.value)} required />
        )}

        {type === "reason" && (
          <input className="glass-input mb-3" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} required />
        )}

        {type === "amount" && (
          <input className="glass-input mb-3" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} required />
        )}

        {type === "crop" && (
          <input className="glass-input mb-3" placeholder="Crop name" value={crop} onChange={e => setCrop(e.target.value)} required />
        )}

        <button className="glass-btn w-full mb-4" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>

        {/* EXISTING LIST */}
        {(type === "user" || type === "reason" || type === "amount" || type === "crop") && (
          <div className="border-t border-white/20 pt-3">
            <p className="text-sm opacity-70 mb-2">Existing {type}s</p>

            <div className="max-h-40 overflow-y-auto text-sm space-y-1">
              {(type === "user" ? users :
                type === "reason" ? reasons :
                type === "amount" ? savedAmounts :
                crops
              ).map((v, i) => (
                <div key={i} className="opacity-80">
                  • {v}
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
