import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import { swrLoad } from "../utils/clientCache";

type PlantSummary = {
  number: number;
  noteCount: number;
  openTodoCount: number;
  imageCount: number;
  lastActivity: string | null;
};

type PlantMapPayload = {
  crop: string;
  status: "active" | "closed";
  plantCount: number;
  closedPlantCount: number;
  displayCount: number;
  plants: PlantSummary[];
};

function useSeatsPerRow() {
  const [n, setN] = useState(10);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setN(mq.matches ? 6 : 10);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return n;
}

function tileClass(s?: PlantSummary, retired = false) {
  const bits = ["plant-tile"];
  if (retired) bits.push("plant-tile--retired");
  if (s?.openTodoCount) bits.push("plant-tile--todo");
  else if (s?.noteCount || s?.imageCount) bits.push("plant-tile--busy");
  else bits.push("plant-tile--empty");
  return bits.join(" ");
}

function PlantTile({
  n,
  summary,
  retired,
  highlight,
  onOpen,
}: {
  n: number;
  summary?: PlantSummary;
  retired?: boolean;
  highlight?: boolean;
  onOpen: (n: number) => void;
}) {
  return (
    <button
      id={`plant-tile-${n}`}
      type="button"
      className={`${tileClass(summary, retired)} ${highlight ? "is-highlight" : ""}`}
      onClick={() => onOpen(n)}
      title={
        summary
          ? `Plant ${n} — ${summary.noteCount} note${summary.noteCount === 1 ? "" : "s"}, ${summary.openTodoCount} open todo${summary.openTodoCount === 1 ? "" : "s"}, ${summary.imageCount} photo${summary.imageCount === 1 ? "" : "s"}`
          : `Plant ${n} — no notes yet`
      }
      aria-label={`Plant ${n}`}
    >
      <span className="plant-tile__num">{n}</span>
      <span className="plant-tile__dots" aria-hidden>
        {!!summary?.noteCount && <i className="plant-dot plant-dot--note" />}
        {!!summary?.openTodoCount && <i className="plant-dot plant-dot--todo" />}
        {!!summary?.imageCount && <i className="plant-dot plant-dot--photo" />}
      </span>
    </button>
  );
}

export default function PlantMap() {
  const { cropName = "" } = useParams();
  const crop = decodeURIComponent(cropName);
  const navigate = useNavigate();
  const seatsPerRow = useSeatsPerRow();

  const [payload, setPayload] = useState<PlantMapPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);

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

  const rows = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < liveNumbers.length; i += seatsPerRow) {
      out.push(liveNumbers.slice(i, i + seatsPerRow));
    }
    return out;
  }, [liveNumbers, seatsPerRow]);

  const openPlantTodos = (payload?.plants || []).reduce(
    (sum, p) => sum + (p.openTodoCount || 0),
    0
  );
  const plantsWithHistory = (payload?.plants || []).length;
  const isClosed = payload?.status === "closed";

  useEffect(() => {
    let cancelled = false;
    setError(null);
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
        if (!cancelled) setPayload(data);
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
    navigate(
      `/crops/${encodeURIComponent(crop)}/plants/${n}`
    );
  }

  function jumpToPlant(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jump);
    if (!Number.isInteger(n) || n < 1) {
      setError("Enter a plant number ≥ 1");
      return;
    }
    const max = Math.max(
      payload?.displayCount || 0,
      ...retiredNumbers,
      0
    );
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

  function renderRow(nums: number[], rowIndex: number, retired = false) {
    const mid = Math.ceil(nums.length / 2);
    const left = nums.slice(0, mid);
    const right = nums.slice(mid);
    return (
      <div className="plant-map-row" key={`${retired ? "r" : "l"}-${rowIndex}`}>
        <span className="plant-map-row-label" aria-hidden>
          {rowIndex + 1}
        </span>
        <div className="plant-map-seats">
          {left.map((n) => (
            <PlantTile
              key={n}
              n={n}
              summary={summaryByNumber.get(n)}
              retired={retired}
              highlight={highlight === n}
              onOpen={openPlant}
            />
          ))}
        </div>
        <div className="plant-map-aisle" aria-hidden />
        <div className="plant-map-seats">
          {right.map((n) => (
            <PlantTile
              key={n}
              n={n}
              summary={summaryByNumber.get(n)}
              retired={retired}
              highlight={highlight === n}
              onOpen={openPlant}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-rise">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          className="glass-btn"
          onClick={() =>
            navigate(`/crops/${encodeURIComponent(crop)}/notes`)
          }
        >
          ← Back
        </button>
        <div className="text-center flex-1">
          <p className="eyebrow">Individual plants</p>
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
              <>
                {" "}
                · {plantsWithHistory} with history
              </>
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

      <section className="plant-map glass-card">
        <div className="plant-map-screen" aria-hidden>
          <span>Field · {crop}</span>
        </div>

        {payload && payload.displayCount === 0 && retiredNumbers.length === 0 && (
          <div className="text-center py-10 px-4">
            <p className="font-display text-2xl text-gold mb-2">No plants yet</p>
            <p className="text-sm text-gold-muted mb-5 max-w-md mx-auto">
              Set a plant count on this crop first. Each plant then gets a seat
              on this map — notes, todos, and photos stay with that plant.
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
        )}

        {rows.map((row, i) => renderRow(row, i))}

        {retiredNumbers.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow mb-3 text-center">
              Beyond current count — history kept
            </p>
            {(() => {
              const extraRows: number[][] = [];
              for (let i = 0; i < retiredNumbers.length; i += seatsPerRow) {
                extraRows.push(retiredNumbers.slice(i, i + seatsPerRow));
              }
              return extraRows.map((row, i) => renderRow(row, i, true));
            })()}
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
