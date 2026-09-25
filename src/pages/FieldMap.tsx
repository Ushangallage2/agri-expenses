import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import { useAuth } from "../utils/AuthContext";
import { invalidateCache, swrLoad } from "../utils/clientCache";
import { loadLeaflet, type LeafletNS } from "../utils/leafletLoader";
import { captureFieldMapJpeg } from "../utils/captureMap";
import { compressImageFile } from "../utils/imageCompress";

type FieldLayer = "hybrid" | "hd" | "satellite" | "streets";

type FieldPlant = {
  number: number;
  lat: number | null;
  lng: number | null;
  photoX?: number | null;
  photoY?: number | null;
  retired?: boolean;
  noteCount: number;
  openTodoCount: number;
  imageCount: number;
};

type FieldPhoto = {
  imageData: string;
  width: number;
  height: number;
};

type MapMode = "satellite" | "plan";

type FieldPayload = {
  crop: string;
  status: "active" | "closed";
  displayCount: number;
  closedPlantCount: number;
  map: {
    lat: number;
    lng: number;
    zoom: number;
    layer: FieldLayer;
    label: string | null;
  } | null;
  photo?: FieldPhoto | null;
  plants: FieldPlant[];
};

type PlaceHit = {
  label: string;
  lat: number;
  lng: number;
  south?: number | null;
  north?: number | null;
  west?: number | null;
  east?: number | null;
  zoom?: number;
};

const DEFAULT_VIEW = { lat: 7.8731, lng: 80.7718, zoom: 8 };

function plantKind(p: FieldPlant) {
  if (p.openTodoCount) return "todo";
  if (p.noteCount || p.imageCount) return "busy";
  return "empty";
}

function tileClass(p: FieldPlant) {
  const bits = ["plant-tile"];
  if (p.retired) bits.push("plant-tile--retired");
  if (p.openTodoCount) bits.push("plant-tile--todo");
  else if (p.noteCount || p.imageCount) bits.push("plant-tile--busy");
  else bits.push("plant-tile--empty");
  return bits.join(" ");
}

function downloadBase64(filename: string, mime: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FieldMap() {
  const { cropName = "" } = useParams();
  const crop = decodeURIComponent(cropName);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const labelsRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());
  const plantsRef = useRef<FieldPlant[]>([]);
  const selectedRef = useRef<number | null>(null);
  const Lref = useRef<LeafletNS | null>(null);

  const [payload, setPayload] = useState<FieldPayload | null>(null);
  const [plants, setPlants] = useState<FieldPlant[]>([]);
  const [layer, setLayer] = useState<FieldLayer>("hybrid");
  const [mode, setMode] = useState<MapMode>("satellite");
  const [photo, setPhoto] = useState<FieldPhoto | null>(null);
  const [pending, setPending] = useState<FieldPhoto | null>(null);
  const [mapEpoch, setMapEpoch] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const modeRef = useRef<MapMode>("satellite");
  const photoRef = useRef<FieldPhoto | null>(null);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searching, setSearching] = useState(false);

  const shownPhoto = pending || photo;
  plantsRef.current = plants;
  selectedRef.current = selected;
  modeRef.current = mode;
  photoRef.current = shownPhoto;
  const saveRef = useRef<(
    positions: Array<{
      number: number;
      lat: number | null;
      lng: number | null;
      photoX?: number | null;
      photoY?: number | null;
    }>
  ) => Promise<void>>(async () => {});

  const onPlan = mode === "plan" && !!shownPhoto;
  const placed = plants.filter((p) =>
    onPlan ? p.photoX != null && p.photoY != null : p.lat != null && p.lng != null
  );
  const unplaced = plants.filter((p) =>
    onPlan ? p.photoX == null || p.photoY == null : p.lat == null || p.lng == null
  );
  const isClosed = payload?.status === "closed";

  const summaryLine = useMemo(() => {
    const total = payload?.displayCount || 0;
    return `${placed.length} placed · ${unplaced.length} in tray · ${total} plants`;
  }, [placed.length, unplaced.length, payload?.displayCount]);

  async function loadPayload() {
    await swrLoad({
      key: `fieldMap:${crop}`,
      freshMaxAgeMs: 12_000,
      fetcher: async () => {
        const res = await fetch(
          `${API}/getCropFieldMap?crop=${encodeURIComponent(crop)}`,
          { credentials: "include" }
        );
        if (res.status === 401) {
          navigate("/login");
          throw new Error("Unauthorized");
        }
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<FieldPayload>;
      },
      apply: (data) => {
        setPayload(data);
        setPlants(data.plants);
        setPhoto(data.photo || null);
        if (data.map) {
          setLayer(data.map.layer || "hybrid");
          setLabel(data.map.label || "");
        }
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void loadPayload().catch((err: any) => {
      if (!cancelled && err?.message !== "Unauthorized") {
        setError(err.message || "Failed to load plantation map");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [crop]);

  function applyLayer(L: LeafletNS, map: any, next: FieldLayer) {
    if (layerRef.current) map.removeLayer(layerRef.current);
    if (labelsRef.current) {
      map.removeLayer(labelsRef.current);
      labelsRef.current = null;
    }
    if (next === "streets") {
      layerRef.current = L.tileLayer(
        "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        {
          maxZoom: 21,
          maxNativeZoom: 21,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          attribution: "Map data",
        }
      );
    } else if (next === "hybrid") {
      layerRef.current = L.tileLayer(
        "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        {
          maxZoom: 21,
          maxNativeZoom: 21,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          attribution: "Satellite + roads",
        }
      );
    } else if (next === "satellite") {
      layerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 20,
          maxNativeZoom: 19,
          crossOrigin: "anonymous",
          attribution: "Tiles &copy; Esri",
        }
      );
    } else {
      layerRef.current = L.tileLayer(
        "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        {
          maxZoom: 21,
          maxNativeZoom: 21,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          attribution: "Satellite imagery",
        }
      );
      labelsRef.current = L.tileLayer(
        "https://{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}",
        {
          maxZoom: 21,
          maxNativeZoom: 21,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          attribution: "",
        }
      );
      labelsRef.current.addTo(map);
    }
    layerRef.current.addTo(map);
  }

  function markerHtml(p: FieldPlant) {
    return `<div class="${tileClass(p)}" data-plant-marker="${p.number}" data-plant-kind="${plantKind(p)}"><span class="plant-tile__num">${p.number}</span></div>`;
  }

  function syncMarkers() {
    const L = Lref.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const keep = new Set<number>();

    for (const p of plantsRef.current) {
      const shot = photoRef.current;
      const ll =
        modeRef.current === "plan" && shot && p.photoX != null && p.photoY != null
          ? [p.photoY * shot.height, p.photoX * shot.width]
          : modeRef.current === "satellite" && p.lat != null && p.lng != null
            ? [p.lat, p.lng]
            : null;
      if (!ll) {
        const old = markersRef.current.get(p.number);
        if (old) {
          map.removeLayer(old);
          markersRef.current.delete(p.number);
        }
        continue;
      }
      keep.add(p.number);
      const icon = L.divIcon({
        className: "plant-map-marker",
        html: markerHtml(p),
        iconSize: [40, 38],
        iconAnchor: [20, 19],
      });
      let marker = markersRef.current.get(p.number);
      if (!marker) {
        marker = L.marker(ll, {
          icon,
          draggable: isAdmin,
          autoPan: true,
        });
        let dragged = false;
        marker.on("dragstart", () => {
          dragged = true;
        });
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          const shot = photoRef.current;
          const current = plantsRef.current.find((x) => x.number === p.number);
          if (modeRef.current === "plan" && shot) {
            void saveRef.current([
              {
                number: p.number,
                lat: current?.lat ?? null,
                lng: current?.lng ?? null,
                photoX: pos.lng / shot.width,
                photoY: pos.lat / shot.height,
              },
            ]);
          } else {
            void saveRef.current([
              {
                number: p.number,
                lat: pos.lat,
                lng: pos.lng,
                photoX: current?.photoX ?? null,
                photoY: current?.photoY ?? null,
              },
            ]);
          }
          window.setTimeout(() => {
            dragged = false;
          }, 80);
        });
        marker.on("click", () => {
          if (dragged) return;
          play("click");
          navigate(
            `/crops/${encodeURIComponent(crop)}/plants/${p.number}`
          );
        });
        marker.addTo(map);
        markersRef.current.set(p.number, marker);
      } else {
        marker.setLatLng(ll);
        marker.setIcon(icon);
        marker.dragging?.[isAdmin ? "enable" : "disable"]?.();
      }
    }

    for (const [n, marker] of markersRef.current) {
      if (keep.has(n)) continue;
      map.removeLayer(marker);
      markersRef.current.delete(n);
    }
  }

  useEffect(() => {
    if (!payload) return;
    let dead = false;
    void (async () => {
      try {
        const L = await loadLeaflet();
        if (dead || !mapEl.current) return;
        Lref.current = L;
        if (modeRef.current === "plan" && !photoRef.current) {
          if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
            markersRef.current.clear();
          }
          return;
        }
        if (!mapRef.current) {
          const shot = modeRef.current === "plan" ? photoRef.current : null;
          const map = shot
            ? L.map(mapEl.current, {
                crs: L.CRS.Simple,
                minZoom: -2,
                maxZoom: 2,
                zoomControl: true,
                attributionControl: false,
              })
            : L.map(mapEl.current, {
                zoomControl: true,
                attributionControl: true,
              });
          mapRef.current = map;
          if (shot) {
            const bounds = L.latLngBounds([
              [0, 0],
              [shot.height, shot.width],
            ]);
            L.imageOverlay(shot.imageData, bounds).addTo(map);
            map.fitBounds(bounds);
            map.setMaxBounds(bounds.pad(0.2));
          } else {
            const start = payload.map || DEFAULT_VIEW;
            map.setView(
              [start.lat, start.lng],
              start.zoom || DEFAULT_VIEW.zoom
            );
            applyLayer(L, map, layer);
          }
          map.on("click", (ev: any) => {
            const n = selectedRef.current;
            if (!isAdmin || n == null) return;
            const current = plantsRef.current.find((p) => p.number === n);
            const active = photoRef.current;
            if (modeRef.current === "plan" && active) {
              const photoX = ev.latlng.lng / active.width;
              const photoY = ev.latlng.lat / active.height;
              setPlants((prev) =>
                prev.map((p) =>
                  p.number === n ? { ...p, photoX, photoY } : p
                )
              );
              setSelected(null);
              void saveRef.current([
                {
                  number: n,
                  lat: current?.lat ?? null,
                  lng: current?.lng ?? null,
                  photoX,
                  photoY,
                },
              ]);
            } else {
              const { lat, lng } = ev.latlng;
              setPlants((prev) =>
                prev.map((p) => (p.number === n ? { ...p, lat, lng } : p))
              );
              setSelected(null);
              void saveRef.current([
                {
                  number: n,
                  lat,
                  lng,
                  photoX: current?.photoX ?? null,
                  photoY: current?.photoY ?? null,
                },
              ]);
            }
            play("save");
          });
          window.setTimeout(() => map.invalidateSize(), 80);
        }
        syncMarkers();
      } catch (err: any) {
        if (!dead) setError(err.message || "Map failed to load");
      }
    })();
    return () => {
      dead = true;
    };
  }, [payload, plants, isAdmin, crop, mapEpoch, mode]);

  useEffect(() => {
    const L = Lref.current;
    const map = mapRef.current;
    if (!L || !map || modeRef.current === "plan") return;
    applyLayer(L, map, layer);
  }, [layer]);

  async function saveView(nextLabel?: string) {
    if (!isAdmin || !mapRef.current) return;
    const c = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/saveCropFieldMap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          crop,
          lat: c.lat,
          lng: c.lng,
          zoom,
          layer,
          label: nextLabel !== undefined ? nextLabel : label,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      invalidateCache(`fieldMap:${crop}`);
      setMessage("Plantation view saved");
      window.setTimeout(() => setMessage(null), 2200);
    } catch (err: any) {
      setError(err.message || "Could not save view");
    } finally {
      setSaving(false);
    }
  }

  function rebuildMap() {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current.clear();
    setMapEpoch((n) => n + 1);
  }

  async function savePositions(
    positions: Array<{
      number: number;
      lat: number | null;
      lng: number | null;
      photoX?: number | null;
      photoY?: number | null;
    }>
  ) {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API}/savePlantPositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ crop, positions }),
      });
      if (!res.ok) throw new Error(await res.text());
      invalidateCache(`fieldMap:${crop}`);
      setPlants((prev) =>
        prev.map((p) => {
          const hit = positions.find((x) => x.number === p.number);
          return hit
            ? {
                ...p,
                lat: hit.lat,
                lng: hit.lng,
                photoX: hit.photoX ?? p.photoX,
                photoY: hit.photoY ?? p.photoY,
              }
            : p;
        })
      );
    } catch (err: any) {
      setError(err.message || "Could not save plant position");
    }
  }
  saveRef.current = savePositions;

  async function searchPlace(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `${API}/geocodePlace?q=${encodeURIComponent(query.trim())}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(await res.text());
      setHits(await res.json());
    } catch (err: any) {
      setError(err.message || "Place search failed");
    } finally {
      setSearching(false);
    }
  }

  function goToPlace(hit: PlaceHit) {
    const map = mapRef.current;
    const L = Lref.current;
    if (!map || mode !== "satellite") return;
    const hasBox =
      hit.south != null &&
      hit.north != null &&
      hit.west != null &&
      hit.east != null;
    if (hasBox && L) {
      map.fitBounds(
        [
          [hit.south, hit.west],
          [hit.north, hit.east],
        ],
        { maxZoom: Math.max(hit.zoom || 19, 19), padding: [24, 24] }
      );
    } else {
      map.setView([hit.lat, hit.lng], hit.zoom || 19);
    }
    setLabel(hit.label);
    setHits([]);
    setQuery(hit.label.split(",")[0] || hit.label);
    play("click");
    if (isAdmin) {
      window.setTimeout(() => void saveView(hit.label), 400);
    }
  }

  function placeRemainingGrid() {
    if (!isAdmin || !mapRef.current) return;
    const waiting = unplaced;
    if (!waiting.length) return;
    const cols = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(waiting.length))));
    const rows = Math.ceil(waiting.length / cols);
    let positions;
    if (onPlan && shownPhoto) {
      positions = waiting.map((p, i) => ({
        number: p.number,
        lat: p.lat,
        lng: p.lng,
        photoX: 0.18 + ((i % cols) / Math.max(1, cols - 1)) * 0.64,
        photoY: 0.18 + (Math.floor(i / cols) / Math.max(1, rows - 1)) * 0.64,
      }));
    } else {
      const center = mapRef.current.getCenter();
      const step = 0.000028;
      positions = waiting.map((p, i) => ({
        number: p.number,
        lat: center.lat + (Math.floor(i / cols) - rows / 2) * step,
        lng: center.lng + ((i % cols) - cols / 2) * step,
        photoX: p.photoX,
        photoY: p.photoY,
      }));
    }
    void unlockAudio();
    play("click");
    void savePositions(positions);
    setMessage("Remaining plants laid out on this view — drag to finish");
    window.setTimeout(() => setMessage(null), 2800);
  }

  async function choosePlan(file: File | null) {
    if (!isAdmin || !file) return;
    setError(null);
    try {
      const { dataUrl } = await compressImageFile(file, 1600, 0.78);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not read that image"));
        img.src = dataUrl;
      });
      setPending({
        imageData: dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      setMode("plan");
      rebuildMap();
      setMessage("Plan ready — press Save map to keep it, then drag the numbers");
    } catch (err: any) {
      play("error");
      setError(err.message || "Could not read that image");
    }
  }

  async function savePlan() {
    if (!isAdmin || !pending) return;
    setSaving(true);
    setError(null);
    void unlockAudio();
    try {
      const res = await fetch(`${API}/saveCropFieldPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          crop,
          imageData: pending.imageData,
          width: pending.width,
          height: pending.height,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPhoto(pending);
      setPending(null);
      invalidateCache(`fieldMap:${crop}`);
      play("save");
      setMessage("Plan image saved");
      window.setTimeout(() => setMessage(null), 2200);
    } catch (err: any) {
      play("error");
      setError(err.message || "Could not save the plan");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!isAdmin || !photo) return;
    if (!window.confirm("Remove the saved plan image for this crop?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/saveCropFieldPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ crop, clear: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPhoto(null);
      setPending(null);
      setMode("satellite");
      invalidateCache(`fieldMap:${crop}`);
      rebuildMap();
      play("save");
      setMessage("Plan image removed");
    } catch (err: any) {
      play("error");
      setError(err.message || "Could not remove the plan");
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!mapEl.current) return;
    setExporting(true);
    setError(null);
    void unlockAudio();
    play("click");
    try {
      const imageData = await captureFieldMapJpeg(mapEl.current);
      const res = await fetch(`${API}/exportFieldMapPdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          crop,
          imageData,
          layer: onPlan ? "plan" : layer,
          label: onPlan ? label || "Land plan" : label,
        }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        filename: string;
        mime: string;
        base64: string;
      };
      downloadBase64(data.filename, data.mime, data.base64);
      play("save");
    } catch (err: any) {
      play("error");
      setError(err.message || "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-container animate-rise">
      <header className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          className="glass-btn"
          onClick={() =>
            navigate(`/crops/${encodeURIComponent(crop)}/plants`)
          }
        >
          ← Open plant map
        </button>
        <div className="text-center flex-1">
          <p className="eyebrow">MAP</p>
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
          <p className="text-sm text-gold-muted mt-2">{summaryLine}</p>
        </div>
        <SoundToggle />
      </header>

      <section className="glass-card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          {mode === "satellite" && (
            <form
              onSubmit={searchPlace}
              className="flex-1 min-w-[220px] flex flex-wrap items-end gap-2"
            >
              <label className="block flex-1 min-w-[180px]">
                <span className="eyebrow mb-1 block">Find the plantation</span>
                <input
                  className="glass-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="31, Ambalangoda, Polgasowita…"
                />
              </label>
              <button type="submit" className="glass-btn" disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </button>
            </form>
          )}
          <div className="entry-type-toggle" role="tablist" aria-label="Map type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "satellite"}
              className={mode === "satellite" ? "is-active" : ""}
              onClick={() => {
                if (mode === "satellite") return;
                setMode("satellite");
                rebuildMap();
              }}
            >
              Satellite
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "plan"}
              className={mode === "plan" ? "is-active" : ""}
              onClick={() => {
                if (mode === "plan") return;
                setHits([]);
                setMode("plan");
                rebuildMap();
              }}
            >
              Plan image
            </button>
          </div>
          {mode === "satellite" && (
            <div className="entry-type-toggle" role="tablist" aria-label="Satellite style">
              <button
                type="button"
                role="tab"
                aria-selected={layer === "hybrid"}
                className={layer === "hybrid" ? "is-active" : ""}
                onClick={() => {
                  setLayer("hybrid");
                  rebuildMap();
                }}
              >
                Roads
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layer === "hd"}
                className={layer === "hd" ? "is-active" : ""}
                onClick={() => {
                  setLayer("hd");
                  rebuildMap();
                }}
              >
                Names
              </button>
            </div>
          )}
          {mode === "plan" && isAdmin && (
            <>
              <button
                type="button"
                className="glass-btn"
                onClick={() => photoInput.current?.click()}
              >
                {shownPhoto ? "Choose another image" : "Choose plan image"}
              </button>
              <button
                type="button"
                className="glass-btn gold-btn"
                disabled={!pending || saving}
                onClick={() => void savePlan()}
              >
                {saving ? "Saving…" : "Save map"}
              </button>
              <button
                type="button"
                className="glass-btn"
                disabled={!photo || saving}
                onClick={() => void removePlan()}
              >
                Remove map
              </button>
            </>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = "";
              void choosePlan(file);
            }}
          />
          {isAdmin && mode === "satellite" && (
            <button
              type="button"
              className="glass-btn gold-btn"
              disabled={saving}
              onClick={() => void saveView()}
            >
              {saving ? "Saving…" : "Save this view"}
            </button>
          )}
          <button
            type="button"
            className="glass-btn gold-btn"
            disabled={exporting}
            onClick={() => void exportPdf()}
          >
            {exporting ? "Preparing…" : "Export PDF"}
          </button>
        </div>
        {label && (
          <p className="text-sm text-gold-muted mt-3">Saved place: {label}</p>
        )}
        {hits.length > 0 && (
          <ul className="field-search-hits">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lng},${h.label}`}>
                <button type="button" onClick={() => goToPlace(h)}>
                  {h.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gold-muted mt-3">
          {mode === "satellite"
            ? "Search the road, then drag a number tile onto the plot. Tap a number in the tray and tap the map to drop it."
            : pending
              ? "This plan image is not saved yet. Save map stores it. Drag the numbers onto the house and the rows."
              : photo
                ? "Drag the numbers on this plan. Save map replaces the picture. Remove map clears it. Satellite search stays on the other tab."
                : "Choose a screenshot or sketched plan. Then drag the number tiles onto it."}
        </p>
      </section>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {message && <p className="text-emerald-300 text-sm mb-3">{message}</p>}

      <div className="field-map-shell glass-card p-2 md:p-3">
        {mode === "plan" && !shownPhoto ? (
          <div className="map-plan-empty">
            <p className="font-display text-2xl text-gold mb-2">No plan image yet</p>
            <p className="text-sm text-gold-muted max-w-md mx-auto">
              Choose a PNG or screenshot of the land. Number tiles can be
              dragged on it after that. Satellite search stays on the other tab.
            </p>
          </div>
        ) : (
          <div ref={mapEl} className="field-map-canvas" />
        )}
      </div>

      <section className="glass-card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="eyebrow">Plant tiles</p>
            <h2 className="font-display text-xl text-gold">
              {selected != null
                ? `Tap the map to place plant ${selected}`
                : "Unplaced numbers"}
            </h2>
          </div>
          {isAdmin && unplaced.length > 0 && (
            <button
              type="button"
              className="glass-btn"
              onClick={placeRemainingGrid}
            >
              Place remaining on this view
            </button>
          )}
        </div>
        {unplaced.length === 0 ? (
          <p className="text-sm text-gold-muted">
            Every plant has a spot. Drag a tile on the map to move it, or click
            it to open notes.
          </p>
        ) : (
          <div className="plant-tray">
            {unplaced.map((p) => (
              <button
                key={p.number}
                type="button"
                id={`plant-tile-${p.number}`}
                className={`${tileClass(p)} ${selected === p.number ? "is-highlight" : ""}`}
                disabled={!isAdmin}
                onClick={() => {
                  if (!isAdmin) return;
                  play("click");
                  setSelected((cur) => (cur === p.number ? null : p.number));
                }}
                title={`Plant ${p.number}`}
              >
                <span className="plant-tile__num">{p.number}</span>
              </button>
            ))}
          </div>
        )}
        {isAdmin && placed.length > 0 && (
          <p className="text-xs text-gold-muted mt-3">
            Drag tiles on this map to match the real rows. Click a placed tile
            to open that plant.
          </p>
        )}
      </section>
    </div>
  );
}
