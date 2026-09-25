import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import { useAuth } from "../utils/AuthContext";
import { invalidateCache, swrLoad } from "../utils/clientCache";

type Point = { x: number; y: number };

type PlantSummary = {
  number: number;
  noteCount: number;
  openTodoCount: number;
  imageCount: number;
  lastActivity: string | null;
};

type PlantLayout = {
  outline: Point[];
  tiles: { number: number; x: number; y: number }[];
  widthM: number | null;
  lengthM: number | null;
};

type PlantMapPayload = {
  crop: string;
  status: "active" | "closed";
  plantCount: number;
  closedPlantCount: number;
  displayCount: number;
  plants: PlantSummary[];
  layout?: PlantLayout | null;
};

const DEFAULT_OUTLINE: Point[] = [
  { x: 0.08, y: 0.1 },
  { x: 0.92, y: 0.1 },
  { x: 0.92, y: 0.9 },
  { x: 0.08, y: 0.9 },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultTiles(count: number): Record<number, Point> {
  const out: Record<number, Point> = {};
  if (count < 1) return out;
  const cols = Math.min(12, Math.max(2, Math.ceil(Math.sqrt(count * 1.35))));
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[i + 1] = {
      x: cols === 1 ? 0.5 : 0.16 + (col / (cols - 1)) * 0.68,
      y: rows === 1 ? 0.5 : 0.2 + (row / (rows - 1)) * 0.6,
    };
  }
  return out;
}

function tileClass(s?: PlantSummary, retired = false) {
  const bits = ["plant-tile"];
  if (retired) bits.push("plant-tile--retired");
  if (s?.openTodoCount) bits.push("plant-tile--todo");
  else if (s?.noteCount || s?.imageCount) bits.push("plant-tile--busy");
  else bits.push("plant-tile--empty");
  return bits.join(" ");
}

export default function PlantMap() {
  const { cropName = "" } = useParams();
  const crop = decodeURIComponent(cropName);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const stageRef = useRef<HTMLDivElement>(null);

  const [payload, setPayload] = useState<PlantMapPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [jump, setJump] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [outline, setOutline] = useState<Point[]>(DEFAULT_OUTLINE);
  const [tiles, setTiles] = useState<Record<number, Point>>({});
  const [widthM, setWidthM] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [corner, setCorner] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const layoutKey = useRef("");

  const summaryByNumber = useMemo(() => {
    const map = new Map<number, PlantSummary>();
    for (const p of payload?.plants || []) map.set(p.number, p);
    return map;
  }, [payload]);

  const liveNumbers = useMemo(() => {
    const count = payload?.displayCount || 0;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [payload]);

  const retiredNumbers = useMemo(() => {
    const count = payload?.displayCount || 0;
    return (payload?.plants || [])
      .map((p) => p.number)
      .filter((n) => n > count)
      .sort((a, b) => a - b);
  }, [payload]);

  const openPlantTodos = (payload?.plants || []).reduce(
    (sum, p) => sum + (p.openTodoCount || 0),
    0
  );
  const plantsWithHistory = (payload?.plants || []).length;
  const isClosed = payload?.status === "closed";

  const aspect = useMemo(() => {
    const w = Number(widthM);
    const h = Number(lengthM);
    if (w > 0 && h > 0) return `${w} / ${h}`;
    return "5 / 4";
  }, [widthM, lengthM]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    layoutKey.current = "";
    void swrLoad({
      key: `plantMap:${crop}`,
      freshMaxAgeMs: 20_000,
      fetcher: async () => {
        const res = await fetch(
          `${API}/getPlantMap?crop=${encodeURIComponent(crop)}`,
          { credentials: "include" }
        );
        if (res.status === 401) {
          navigate("/login");
          throw new Error("Unauthorized");
        }
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<PlantMapPayload>;
      },
      apply: (data) => {
        if (cancelled) return;
        setPayload(data);
        const stamp = `${crop}:${data.displayCount}:${JSON.stringify(data.layout || null)}`;
        if (layoutKey.current === stamp) return;
        layoutKey.current = stamp;
        const layout = data.layout;
        const nextOutline =
          layout?.outline && layout.outline.length >= 3
            ? layout.outline
            : DEFAULT_OUTLINE;
        const defaults = defaultTiles(data.displayCount);
        const nextTiles = { ...defaults };
        for (const tile of layout?.tiles || []) {
          if (tile.number >= 1 && tile.number <= data.displayCount) {
            nextTiles[tile.number] = { x: tile.x, y: tile.y };
          }
        }
        setOutline(nextOutline);
        setTiles(nextTiles);
        setWidthM(layout?.widthM ? String(layout.widthM) : "");
        setLengthM(layout?.lengthM ? String(layout.lengthM) : "");
        setCorner(0);
        setDirty(false);
      },
    }).catch((err: any) => {
      if (!cancelled && err?.message !== "Unauthorized") {
        setError(err.message || "Failed to load plant map");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [crop, navigate]);

  function openPlant(n: number) {
    void unlockAudio();
    play("click");
    navigate(`/crops/${encodeURIComponent(crop)}/plants/${n}`);
  }

  function pointFromEvent(ev: { clientX: number; clientY: number }) {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: clamp((ev.clientX - rect.left) / rect.width, 0.02, 0.98),
      y: clamp((ev.clientY - rect.top) / rect.height, 0.02, 0.98),
    };
  }

  function dragCorner(index: number, ev: ReactPointerEvent<HTMLButtonElement>) {
    if (!isAdmin) return;
    ev.preventDefault();
    ev.stopPropagation();
    const handle = ev.currentTarget;
    handle.setPointerCapture(ev.pointerId);
    setCorner(index);
    const move = (e: PointerEvent) => {
      const pt = pointFromEvent(e);
      if (!pt) return;
      setOutline((prev) => prev.map((p, i) => (i === index ? pt : p)));
      setDirty(true);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function dragTile(n: number, ev: ReactPointerEvent<HTMLButtonElement>) {
    if (!isAdmin) return;
    ev.preventDefault();
    const handle = ev.currentTarget;
    handle.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    const startY = ev.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) moved = true;
      if (!moved) return;
      const pt = pointFromEvent(e);
      if (!pt) return;
      setTiles((prev) => ({ ...prev, [n]: pt }));
      setDirty(true);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      if (!moved) openPlant(n);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function addCorner() {
    if (!isAdmin || outline.length >= 32) return;
    const w = Number(widthM) > 0 ? Number(widthM) : 5;
    const h = Number(lengthM) > 0 ? Number(lengthM) : 4;
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const dx = (b.x - a.x) * w;
      const dy = (b.y - a.y) * h;
      const len = dx * dx + dy * dy;
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const a = outline[best];
    const b = outline[(best + 1) % outline.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    setOutline((prev) => [
      ...prev.slice(0, best + 1),
      mid,
      ...prev.slice(best + 1),
    ]);
    setCorner(best + 1);
    setDirty(true);
    play("click");
  }

  function removeCorner() {
    if (!isAdmin || outline.length <= 3) return;
    const index = Math.min(corner, outline.length - 1);
    setOutline((prev) => prev.filter((_, i) => i !== index));
    setCorner(Math.max(0, index - 1));
    setDirty(true);
    play("click");
  }

  function resetShape() {
    if (!isAdmin) return;
    setOutline(DEFAULT_OUTLINE);
    setCorner(0);
    setDirty(true);
    play("click");
  }

  function resetTiles() {
    if (!isAdmin || !payload) return;
    setTiles(defaultTiles(payload.displayCount));
    setDirty(true);
    play("click");
  }

  async function saveLayout() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    void unlockAudio();
    try {
      const res = await fetch(`${API}/savePlantLayout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          crop,
          layout: {
            outline,
            tiles: liveNumbers.map((number) => ({
              number,
              x: tiles[number]?.x ?? 0.5,
              y: tiles[number]?.y ?? 0.5,
            })),
            widthM: Number(widthM) > 0 ? Number(widthM) : null,
            lengthM: Number(lengthM) > 0 ? Number(lengthM) : null,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      invalidateCache(`plantMap:${crop}`);
      layoutKey.current = "";
      setDirty(false);
      play("save");
      setMessage("Land and plant positions saved");
      window.setTimeout(() => setMessage(null), 2200);
    } catch (err: any) {
      play("error");
      setError(err.message || "Could not save the plant map");
    } finally {
      setSaving(false);
    }
  }

  function jumpToPlant(e: FormEvent) {
    e.preventDefault();
    const n = Number(jump);
    if (!Number.isInteger(n) || n < 1) {
      setError("Enter a plant number ≥ 1");
      return;
    }
    const max = Math.max(payload?.displayCount || 0, ...retiredNumbers, 0);
    if (max > 0 && n > max && !summaryByNumber.has(n)) {
      setError(`Plant ${n} is outside this field`);
      return;
    }
    setError(null);
    setHighlight(n);
    const el = document.getElementById(`plant-tile-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (summaryByNumber.has(n) || n <= (payload?.displayCount || 0)) {
      window.setTimeout(() => openPlant(n), 280);
    }
  }

  const polygon = outline
    .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
    .join(" ");

  return (
    <div className="page-container animate-rise">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="glass-btn"
            onClick={() =>
              navigate(`/crops/${encodeURIComponent(crop)}/notes`)
            }
          >
            ← Back
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigate(`/crops/${encodeURIComponent(crop)}/map`)}
          >
            MAP
          </button>
        </div>
        <div className="text-center flex-1">
          <p className="eyebrow">Open plant map</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            {crop}
          </h1>
          {isClosed && (
            <div className="mt-2 flex justify-center">
              <span className="crop-closed-badge crop-closed-badge--inline">
                Closed · was{" "}
                {(payload?.closedPlantCount || 0).toLocaleString()} plants
              </span>
            </div>
          )}
          <p className="text-sm text-gold-muted mt-2">
            {(payload?.displayCount || 0).toLocaleString()} tiles
            {plantsWithHistory > 0 && (
              <> · {plantsWithHistory} with history</>
            )}
            {openPlantTodos > 0 && (
              <>
                {" "}
                · {openPlantTodos} open plant todo
                {openPlantTodos === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>
        <SoundToggle />
      </header>

      {error && (
        <p className="text-red-400 text-sm text-center mb-4">{error}</p>
      )}
      {message && (
        <p className="text-emerald-300 text-sm text-center mb-4">{message}</p>
      )}

      <section className="plant-map plant-map--land glass-card">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <p className="eyebrow">Land parameters</p>
            <h2 className="font-display text-xl text-gold">Shape the plot</h2>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="glass-btn gold-btn"
              disabled={saving || !dirty}
              onClick={() => void saveLayout()}
            >
              {saving ? "Saving…" : "Save layout"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block min-w-[7rem]">
            <span className="eyebrow mb-1 block">Width (m)</span>
            <input
              className="glass-input"
              inputMode="decimal"
              value={widthM}
              disabled={!isAdmin}
              onChange={(e) => {
                setWidthM(e.target.value);
                setDirty(true);
              }}
              placeholder="e.g. 40"
            />
          </label>
          <label className="block min-w-[7rem]">
            <span className="eyebrow mb-1 block">Length (m)</span>
            <input
              className="glass-input"
              inputMode="decimal"
              value={lengthM}
              disabled={!isAdmin}
              onChange={(e) => {
                setLengthM(e.target.value);
                setDirty(true);
              }}
              placeholder="e.g. 25"
            />
          </label>
          {isAdmin && (
            <>
              <button type="button" className="glass-btn" onClick={addCorner}>
                Add corner
              </button>
              <button
                type="button"
                className="glass-btn"
                disabled={outline.length <= 3}
                onClick={removeCorner}
              >
                Remove corner
              </button>
              <button type="button" className="glass-btn" onClick={resetShape}>
                Reset shape
              </button>
              <button type="button" className="glass-btn" onClick={resetTiles}>
                Reset tiles
              </button>
            </>
          )}
        </div>

        {payload && payload.displayCount === 0 && retiredNumbers.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="font-display text-2xl text-gold mb-2">No plants yet</p>
            <p className="text-sm text-gold-muted mb-5 max-w-md mx-auto">
              Set a plant count on this crop first. Each plant then gets a
              number you can place on this land.
            </p>
            <button
              type="button"
              className="glass-btn gold-btn"
              onClick={() =>
                navigate(`/crops/${encodeURIComponent(crop)}/notes`)
              }
            >
              Set plant count
            </button>
          </div>
        ) : (
          <div
            ref={stageRef}
            className="land-stage"
            style={{ aspectRatio: aspect }}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polygon points={polygon} className="land-fill" />
            </svg>
            {isAdmin &&
              outline.map((p, i) => (
                <button
                  key={`corner-${i}`}
                  type="button"
                  className={`land-handle ${corner === i ? "is-selected" : ""}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  aria-label={`Land corner ${i + 1}`}
                  onPointerDown={(ev) => dragCorner(i, ev)}
                />
              ))}
            {liveNumbers.map((n) => {
              const pos = tiles[n] || { x: 0.5, y: 0.5 };
              const summary = summaryByNumber.get(n);
              return (
                <button
                  key={n}
                  id={`plant-tile-${n}`}
                  type="button"
                  className={`${tileClass(summary)} land-tile ${highlight === n ? "is-highlight" : ""}`}
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                  title={`Plant ${n}`}
                  aria-label={`Plant ${n}`}
                  onPointerDown={(ev) => {
                    if (!isAdmin) return;
                    dragTile(n, ev);
                  }}
                  onClick={() => {
                    if (isAdmin) return;
                    openPlant(n);
                  }}
                >
                  <span className="plant-tile__num">{n}</span>
                  <span className="plant-tile__dots" aria-hidden>
                    {!!summary?.noteCount && (
                      <i className="plant-dot plant-dot--note" />
                    )}
                    {!!summary?.openTodoCount && (
                      <i className="plant-dot plant-dot--todo" />
                    )}
                    {!!summary?.imageCount && (
                      <i className="plant-dot plant-dot--photo" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {isAdmin && (payload?.displayCount || 0) > 0 && (
          <p className="text-xs text-gold-muted mt-3">
            Drag the gold corners to match the land. Drag a number to the row
            it belongs in. A click without a drag opens that plant. Save layout
            keeps it.
          </p>
        )}

        {retiredNumbers.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow mb-3 text-center">
              Beyond current count — history kept
            </p>
            <div className="plant-tray justify-center">
              {retiredNumbers.map((n) => (
                <button
                  key={n}
                  id={`plant-tile-${n}`}
                  type="button"
                  className={`${tileClass(summaryByNumber.get(n), true)} ${highlight === n ? "is-highlight" : ""}`}
                  onClick={() => openPlant(n)}
                >
                  <span className="plant-tile__num">{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(payload?.displayCount || 0) > 0 && (
          <form
            onSubmit={jumpToPlant}
            className="mt-6 flex flex-wrap items-end justify-center gap-3"
          >
            <label className="block min-w-[140px]">
              <span className="eyebrow mb-1 block">Jump to plant</span>
              <input
                type="number"
                min={1}
                step={1}
                className="glass-input"
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder="e.g. 12"
              />
            </label>
            <button type="submit" className="glass-btn gold-btn">
              Open
            </button>
          </form>
        )}

        <ul className="plant-map-legend">
          <li>
            <span className="plant-tile plant-tile--empty plant-tile--legend" />
            Empty
          </li>
          <li>
            <span className="plant-tile plant-tile--busy plant-tile--legend" />
            Notes / photos
          </li>
          <li>
            <span className="plant-tile plant-tile--todo plant-tile--legend" />
            Open todo
          </li>
          <li>
            <span className="plant-tile plant-tile--retired plant-tile--legend" />
            Retired
          </li>
        </ul>
      </section>
    </div>
  );
}
