import type { Handler } from "@netlify/functions";
import { requireAuth } from "../../src/utils/requireAuth";
import { buildFieldMapPdf } from "./utils/fieldMapPdf";
import { getCropPlantMeta } from "./utils/plantMapDb";
import { getCropMapView, listPlantPositions } from "./utils/cropFieldMapDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const crop = String(body.crop || "").trim();
  const imageData = String(body.imageData || "");
  if (!crop || !imageData.startsWith("data:image/jpeg")) {
    return { statusCode: 400, body: "crop and JPEG imageData required" };
  }
  if (imageData.length > 1_800_000) {
    return { statusCode: 400, body: "Map image too large" };
  }

  try {
    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };
    const [view, positions] = await Promise.all([
      getCropMapView(crop),
      listPlantPositions(crop),
    ]);

    const b64 = imageData.replace(/^data:image\/jpeg;base64,/, "");
    const jpeg = Buffer.from(b64, "base64");
    const pdf = buildFieldMapPdf({
      crop: meta.name,
      layer: view?.layer || String(body.layer || "satellite"),
      label: view?.label || body.label || null,
      placed: positions.length,
      total: meta.displayCount,
      issuedAt: new Date().toISOString(),
      jpeg,
    });

    const day = new Date().toISOString().slice(0, 10);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `Agri-Ledger-Plantation-Map-${day}.pdf`,
        mime: "application/pdf",
        base64: pdf.toString("base64"),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Failed to export map" };
  }
};

export const handler = requireAuth(baseHandler);
