import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";

export default function AddExpense() {
  const [user, setUser] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [crop, setCrop] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [savedAmounts, setSavedAmounts] = useState<number[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [status, setStatus] = useState<null | {
    type: "success" | "error";
    message: string;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "expense";

  async function loadUsers() {
    const r = await fetch(`${API}/getUsers`, { credentials: "include" });
    if (r.ok) setUsers(await r.json());
  }

  useEffect(() => {
    if (type === "user") loadUsers().catch(console.error);
    if (type === "reason") {
      fetch(`${API}/getReasons`, { credentials: "include" })
        .then((r) => r.json())
        .then(setReasons)
        .catch(console.error);
    }
    if (type === "amount") {
      fetch(`${API}/getAmounts`, { credentials: "include" })
        .then((r) => r.json())
        .then(setSavedAmounts)
        .catch(console.error);
    }
    if (type === "crop") {
      fetch(`${API}/getCrops`, { credentials: "include" })
        .then((r) => r.json())
        .then((c) => setCrops(c.map((x: { name: string }) => x.name)))
        .catch(console.error);
    }
  }, [type]);

  async function deleteUser(username: string) {
    setDeleting(username);
    void unlockAudio();
    try {
      const res = await fetch(`${API}/deleteUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error(await res.text());
      play("delete");
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      play("error");
      setStatus({ type: "error", message: err.message || "Delete failed" });
    } finally {
      setDeleting(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    void unlockAudio();
    play("click");

    try {
      let res: Response;

      if (type === "user") {
        res = await fetch(`${API}/addUser`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: user, password }),
        });
      } else if (type === "reason") {
        res = await fetch(`${API}/addReason`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason }),
        });
      } else if (type === "amount") {
        res = await fetch(`${API}/addAmount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: Number(amount) }),
        });
      } else if (type === "crop") {
        res = await fetch(`${API}/addCrop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: crop }),
        });
      } else {
        throw new Error("Invalid type");
      }

      if (!res.ok) {
        throw new Error((await res.text()) || "Failed");
      }

      play("save");
      setStatus({ type: "success", message: "Saved successfully" });
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err: any) {
      play("error");
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(`${API}/logout`, { method: "POST", credentials: "include" });
    navigate("/login");
  }

  const list =
    type === "user"
      ? users
      : type === "reason"
        ? reasons
        : type === "amount"
          ? savedAmounts
          : crops;

  return (
    <div className="page-container animate-rise">
      <header className="mb-6 grid grid-cols-3 items-center">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-btn w-fit"
          aria-label="Go back"
        >
          ← Back
        </button>
        <h2 className="font-display text-2xl text-center text-gold capitalize">
          Add {type}
        </h2>
        <div className="text-right flex justify-end gap-2">
          <SoundToggle />
          <button onClick={logout} className="glass-btn text-red-400">
            Logout
          </button>
        </div>
      </header>

      <form onSubmit={submit} className="glass-card max-w-md mx-auto">
        {status && (
          <div
            className={`mb-3 p-2 rounded text-sm ${
              status.type === "success"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-red-500/15 text-red-300"
            }`}
          >
            {status.message}
          </div>
        )}

        {type === "user" && (
          <>
            <input
              className="glass-input mb-3"
              placeholder="Username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
            <input
              className="glass-input mb-3"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}

        {type === "reason" && (
          <input
            className="glass-input mb-3"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        )}

        {type === "amount" && (
          <input
            className="glass-input mb-3"
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        )}

        {type === "crop" && (
          <input
            className="glass-input mb-3"
            placeholder="Crop name"
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            required
          />
        )}

        <button className="glass-btn gold-btn w-full mb-4" disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </button>

        <div className="border-t border-[var(--glass-border)] pt-3">
          <p className="text-sm text-gold-muted mb-2">Existing {type}s</p>
          <div className="max-h-48 overflow-y-auto text-sm space-y-1 custom-scroll">
            {list.map((v, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                <span className="opacity-90 truncate">• {String(v)}</span>
                {type === "user" && (
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 shrink-0 px-1"
                    disabled={deleting === String(v)}
                    onClick={() => setUserToDelete(String(v))}
                    aria-label={`Delete ${v}`}
                    title="Delete user"
                  >
                    {deleting === String(v) ? "…" : "✕"}
                  </button>
                )}
              </div>
            ))}
            {list.length === 0 && (
              <p className="text-gold-muted/70 text-xs">None yet</p>
            )}
          </div>
        </div>
      </form>

      <ConfirmModal
        open={!!userToDelete}
        title="Delete user?"
        message={
          userToDelete
            ? `Remove “${userToDelete}”? Past records will keep the name.`
            : undefined
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onCancel={() => !deleting && setUserToDelete(null)}
        onConfirm={() => {
          if (userToDelete && !deleting) void deleteUser(userToDelete);
        }}
      />
    </div>
  );
}
