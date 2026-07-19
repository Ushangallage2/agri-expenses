import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";

type DeleteTarget =
  | { kind: "user"; value: string }
  | { kind: "crop"; value: string }
  | { kind: "reason"; value: string }
  | null;

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
  const [deleting, setDeleting] = useState(false);
  const [toDelete, setToDelete] = useState<DeleteTarget>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "expense";

  async function loadUsers() {
    const r = await fetch(`${API}/getUsers`, { credentials: "include" });
    if (r.ok) setUsers(await r.json());
  }

  async function loadReasons() {
    const r = await fetch(`${API}/getReasons`, { credentials: "include" });
    if (r.ok) setReasons(await r.json());
  }

  async function loadCrops() {
    const r = await fetch(`${API}/getCrops`, { credentials: "include" });
    if (r.ok) {
      const c = await r.json();
      setCrops(c.map((x: { name: string }) => x.name));
    }
  }

  useEffect(() => {
    if (type === "user") loadUsers().catch(console.error);
    if (type === "reason") loadReasons().catch(console.error);
    if (type === "amount") {
      fetch(`${API}/getAmounts`, { credentials: "include" })
        .then((r) => r.json())
        .then(setSavedAmounts)
        .catch(console.error);
    }
    if (type === "crop") loadCrops().catch(console.error);
  }, [type]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    void unlockAudio();
    try {
      let res: Response;
      if (toDelete.kind === "user") {
        res = await fetch(`${API}/deleteUser`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: toDelete.value }),
        });
      } else if (toDelete.kind === "crop") {
        res = await fetch(`${API}/deleteCrop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: toDelete.value }),
        });
      } else {
        res = await fetch(`${API}/deleteReason`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason: toDelete.value }),
        });
      }

      if (!res.ok) throw new Error(await res.text());
      play("delete");
      setToDelete(null);

      if (toDelete.kind === "user") await loadUsers();
      else if (toDelete.kind === "crop") await loadCrops();
      else await loadReasons();
    } catch (err: any) {
      play("error");
      setStatus({ type: "error", message: err.message || "Delete failed" });
    } finally {
      setDeleting(false);
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

  const canDeleteItem = type === "user" || type === "crop" || type === "reason";

  const deleteTitle =
    toDelete?.kind === "user"
      ? "Delete user?"
      : toDelete?.kind === "crop"
        ? "Delete crop?"
        : toDelete?.kind === "reason"
          ? "Delete reason?"
          : "Delete?";

  const deleteMessage = toDelete
    ? toDelete.kind === "crop"
      ? `Remove “${toDelete.value}” from crops? Notes for this crop will be removed. Past ledger records keep the name.`
      : toDelete.kind === "reason"
        ? `Remove “${toDelete.value}”? Past ledger records keep the reason text.`
        : `Remove “${toDelete.value}”? Past records will keep the name.`
    : undefined;

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
                {type === "crop" ? (
                  <button
                    type="button"
                    className="opacity-90 truncate text-left text-gold hover:underline bg-transparent border-0 p-0 cursor-pointer flex-1 min-w-0"
                    onClick={() =>
                      navigate(`/crops/${encodeURIComponent(String(v))}/notes`)
                    }
                    title="Open notes & images"
                  >
                    • {String(v)} →
                  </button>
                ) : (
                  <span className="opacity-90 truncate">• {String(v)}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {type === "crop" && (
                    <button
                      type="button"
                      className="text-gold/90 hover:text-[var(--gold-bright)] text-xs px-2 py-1 rounded-lg border border-[var(--glass-border)]"
                      onClick={() =>
                        navigate(`/crops/${encodeURIComponent(String(v))}/notes`)
                      }
                      title="Notes & images"
                    >
                      Notes
                    </button>
                  )}
                  {canDeleteItem && (
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 px-1"
                      disabled={deleting}
                      onClick={() =>
                        setToDelete({
                          kind: type as "user" | "crop" | "reason",
                          value: String(v),
                        })
                      }
                      aria-label={`Delete ${v}`}
                      title={`Delete ${type}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <p className="text-gold-muted/70 text-xs">None yet</p>
            )}
          </div>
        </div>
      </form>

      <ConfirmModal
        open={!!toDelete}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onCancel={() => !deleting && setToDelete(null)}
        onConfirm={() => {
          if (toDelete && !deleting) void confirmDelete();
        }}
      />
    </div>
  );
}
