import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

type OsmHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_type?: string;
  boundingbox?: string[];
  type?: string;
  class?: string;
  addresstype?: string;
  importance?: number;
};

type PlaceHit = {
  label: string;
  lat: number;
  lng: number;
  south: number | null;
  north: number | null;
  west: number | null;
  east: number | null;
  zoom: number;
};

function bboxOf(row: OsmHit) {
  const b = row.boundingbox || [];
  const south = Number(b[0]);
  const north = Number(b[1]);
  const west = Number(b[2]);
  const east = Number(b[3]);
  if (![south, north, west, east].every(Number.isFinite)) {
    return { south: null, north: null, west: null, east: null };
  }
  return { south, north, west, east };
}

function zoomFor(row: OsmHit) {
  const kind = `${row.addresstype || ""} ${row.type || ""} ${row.class || ""}`;
  if (/house|building|yes/i.test(kind)) return 20;
  if (/road|residential|tertiary|secondary|living/i.test(kind)) return 19;
  if (/village|suburb|hamlet|neighbourhood/i.test(kind)) return 16;
  if (/town|city|municipality/i.test(kind)) return 14;
  return 17;
}

function score(row: OsmHit, q: string) {
  const label = String(row.display_name || "").toLowerCase();
  const query = q.toLowerCase();
  let n = Number(row.importance) || 0;
  if (label.includes("polgasowita")) n += 2;
  if (label.includes("colombo")) n += 0.6;
  if (label.includes("10320")) n += 0.8;
  if (label.includes("ambalangoda-palagama")) n += 1.2;
  if (label.includes("galle") && query.includes("polgasowita")) n -= 2;
  if (query.includes("polgasowita") && !label.includes("polgasowita")) n -= 1.5;
  return n;
}

async function nominatim(q: string): Promise<OsmHit[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      limit: "8",
      addressdetails: "1",
      countrycodes: "lk",
    }).toString();
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AgriLedger/1.0 (plantation field map)",
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as OsmHit[];
}

function queriesFrom(raw: string) {
  const q = raw.replace(/\s+/g, " ").trim();
  const out = [q];
  if (!/sri lanka/i.test(q)) out.push(`${q}, Sri Lanka`);
  if (/polgasowita/i.test(q) && /ambalangoda/i.test(q)) {
    out.push("Ambalangoda-Palagama Road, Polgasowita, Sri Lanka");
    out.push("Ambalangoda, Polgasowita, Colombo District, Sri Lanka");
  }
  return [...new Set(out)];
}

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const q = String(event.queryStringParameters?.q || "").trim();
    if (q.length < 2) return { statusCode: 400, body: "q required" };

    const seen = new Set<string>();
    const merged: OsmHit[] = [];
    for (const query of queriesFrom(q)) {
      const rows = await nominatim(query);
      for (const row of rows) {
        const key = `${row.osm_type || ""}:${row.lat}:${row.lon}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
      }
    }

    const hits: PlaceHit[] = merged
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const box = bboxOf(r);
        return {
          label: String(r.display_name || "").slice(0, 200),
          lat,
          lng,
          ...box,
          zoom: zoomFor(r),
        };
      })
      .filter((r): r is PlaceHit => !!r)
      .sort((a, b) => {
        const ra = merged.find((r) => Number(r.lat) === a.lat) || {};
        const rb = merged.find((r) => Number(r.lat) === b.lat) || {};
        return score(rb as OsmHit, q) - score(ra as OsmHit, q);
      })
      .slice(0, 8);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hits),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
