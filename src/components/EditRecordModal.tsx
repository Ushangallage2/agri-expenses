import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { play, unlockAudio } from "../utils/sounds";
import { compressImageFile } from "../utils/imageCompress";

export type EditableExpense = {
  id: string | number;
  expender: string;
  reason: string;
  crop: string | null;
  amount: number;
  created_at: string;
  has_receipt?: boolean;
};

type Crop = { id: string; name: string };

function toDateInput(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EditRecordModal({
  open,
  record,
  users,
  reasons,
  crops,
  amounts,
  onClose,
  onSave,
}: {
  open: boolean;
  record: EditableExpense | null;
  users: string[];
  reasons: string[];
  crops: Crop[];
  amounts: number[];
  onClose: () => void;
  onSave: (payload: {
    id: string | number;
    user: string;
    reason: string;
    crop: string;
    amount: number;
    date: string;
    receiptData?: string | null;
    receiptMime?: string | null;
    clearReceipt?: boolean;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [user, setUser] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [crop, setCrop] = useState("");
  const [date, setDate] = useState("");
  const [hadReceipt, setHadReceipt] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string | null>(null);
  const [clearReceipt, setClearReceipt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !record) return;
    setType(record.amount < 0 ? "expense" : "income");
    setUser(record.expender || "");
    setReason(record.reason || "");
    setAmount(String(Math.abs(Number(record.amount))));
    setCrop(record.crop || "");
    setDate(toDateInput(record.created_at));
    setHadReceipt(Boolean(record.has_receipt));
    setReceiptPreview(null);
    setReceiptMime(null);
    setClearReceipt(false);
    setError(null);
  }, [open, record]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !record || typeof document === "undefined") return null;

  const isValid = user && reason && amount && crop && date && !Number.isNaN(Number(amount));

  async function onReceiptFile(file: File | null) {
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await compressImageFile(file);
      setReceiptPreview(dataUrl);
      setReceiptMime(mimeType);
      setClearReceipt(false);
      play("click");
    } catch (err: any) {
      play("error");
      setError(err.message || "Could not read receipt image");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !record) return;
    void unlockAudio();
    play("click");
    setLoading(true);
    setError(null);
    try {
      const signed =
        type === "expense"
          ? -Math.abs(Number(amount))
          : Math.abs(Number(amount));
      const payload: Parameters<typeof onSave>[0] = {
        id: record.id,
        user,
        reason,
        crop,
        amount: signed,
        date,
      };
      if (clearReceipt) {
        payload.clearReceipt = true;
      } else if (receiptPreview) {
        payload.receiptData = receiptPreview;
        payload.receiptMime = receiptMime || "image/jpeg";
      }
      await onSave(payload);
      play("save");
      onClose();
    } catch (err: any) {
      play("error");
      setError(err.message || "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  const showingExisting = hadReceipt && !clearReceipt && !receiptPreview;

  return createPortal(
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <form
        className="confirm-panel glass-card animate-rise edit-record-panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="confirm-panel__body space-y-3">
          <p className="eyebrow text-center">Edit ledger entry</p>
          <h2 className="font-display text-2xl sm:text-3xl text-gold glow-text text-center">
            Update record
          </h2>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Type</span>
            <select
              className="glass-input"
              value={type}
              onChange={(e) => setType(e.target.value as "expense" | "income")}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">User</span>
            <select
              className="glass-input"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Reason</span>
            <input
              className="glass-input"
              list="edit-reasons"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <datalist id="edit-reasons">
              {reasons.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Amount</span>
            <input
              className="glass-input"
              list="edit-amounts"
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <datalist id="edit-amounts">
              {amounts.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Crop</span>
            <select
              className="glass-input"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              required
            >
              <option value="">Select crop</option>
              {crops.map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Date</span>
            <input
              type="date"
              className="glass-input date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <div className="block text-sm">
            <span className="eyebrow mb-2 block">Receipt (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="glass-btn cursor-pointer text-sm">
                {showingExisting || receiptPreview
                  ? "Replace receipt"
                  : "Add receipt"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onReceiptFile(e.target.files?.[0] || null)}
                />
              </label>
              {showingExisting && (
                <span className="text-xs text-sky-300">Receipt on file</span>
              )}
              {receiptPreview && (
                <img
                  src={receiptPreview}
                  alt="New receipt"
                  className="h-12 w-12 rounded-lg object-cover border border-[var(--glass-border)]"
                />
              )}
              {(showingExisting || receiptPreview) && (
                <button
                  type="button"
                  className="glass-btn text-red-300 text-sm"
                  onClick={() => {
                    setReceiptPreview(null);
                    setReceiptMime(null);
                    setClearReceipt(true);
                    setHadReceipt(false);
                  }}
                >
                  Remove receipt
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="confirm-panel__actions">
          <button type="button" className="glass-btn confirm-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`glass-btn gold-btn confirm-btn ${!isValid || loading ? "opacity-50" : ""}`}
            disabled={!isValid || loading}
          >
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
