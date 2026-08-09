import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../utils/api";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";
import { play, unlockAudio } from "../utils/sounds";

type Fertilizer = {
  id: number;
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string | null;
  created_at: string;
};

type ScheduleStep = {
  id?: number;
  step_order: number;
  week_number: number | null;
  title: string;
  instructions: string | null;
  suggested_fertilizer_id: number | null;
  suggested_amount: number | null;
  unit: string | null;
  interval_days: number | null;
};

type Schedule = {
  id: number;
  crop_name: string | null;
  name: string;
  description: string | null;
  created_at: string;
  steps: ScheduleStep[];
};

type Application = {
  id: number;
  crop_name: string;
  fertilizer_id: number;
  fertilizer_name: string | null;
  amount: number;
  unit: string;
  applied_at: string;
  notes: string | null;
  schedule_step_id: number | null;
  created_by: string | null;
};

type PriceRow = {
  id: number;
  fertilizer_id: number;
  price: number;
  recorded_at: string;
};

type Tab = "inventory" | "schedules" | "usage";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const s = String(value).replace("T", " ").slice(0, 16);
  return s;
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

export default function FertilizerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cropParam = searchParams.get("crop") || "";

  const [tab, setTab] = useState<Tab>(
    cropParam ? "schedules" : "inventory"
  );
  const [crops, setCrops] = useState<string[]>([]);
  const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedCrop, setSelectedCrop] = useState(cropParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Inventory form
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stockQty, setStockQty] = useState("0");
  const [unitPrice, setUnitPrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [restockId, setRestockId] = useState<number | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [priceHistory, setPriceHistory] = useState<PriceRow[]>([]);
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  // Usage form
  const [useCrop, setUseCrop] = useState(cropParam);
  const [useFertId, setUseFertId] = useState("");
  const [useAmount, setUseAmount] = useState("");
  const [useUnit, setUseUnit] = useState("");
  const [useDate, setUseDate] = useState(todayISO());
  const [useNotes, setUseNotes] = useState("");
  const [useStepId, setUseStepId] = useState("");
  const [saving, setSaving] = useState(false);

  // Schedule edit
  const [activeScheduleId, setActiveScheduleId] = useState<number | null>(null);
  const [schedName, setSchedName] = useState("");
  const [schedDesc, setSchedDesc] = useState("");
  const [schedSteps, setSchedSteps] = useState<ScheduleStep[]>([]);

  const [confirmDeleteFert, setConfirmDeleteFert] = useState<number | null>(
    null
  );
  const [confirmDeleteApp, setConfirmDeleteApp] = useState<number | null>(null);
  const [confirmDeleteSched, setConfirmDeleteSched] = useState<number | null>(
    null
  );

  const cropSchedules = useMemo(
    () =>
      schedules.filter(
        (s) =>
          selectedCrop &&
          s.crop_name &&
          s.crop_name.toLowerCase() === selectedCrop.toLowerCase()
      ),
    [schedules, selectedCrop]
  );

  const templateSchedules = useMemo(
    () => schedules.filter((s) => s.crop_name == null),
    [schedules]
  );

  const activeSchedule = useMemo(
    () => schedules.find((s) => s.id === activeScheduleId) || null,
    [schedules, activeScheduleId]
  );

  const stepOptions = useMemo(() => {
    const list: { id: number; label: string }[] = [];
    for (const s of cropSchedules) {
      for (const step of s.steps) {
        if (step.id) {
          list.push({
            id: step.id,
            label: `${s.name}: W${step.week_number ?? step.step_order} — ${step.title}`,
          });
        }
      }
    }
    return list;
  }, [cropSchedules]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cropParam) {
      setSelectedCrop(cropParam);
      setUseCrop(cropParam);
      setTab("schedules");
    }
  }, [cropParam]);

  useEffect(() => {
    if (!selectedCrop) return;
    void loadSchedules(selectedCrop);
    void loadApplications(selectedCrop);
  }, [selectedCrop]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        loadCrops(),
        loadFertilizers(),
        loadSchedules(selectedCrop || undefined),
        loadApplications(selectedCrop || undefined),
      ]);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadCrops() {
    const res = await apiFetch("/getCrops");
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    const rows = (await res.json()) as { name: string }[];
    setCrops(rows.map((r) => r.name).filter(Boolean));
  }

  async function loadFertilizers() {
    const res = await apiFetch("/getFertilizers");
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    setFertilizers(await res.json());
  }

  async function loadSchedules(crop?: string) {
    const q = crop ? `?crop=${encodeURIComponent(crop)}` : "";
    const res = await apiFetch(`/getFertilizerSchedules${q}`);
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    const rows = (await res.json()) as Schedule[];
    setSchedules(rows);
    if (crop) {
      const forCrop = rows.find(
        (s) =>
          s.crop_name && s.crop_name.toLowerCase() === crop.toLowerCase()
      );
      if (forCrop) {
        setActiveScheduleId(forCrop.id);
        fillScheduleForm(forCrop);
      } else {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
    }
  }

  async function loadApplications(crop?: string) {
    const q = crop ? `?crop=${encodeURIComponent(crop)}` : "";
    const res = await apiFetch(`/getFertilizerApplications${q}`);
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    setApplications(await res.json());
  }

  function fillScheduleForm(s: Schedule) {
    setSchedName(s.name);
    setSchedDesc(s.description || "");
    setSchedSteps(
      s.steps.length
        ? s.steps.map((st) => ({ ...st }))
        : [
            {
              step_order: 1,
              week_number: 1,
              title: "",
              instructions: "",
              suggested_fertilizer_id: null,
              suggested_amount: null,
              unit: "g",
              interval_days: null,
            },
          ]
    );
  }

  function clearScheduleForm() {
    setSchedName("");
    setSchedDesc("");
    setSchedSteps([]);
  }

  function resetFertForm() {
    setEditId(null);
    setName("");
    setUnit("kg");
    setStockQty("0");
    setUnitPrice("0");
    setNotes("");
  }

  function startEdit(f: Fertilizer) {
    void unlockAudio();
    play("click");
    setEditId(f.id);
    setName(f.name);
    setUnit(f.unit);
    setStockQty(String(f.stock_qty));
    setUnitPrice(String(f.unit_price));
    setNotes(f.notes || "");
    setTab("inventory");
  }

  async function saveFertilizer(e: FormEvent) {
    e.preventDefault();
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        id: editId ?? undefined,
        name: name.trim(),
        unit: unit.trim() || "kg",
        stockQty: Number(stockQty),
        unitPrice: Number(unitPrice),
        notes: notes.trim() || null,
      };
      const res = await apiFetch(
        editId ? "/updateFertilizer" : "/addFertilizer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(await readError(res));
      play("save");
      setMessage(editId ? "Fertilizer updated." : "Fertilizer added.");
      resetFertForm();
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function doRestock() {
    if (restockId == null) return;
    const delta = Number(restockAmount);
    if (!(delta > 0)) {
      play("error");
      setError("Restock amount must be greater than 0");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/updateFertilizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: restockId, stockDelta: delta }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("success");
      setMessage(`Restocked +${delta}.`);
      setRestockId(null);
      setRestockAmount("");
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Restock failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeFertilizer(id: number) {
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteFert(null);
      setMessage("Fertilizer deleted.");
      if (editId === id) resetFertForm();
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteFert(null);
    } finally {
      setSaving(false);
    }
  }

  async function showPriceHistory(id: number) {
    void unlockAudio();
    play("click");
    if (historyFor === id) {
      setHistoryFor(null);
      setPriceHistory([]);
      return;
    }
    const res = await apiFetch(
      `/getFertilizerPriceHistory?fertilizerId=${id}`
    );
    if (!res.ok) {
      play("error");
      setError(await readError(res));
      return;
    }
    setPriceHistory(await res.json());
    setHistoryFor(id);
  }

  async function logUsage(e: FormEvent) {
    e.preventDefault();
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const fert = fertilizers.find((f) => f.id === Number(useFertId));
      const res = await apiFetch("/addFertilizerApplication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropName: useCrop.trim(),
          fertilizerId: Number(useFertId),
          amount: Number(useAmount),
          unit: useUnit.trim() || fert?.unit || "kg",
          appliedAt: useDate,
          notes: useNotes.trim() || null,
          scheduleStepId: useStepId ? Number(useStepId) : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("success");
      setMessage("Usage logged — inventory updated.");
      setUseAmount("");
      setUseNotes("");
      setUseStepId("");
      await Promise.all([
        loadFertilizers(),
        loadApplications(selectedCrop || useCrop || undefined),
      ]);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to log usage");
    } finally {
      setSaving(false);
    }
  }

  async function removeApplication(id: number) {
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizerApplication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteApp(null);
      setMessage("Usage deleted — stock restored.");
      await Promise.all([
        loadFertilizers(),
        loadApplications(selectedCrop || undefined),
      ]);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteApp(null);
    } finally {
      setSaving(false);
    }
  }

  async function seedPepperTemplate() {
    if (!selectedCrop) {
      play("error");
      setError("Pick a crop first to attach the cycle template.");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/seedDefaultSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cropName: selectedCrop }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const schedule = (await res.json()) as Schedule;
      play("success");
      setMessage(
        `Seeded “${schedule.name}” for ${selectedCrop}. Customize steps below.`
      );
      await loadSchedules(selectedCrop);
      setActiveScheduleId(schedule.id);
      fillScheduleForm(schedule);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Seed failed");
    } finally {
      setSaving(false);
    }
  }

  async function ensureGlobalTemplate() {
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/seedDefaultSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("save");
      setMessage("Global 4-week template ready.");
      await loadSchedules(selectedCrop || undefined);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  function startNewSchedule() {
    void unlockAudio();
    play("click");
    setActiveScheduleId(null);
    setSchedName(selectedCrop ? `${selectedCrop} cycle` : "Custom cycle");
    setSchedDesc("");
    setSchedSteps([
      {
        step_order: 1,
        week_number: 1,
        title: "",
        instructions: "",
        suggested_fertilizer_id: null,
        suggested_amount: null,
        unit: "g",
        interval_days: null,
      },
    ]);
  }

  function updateStep(index: number, patch: Partial<ScheduleStep>) {
    setSchedSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function addStepRow() {
    setSchedSteps((prev) => [
      ...prev,
      {
        step_order: prev.length + 1,
        week_number: prev.length + 1,
        title: "",
        instructions: "",
        suggested_fertilizer_id: null,
        suggested_amount: null,
        unit: "g",
        interval_days: null,
      },
    ]);
  }

  function removeStepRow(index: number) {
    setSchedSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_order: i + 1 }))
    );
  }

  async function saveScheduleForm(e: FormEvent) {
    e.preventDefault();
    if (!selectedCrop && !activeSchedule?.crop_name) {
      // allow saving template edits when active is template
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const cropForSave =
        activeSchedule?.crop_name === null && activeScheduleId
          ? null
          : selectedCrop || activeSchedule?.crop_name || null;

      const res = await apiFetch("/saveSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeScheduleId,
          cropName: cropForSave,
          name: schedName.trim(),
          description: schedDesc.trim() || null,
          steps: schedSteps.map((s, i) => ({
            stepOrder: i + 1,
            weekNumber: s.week_number,
            title: s.title,
            instructions: s.instructions,
            suggestedFertilizerId: s.suggested_fertilizer_id,
            suggestedAmount: s.suggested_amount,
            unit: s.unit,
            intervalDays: s.interval_days,
          })),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const saved = (await res.json()) as Schedule;
      play("save");
      setMessage("Schedule saved.");
      setActiveScheduleId(saved.id);
      await loadSchedules(selectedCrop || undefined);
      fillScheduleForm(saved);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: number) {
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizerSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteSched(null);
      setMessage("Schedule deleted.");
      if (activeScheduleId === id) {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
      await loadSchedules(selectedCrop || undefined);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteSched(null);
    } finally {
      setSaving(false);
    }
  }

  function onCropChange(crop: string) {
    setSelectedCrop(crop);
    setUseCrop(crop);
    if (crop) {
      setSearchParams({ crop });
    } else {
      setSearchParams({});
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "inventory", label: "Inventory" },
    { id: "schedules", label: "Schedules" },
    { id: "usage", label: "Log usage" },
  ];

  return (
    <div className="page-container min-h-screen animate-rise">
      <header className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Crop nutrition</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Fertilizer
          </h1>
          <p className="text-gold-muted text-sm mt-2 max-w-xl">
            Inventory, prices, crop timetables, and usage logging — works for
            any crop. Logging usage deducts stock.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SoundToggle />
          <button className="glass-btn" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`glass-btn ${tab === t.id ? "gold-btn" : ""}`}
            onClick={() => {
              play("click");
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(error || message) && (
        <div className="mb-4 space-y-2">
          {error && <p className="text-red-300 text-sm">{error}</p>}
          {message && <p className="text-emerald-300 text-sm">{message}</p>}
        </div>
      )}

      {loading ? (
        <p className="text-gold-muted">Loading…</p>
      ) : (
        <>
          {tab === "inventory" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="glass-card gold-sheen">
                <p className="eyebrow">Catalog</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  {editId ? "Edit fertilizer" : "Add fertilizer"}
                </h2>
                <form onSubmit={saveFertilizer} className="space-y-3">
                  <label className="block">
                    <span className="eyebrow mb-1 block">Name</span>
                    <input
                      className="glass-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. NPK 15-15-15"
                      required
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Unit</span>
                      <input
                        className="glass-input"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="kg / g / L"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Stock qty</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="glass-input"
                        value={stockQty}
                        onChange={(e) => setStockQty(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Unit price</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="glass-input"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Notes</span>
                    <textarea
                      className="glass-input min-h-[72px] resize-y"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : editId ? "Update" : "Add"}
                    </button>
                    {editId && (
                      <button
                        type="button"
                        className="glass-btn"
                        onClick={() => {
                          play("click");
                          resetFertForm();
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="glass-card">
                <p className="eyebrow">Stock & prices</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Inventory
                </h2>
                {fertilizers.length === 0 ? (
                  <p className="text-gold-muted text-sm">
                    No fertilizers yet. Add your first product.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {fertilizers.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gold">{f.name}</p>
                            <p className="text-sm text-gold-muted mt-1">
                              Stock{" "}
                              <span
                                className={
                                  f.stock_qty <= 0
                                    ? "text-red-300"
                                    : "text-emerald-300"
                                }
                              >
                                {f.stock_qty}
                              </span>{" "}
                              {f.unit} ·{" "}
                              <span className="text-white/90">
                                {f.unit_price.toLocaleString()} / {f.unit}
                              </span>
                            </p>
                            {f.notes && (
                              <p className="text-xs text-gold-muted mt-1">
                                {f.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="glass-btn text-xs"
                              onClick={() => startEdit(f)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="glass-btn text-xs"
                              onClick={() => {
                                play("click");
                                setRestockId(f.id);
                                setRestockAmount("");
                              }}
                            >
                              Restock
                            </button>
                            <button
                              type="button"
                              className="glass-btn text-xs"
                              onClick={() => void showPriceHistory(f.id)}
                            >
                              Prices
                            </button>
                            <button
                              type="button"
                              className="glass-btn text-xs text-red-300"
                              onClick={() => {
                                play("click");
                                setConfirmDeleteFert(f.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {restockId === f.id && (
                          <div className="mt-3 flex flex-wrap items-end gap-2">
                            <label className="block flex-1 min-w-[120px]">
                              <span className="eyebrow mb-1 block">
                                Add amount ({f.unit})
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className="glass-input"
                                value={restockAmount}
                                onChange={(e) =>
                                  setRestockAmount(e.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="glass-btn gold-btn"
                              onClick={() => void doRestock()}
                              disabled={saving}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="glass-btn"
                              onClick={() => setRestockId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {historyFor === f.id && (
                          <div className="mt-3 text-xs text-gold-muted">
                            <p className="eyebrow mb-1">Price history</p>
                            {priceHistory.length === 0 ? (
                              <p>No price history yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {priceHistory.map((p) => (
                                  <li key={p.id}>
                                    {p.price.toLocaleString()} —{" "}
                                    {fmtDate(String(p.recorded_at))}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "schedules" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="glass-card gold-sheen space-y-4">
                <div>
                  <p className="eyebrow">Timetable</p>
                  <h2 className="font-display text-xl text-gold">
                    Crop schedules
                  </h2>
                </div>

                <label className="block">
                  <span className="eyebrow mb-1 block">Crop</span>
                  <select
                    className="glass-input"
                    value={selectedCrop}
                    onChange={(e) => onCropChange(e.target.value)}
                  >
                    <option value="">Select crop…</option>
                    {crops.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="glass-btn gold-btn"
                    disabled={!selectedCrop || saving}
                    onClick={() => void seedPepperTemplate()}
                  >
                    Use pepper cycle template
                  </button>
                  <button
                    type="button"
                    className="glass-btn"
                    onClick={() => void ensureGlobalTemplate()}
                    disabled={saving}
                  >
                    Ensure global template
                  </button>
                  <button
                    type="button"
                    className="glass-btn"
                    disabled={!selectedCrop}
                    onClick={startNewSchedule}
                  >
                    New blank schedule
                  </button>
                </div>

                <p className="text-xs text-gold-muted leading-relaxed">
                  The pepper cycle is a seedable 4-week template (base mix →
                  MgSO₄ → micros → disease spray). Attach it to any crop, then
                  edit amounts and instructions.
                </p>

                {selectedCrop && cropSchedules.length > 0 && (
                  <div className="space-y-2">
                    <p className="eyebrow">For {selectedCrop}</p>
                    {cropSchedules.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`w-full text-left glass-btn ${
                          activeScheduleId === s.id ? "gold-btn" : ""
                        }`}
                        onClick={() => {
                          play("click");
                          setActiveScheduleId(s.id);
                          fillScheduleForm(s);
                        }}
                      >
                        {s.name} · {s.steps.length} steps
                      </button>
                    ))}
                  </div>
                )}

                {templateSchedules.length > 0 && (
                  <div className="space-y-2">
                    <p className="eyebrow">Global templates</p>
                    {templateSchedules.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`w-full text-left glass-btn text-sm ${
                          activeScheduleId === s.id ? "gold-btn" : ""
                        }`}
                        onClick={() => {
                          play("click");
                          setActiveScheduleId(s.id);
                          fillScheduleForm(s);
                        }}
                      >
                        {s.name} (template)
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="glass-card">
                <p className="eyebrow">Editor</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  {activeScheduleId ? "Edit schedule" : "Schedule details"}
                </h2>

                {schedSteps.length === 0 && !schedName ? (
                  <p className="text-gold-muted text-sm">
                    Select a crop, then seed the pepper cycle template or start
                    a blank schedule.
                  </p>
                ) : (
                  <form onSubmit={saveScheduleForm} className="space-y-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Name</span>
                      <input
                        className="glass-input"
                        value={schedName}
                        onChange={(e) => setSchedName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Description</span>
                      <textarea
                        className="glass-input min-h-[80px] resize-y"
                        value={schedDesc}
                        onChange={(e) => setSchedDesc(e.target.value)}
                      />
                    </label>

                    <div className="space-y-3">
                      {schedSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3 space-y-2"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <p className="text-sm text-gold">
                              Step {idx + 1}
                              {step.week_number != null
                                ? ` · Week ${step.week_number}`
                                : ""}
                            </p>
                            <button
                              type="button"
                              className="glass-btn text-xs text-red-300"
                              onClick={() => removeStepRow(idx)}
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="eyebrow mb-1 block">Week #</span>
                              <input
                                type="number"
                                className="glass-input"
                                value={step.week_number ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    week_number: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">
                                Interval (days)
                              </span>
                              <input
                                type="number"
                                className="glass-input"
                                value={step.interval_days ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    interval_days: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="eyebrow mb-1 block">Title</span>
                            <input
                              className="glass-input"
                              value={step.title}
                              onChange={(e) =>
                                updateStep(idx, { title: e.target.value })
                              }
                              required
                            />
                          </label>
                          <label className="block">
                            <span className="eyebrow mb-1 block">
                              Instructions
                            </span>
                            <textarea
                              className="glass-input min-h-[64px] resize-y"
                              value={step.instructions || ""}
                              onChange={(e) =>
                                updateStep(idx, {
                                  instructions: e.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="block col-span-1">
                              <span className="eyebrow mb-1 block">Amount</span>
                              <input
                                type="number"
                                step="any"
                                className="glass-input"
                                value={step.suggested_amount ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    suggested_amount: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">Unit</span>
                              <input
                                className="glass-input"
                                value={step.unit || ""}
                                onChange={(e) =>
                                  updateStep(idx, { unit: e.target.value })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">
                                Fertilizer
                              </span>
                              <select
                                className="glass-input"
                                value={step.suggested_fertilizer_id ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    suggested_fertilizer_id: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              >
                                <option value="">—</option>
                                {fertilizers.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="glass-btn"
                        onClick={addStepRow}
                      >
                        + Step
                      </button>
                      <button
                        type="submit"
                        className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save schedule"}
                      </button>
                      {activeScheduleId && (
                        <button
                          type="button"
                          className="glass-btn text-red-300"
                          onClick={() => {
                            play("click");
                            setConfirmDeleteSched(activeScheduleId);
                          }}
                        >
                          Delete schedule
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}

          {tab === "usage" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="glass-card gold-sheen">
                <p className="eyebrow">Apply</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Log usage
                </h2>
                <form onSubmit={logUsage} className="space-y-3">
                  <label className="block">
                    <span className="eyebrow mb-1 block">Crop</span>
                    <select
                      className="glass-input"
                      value={useCrop}
                      onChange={(e) => {
                        setUseCrop(e.target.value);
                        onCropChange(e.target.value);
                      }}
                      required
                    >
                      <option value="">Select crop…</option>
                      {crops.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Fertilizer</span>
                    <select
                      className="glass-input"
                      value={useFertId}
                      onChange={(e) => {
                        setUseFertId(e.target.value);
                        const f = fertilizers.find(
                          (x) => x.id === Number(e.target.value)
                        );
                        if (f) setUseUnit(f.unit);
                      }}
                      required
                    >
                      <option value="">Select…</option>
                      {fertilizers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.stock_qty} {f.unit})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Amount</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="glass-input"
                        value={useAmount}
                        onChange={(e) => setUseAmount(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Unit</span>
                      <input
                        className="glass-input"
                        value={useUnit}
                        onChange={(e) => setUseUnit(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Date</span>
                    <input
                      type="date"
                      className="glass-input"
                      value={useDate}
                      onChange={(e) => setUseDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">
                      Schedule step (optional)
                    </span>
                    <select
                      className="glass-input"
                      value={useStepId}
                      onChange={(e) => setUseStepId(e.target.value)}
                    >
                      <option value="">—</option>
                      {stepOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Notes</span>
                    <textarea
                      className="glass-input min-h-[72px] resize-y"
                      value={useNotes}
                      onChange={(e) => setUseNotes(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Log & deduct stock"}
                  </button>
                </form>
              </section>

              <section className="glass-card">
                <p className="eyebrow">History</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Applications
                  {selectedCrop ? ` · ${selectedCrop}` : ""}
                </h2>
                {applications.length === 0 ? (
                  <p className="text-gold-muted text-sm">No usage logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gold-muted border-b border-[var(--glass-border)]">
                          <th className="py-2 pr-2 font-normal">Date</th>
                          <th className="py-2 pr-2 font-normal">Crop</th>
                          <th className="py-2 pr-2 font-normal">Product</th>
                          <th className="py-2 pr-2 font-normal">Amount</th>
                          <th className="py-2 font-normal" />
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-[var(--glass-border)]/50"
                          >
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {fmtDate(String(a.applied_at))}
                            </td>
                            <td className="py-2 pr-2">{a.crop_name}</td>
                            <td className="py-2 pr-2">
                              {a.fertilizer_name || `#${a.fertilizer_id}`}
                              {a.notes && (
                                <span className="block text-xs text-gold-muted">
                                  {a.notes}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {a.amount} {a.unit}
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                className="glass-btn text-xs text-red-300"
                                onClick={() => {
                                  play("click");
                                  setConfirmDeleteApp(a.id);
                                }}
                              >
                                Undo
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmDeleteFert != null}
        title="Delete fertilizer?"
        message="This removes the catalog item. Blocked if usage logs still reference it."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteFert(null)}
        onConfirm={() => {
          if (confirmDeleteFert != null) void removeFertilizer(confirmDeleteFert);
        }}
      />
      <ConfirmModal
        open={confirmDeleteApp != null}
        title="Undo this usage?"
        message="Stock will be restored by the logged amount."
        confirmLabel="Undo"
        onCancel={() => setConfirmDeleteApp(null)}
        onConfirm={() => {
          if (confirmDeleteApp != null) void removeApplication(confirmDeleteApp);
        }}
      />
      <ConfirmModal
        open={confirmDeleteSched != null}
        title="Delete schedule?"
        message="All timetable steps for this schedule will be removed."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteSched(null)}
        onConfirm={() => {
          if (confirmDeleteSched != null)
            void removeSchedule(confirmDeleteSched);
        }}
      />
    </div>
  );
}
