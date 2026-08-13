import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "../utils/api";
import Money from "./Money";
import ConfirmModal from "./ConfirmModal";
import { play, unlockAudio } from "../utils/sounds";
import { invalidateCache } from "../utils/clientCache";

type Fertilizer = {
  id: number;
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string | null;
  created_at: string;
};

type SetItem = {
  fertilizer_id: number;
  fertilizer_name?: string | null;
  amount: number;
  unit: string;
  sort_order?: number;
};

type PesticideSet = {
  id: number;
  name: string;
  description: string | null;
  items: SetItem[];
};

type UseLine = {
  id: number;
  fertilizer_name: string;
  amount: number;
  unit: string;
  unit_price: number;
  line_cost: number;
};

type UseLog = {
  id: number;
  batch_id: string;
  set_name: string | null;
  description: string | null;
  note: string | null;
  crop_name: string | null;
  applied_at: string;
  created_by: string | null;
  lines: UseLine[];
  total_cost: number;
};

type DraftLine = {
  fertilizerId: string;
  amount: string;
  unit: string;
};

type Props = {
  isAdmin: boolean;
  fertilizers: Fertilizer[];
  crops: string[];
  onFertilizersUpdate: (next: Fertilizer[]) => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
  navigateLogin: () => void;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function readError(res: Response) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j?.error || text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export default function PesticidesTab({
  isAdmin,
  fertilizers,
  crops,
  onFertilizersUpdate,
  onError,
  onMessage,
  navigateLogin,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<PesticideSet[]>([]);
  const [logs, setLogs] = useState<UseLog[]>([]);
  const [saving, setSaving] = useState(false);

  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [editSetId, setEditSetId] = useState<number | null>(null);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { fertilizerId: "", amount: "", unit: "ml" },
  ]);

  const [useCrop, setUseCrop] = useState("");
  const [useNote, setUseNote] = useState("");
  const [useDescription, setUseDescription] = useState("");
  const [useDate, setUseDate] = useState(todayISO());
  const [useLines, setUseLines] = useState<DraftLine[]>([
    { fertilizerId: "", amount: "", unit: "ml" },
  ]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [confirmDeleteSet, setConfirmDeleteSet] = useState<number | null>(null);
  const [confirmUseSet, setConfirmUseSet] = useState<PesticideSet | null>(null);

  const fertById = useMemo(() => {
    const m = new Map<number, Fertilizer>();
    for (const f of fertilizers) m.set(f.id, f);
    return m;
  }, [fertilizers]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/getPesticideBootstrap");
      if (res.status === 401) {
        navigateLogin();
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setSets(Array.isArray(data.sets) ? data.sets : []);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e: any) {
      onError(e?.message || "Failed to load pesticides");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetSetForm() {
    setEditSetId(null);
    setSetName("");
    setSetDescription("");
    setDraftLines([{ fertilizerId: "", amount: "", unit: "ml" }]);
  }

  function loadSetIntoEditor(s: PesticideSet) {
    setEditSetId(s.id);
    setSetName(s.name);
    setSetDescription(s.description || "");
    setDraftLines(
      s.items.length
        ? s.items.map((it) => ({
            fertilizerId: String(it.fertilizer_id),
            amount: String(it.amount),
            unit: it.unit || "ml",
          }))
        : [{ fertilizerId: "", amount: "", unit: "ml" }]
    );
  }

  function loadSetIntoUse(s: PesticideSet) {
    setActiveSetId(s.id);
    setUseDescription(s.description || "");
    setUseLines(
      s.items.map((it) => {
        const f = fertById.get(it.fertilizer_id);
        return {
          fertilizerId: String(it.fertilizer_id),
          amount: String(it.amount),
          unit: it.unit || f?.unit || "ml",
        };
      })
    );
  }

  async function saveSet(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const items = draftLines
      .map((l) => ({
        fertilizerId: Number(l.fertilizerId),
        amount: Number(l.amount),
        unit: l.unit.trim() || "ml",
      }))
      .filter((l) => l.fertilizerId > 0 && l.amount > 0);
    if (!setName.trim()) {
      onError("Set name is required");
      return;
    }
    if (!items.length) {
      onError("Add at least one inventory item with volume");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    onError("");
    try {
      const res = await apiFetch("/savePesticideSet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editSetId,
          name: setName.trim(),
          description: setDescription.trim() || null,
          items,
        }),
      });
      if (res.status === 401) {
        navigateLogin();
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setSets(Array.isArray(data.sets) ? data.sets : []);
      invalidateCache("pesticide");
      invalidateCache("fertilizer");
      play("success");
      onMessage(
        editSetId
          ? `Updated pesticide set “${setName.trim()}”.`
          : `Saved pesticide set “${setName.trim()}”.`
      );
      resetSetForm();
    } catch (err: any) {
      play("error");
      onError(err?.message || "Failed to save set");
    } finally {
      setSaving(false);
    }
  }

  async function removeSet(id: number) {
    if (!isAdmin) return;
    setSaving(true);
    onError("");
    try {
      const res = await apiFetch("/deletePesticideSet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) {
        navigateLogin();
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setSets(Array.isArray(data.sets) ? data.sets : []);
      if (editSetId === id) resetSetForm();
      if (activeSetId === id) {
        setActiveSetId(null);
        setUseLines([{ fertilizerId: "", amount: "", unit: "ml" }]);
      }
      invalidateCache("pesticide");
      play("success");
      onMessage("Pesticide set deleted.");
    } catch (err: any) {
      play("error");
      onError(err?.message || "Delete failed");
    } finally {
      setSaving(false);
      setConfirmDeleteSet(null);
    }
  }

  async function applyUse(fromSet: PesticideSet | null) {
    if (!isAdmin) return;
    const lines = (fromSet
      ? useLines
      : useLines
    )
      .map((l) => ({
        fertilizerId: Number(l.fertilizerId),
        amount: Number(l.amount),
        unit: l.unit.trim() || "ml",
      }))
      .filter((l) => l.fertilizerId > 0 && l.amount > 0);

    if (!lines.length) {
      onError("Add at least one product with volume");
      return;
    }

    void unlockAudio();
    play("click");
    setSaving(true);
    onError("");
    try {
      const res = await apiFetch("/applyPesticideUse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: fromSet?.id ?? activeSetId,
          cropName: useCrop || null,
          note: useNote.trim() || null,
          description:
            useDescription.trim() || fromSet?.description || null,
          appliedAt: useDate,
          lines,
        }),
      });
      if (res.status === 401) {
        navigateLogin();
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      if (Array.isArray(data.fertilizers)) onFertilizersUpdate(data.fertilizers);
      if (Array.isArray(data.logs)) setLogs(data.logs);
      invalidateCache("pesticide");
      invalidateCache("fertilizer");
      play("save");
      const cost =
        Number(data.totalCost) > 0
          ? ` · logged cost ${Number(data.totalCost).toLocaleString()} (price snapshot)`
          : "";
      onMessage(
        `Pesticide use logged${fromSet || activeSetId ? " from set" : ""}${cost}. Stock updated.`
      );
      setUseNote("");
      setConfirmUseSet(null);
    } catch (err: any) {
      play("error");
      onError(err?.message || "Apply failed");
    } finally {
      setSaving(false);
    }
  }

  function lineEditor(
    lines: DraftLine[],
    setLines: (fn: (prev: DraftLine[]) => DraftLine[]) => void
  ) {
    return (
      <div className="space-y-2">
        {lines.map((line, idx) => {
          const fert = fertById.get(Number(line.fertilizerId));
          return (
            <div
              key={idx}
              className="rounded-xl border border-red-400/25 bg-red-950/20 p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <label className="sm:col-span-5 block">
                <span className="eyebrow mb-1 block">Inventory item</span>
                <select
                  className="glass-input"
                  value={line.fertilizerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const f = fertById.get(Number(id));
                    setLines((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              fertilizerId: id,
                              unit: f?.unit || r.unit || "ml",
                            }
                          : r
                      )
                    );
                  }}
                >
                  <option value="">Select…</option>
                  {fertilizers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {f.stock_qty} {f.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-3 block">
                <span className="eyebrow mb-1 block">Volume</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="glass-input"
                  value={line.amount}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, amount: e.target.value } : r
                      )
                    )
                  }
                />
              </label>
              <label className="sm:col-span-2 block">
                <span className="eyebrow mb-1 block">Unit</span>
                <input
                  className="glass-input"
                  value={line.unit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, unit: e.target.value } : r
                      )
                    )
                  }
                  placeholder="ml / g / L"
                />
              </label>
              <div className="sm:col-span-2 flex gap-2">
                <button
                  type="button"
                  className="glass-btn text-sm w-full"
                  disabled={lines.length <= 1}
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  Remove
                </button>
              </div>
              {fert && (
                <p className="sm:col-span-12 text-[11px] text-red-200/80 tabular-nums">
                  Stock {fert.stock_qty} {fert.unit}
                  {Number(fert.unit_price) > 0 ? (
                    <>
                      {" "}
                      · current price <Money value={fert.unit_price} />/{fert.unit}{" "}
                      (snapshotted on Use)
                    </>
                  ) : (
                    " · no unit price set"
                  )}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="glass-btn glass-btn-red text-sm"
          onClick={() => {
            play("click");
            setLines((prev) => [
              ...prev,
              { fertilizerId: "", amount: "", unit: "ml" },
            ]);
          }}
        >
          + Add item
        </button>
      </div>
    );
  }

  if (loading) {
    return <p className="text-gold-muted">Loading pesticides…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-red-400/40 bg-gradient-to-br from-red-950/50 to-black/40 px-4 py-3">
        <p className="text-sm text-red-100/95 leading-relaxed">
          Universal pesticide mixes — pick inventory items, volumes, why you use
          the set, and optional crop/note.{" "}
          <strong className="text-red-50">Use</strong> a saved set or apply a
          new entry. Logged prices are frozen at apply time and won&apos;t change
          if you update inventory prices later.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="glass-card space-y-4 border border-red-400/30">
          <div>
            <p className="eyebrow text-red-300/90">Saved sets</p>
            <h2 className="font-display text-xl text-red-200">
              Usual pesticide mixes
            </h2>
          </div>

          {sets.length === 0 ? (
            <p className="text-sm text-gold-muted">No saved sets yet.</p>
          ) : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scroll pr-1">
              {sets.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-red-400/30 bg-red-950/25 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-red-100">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-gold-muted mt-1 leading-relaxed">
                          {s.description}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="glass-btn red-btn text-sm"
                          disabled={saving}
                          onClick={() => {
                            play("click");
                            loadSetIntoUse(s);
                            setConfirmUseSet(s);
                          }}
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          className="glass-btn text-sm"
                          onClick={() => {
                            play("click");
                            loadSetIntoEditor(s);
                            loadSetIntoUse(s);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="glass-btn text-sm text-red-200 border-red-400/40"
                          onClick={() => {
                            play("click");
                            setConfirmDeleteSet(s.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <ul className="text-xs text-red-100/85 space-y-0.5 tabular-nums">
                    {s.items.map((it, i) => (
                      <li key={`${s.id}-${i}`}>
                        {it.fertilizer_name || `#${it.fertilizer_id}`}:{" "}
                        {it.amount} {it.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <form onSubmit={saveSet} className="space-y-3 pt-2 border-t border-red-400/20">
              <p className="text-sm font-medium text-red-100">
                {editSetId ? "Edit set" : "Save new set"}
              </p>
              <label className="block">
                <span className="eyebrow mb-1 block">Set name</span>
                <input
                  className="glass-input"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="e.g. Leaf spot spray"
                  required
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">
                  Why this set is used
                </span>
                <textarea
                  className="glass-input min-h-[72px]"
                  value={setDescription}
                  onChange={(e) => setSetDescription(e.target.value)}
                  placeholder="Disease / pest / preventive reason…"
                />
              </label>
              {lineEditor(draftLines, setDraftLines)}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="glass-btn red-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editSetId
                      ? "Update set"
                      : "Save set"}
                </button>
                {editSetId && (
                  <button
                    type="button"
                    className="glass-btn"
                    onClick={() => {
                      play("click");
                      resetSetForm();
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        <section className="glass-card space-y-4 border border-red-400/30">
          <div>
            <p className="eyebrow text-red-300/90">Apply</p>
            <h2 className="font-display text-xl text-red-200">
              Use set or new entry
            </h2>
            <p className="text-xs text-gold-muted mt-1 leading-relaxed">
              Works for any crop (optional). Stock deducts on apply; costs are
              logged from current prices and stay fixed in history.
            </p>
          </div>

          {!isAdmin ? (
            <p className="text-sm text-gold-muted">Observe — view only.</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void applyUse(null);
              }}
            >
              <label className="block">
                <span className="eyebrow mb-1 block">Crop (optional)</span>
                <select
                  className="glass-input"
                  value={useCrop}
                  onChange={(e) => setUseCrop(e.target.value)}
                >
                  <option value="">Any / not crop-specific</option>
                  {crops.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">Date</span>
                <input
                  type="date"
                  className="glass-input date-input"
                  value={useDate}
                  onChange={(e) => setUseDate(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">Why / description</span>
                <textarea
                  className="glass-input min-h-[64px]"
                  value={useDescription}
                  onChange={(e) => setUseDescription(e.target.value)}
                  placeholder="Why this mix is used today…"
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">Note</span>
                <input
                  className="glass-input"
                  value={useNote}
                  onChange={(e) => setUseNote(e.target.value)}
                  placeholder="Weather, area sprayed…"
                />
              </label>
              {activeSetId != null && (
                <p className="text-xs text-red-200/90">
                  Loaded from set #
                  {activeSetId}
                  {" — "}
                  volumes editable before apply.
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      setActiveSetId(null);
                      setUseLines([
                        { fertilizerId: "", amount: "", unit: "ml" },
                      ]);
                      setUseDescription("");
                    }}
                  >
                    Clear set
                  </button>
                </p>
              )}
              {lineEditor(useLines, setUseLines)}
              <button
                type="submit"
                className="glass-btn red-btn w-full"
                disabled={saving}
              >
                {saving ? "Applying…" : "Apply & reduce stock"}
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="glass-card border border-red-400/25 space-y-3">
        <div>
          <p className="eyebrow text-red-300/90">History</p>
          <h2 className="font-display text-xl text-red-200">
            Pesticide use log
          </h2>
          <p className="text-xs text-gold-muted mt-1">
            Prices shown here are snapshots from the day of use.
          </p>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-gold-muted">No pesticide uses logged yet.</p>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scroll pr-1">
            {logs.map((log) => (
              <div
                key={log.batch_id}
                className="rounded-xl border border-red-400/20 bg-black/25 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-red-100 font-medium">
                    {log.set_name || "Ad-hoc mix"}
                    {log.crop_name ? ` · ${log.crop_name}` : ""}
                  </span>
                  <span className="text-gold-muted tabular-nums text-xs">
                    {String(log.applied_at).replace("T", " ").slice(0, 16)}
                    {log.created_by ? ` · ${log.created_by}` : ""}
                  </span>
                </div>
                {log.description && (
                  <p className="text-xs text-gold-muted leading-relaxed">
                    {log.description}
                  </p>
                )}
                {log.note && (
                  <p className="text-xs text-red-100/80">Note: {log.note}</p>
                )}
                <ul className="text-xs text-red-100/90 space-y-0.5 tabular-nums">
                  {log.lines.map((ln) => (
                    <li key={ln.id}>
                      {ln.fertilizer_name}: {ln.amount} {ln.unit}
                      {ln.unit_price > 0 ? (
                        <>
                          {" "}
                          · @ <Money value={ln.unit_price} /> →{" "}
                          <Money value={ln.line_cost} />
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {log.total_cost > 0 && (
                  <p className="text-sm text-amber-200/95 tabular-nums">
                    Logged total <Money value={log.total_cost} />
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirmDeleteSet != null}
        title="Delete pesticide set?"
        message="Removes the saved mix. Past use logs stay."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteSet(null)}
        onConfirm={() => {
          if (confirmDeleteSet != null) void removeSet(confirmDeleteSet);
        }}
      />
      <ConfirmModal
        open={confirmUseSet != null}
        title={confirmUseSet ? `Use “${confirmUseSet.name}”?` : "Use set?"}
        message="Deducts the set volumes from inventory and writes a log with today’s price snapshots. You can edit volumes in the Apply panel after loading if needed — confirm applies the volumes currently in the Apply form."
        confirmLabel="Use & deduct stock"
        danger={false}
        onCancel={() => setConfirmUseSet(null)}
        onConfirm={() => {
          const s = confirmUseSet;
          if (s) void applyUse(s);
        }}
      />
    </div>
  );
}
