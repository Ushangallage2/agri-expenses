function loadCorsImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Snapshot the Leaflet map + plant tiles as a JPEG data URL. */
export async function captureFieldMapJpeg(
  container: HTMLElement
): Promise<string> {
  const rect = container.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(240, Math.round(rect.height));
  const scale = Math.min(2, 1600 / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not capture map");

  ctx.fillStyle = "#0b120e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tiles = Array.from(
    container.querySelectorAll("img.leaflet-tile, img.leaflet-image-layer")
  ) as HTMLImageElement[];

  for (const tile of tiles) {
    if (!tile.src || tile.naturalWidth < 2) continue;
    const r = tile.getBoundingClientRect();
    const dx = (r.left - rect.left) * scale;
    const dy = (r.top - rect.top) * scale;
    const dw = r.width * scale;
    const dh = r.height * scale;
    if (tile.src.startsWith("data:")) {
      ctx.drawImage(tile, dx, dy, dw, dh);
      continue;
    }
    const clean = await loadCorsImage(tile.src);
    if (!clean) continue;
    ctx.drawImage(clean, dx, dy, dw, dh);
  }

  const markers = Array.from(
    container.querySelectorAll("[data-plant-marker]")
  ) as HTMLElement[];

  for (const el of markers) {
    const r = el.getBoundingClientRect();
    const cx = (r.left - rect.left + r.width / 2) * scale;
    const cy = (r.top - rect.top + r.height / 2) * scale;
    const radius = Math.max(11, (r.width / 2) * scale);
    const n = el.getAttribute("data-plant-marker") || "";
    const kind = el.getAttribute("data-plant-kind") || "empty";

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (kind === "todo") ctx.fillStyle = "#d97706";
    else if (kind === "busy") ctx.fillStyle = "#b8860b";
    else ctx.fillStyle = "#1c1917";
    ctx.fill();
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = "#f5d76e";
    ctx.stroke();

    ctx.fillStyle = "#f7f1e4";
    ctx.font = `700 ${Math.max(10, 11 * scale)}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, cx, cy);
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl.length > 1_700_000) {
    return canvas.toDataURL("image/jpeg", 0.62);
  }
  return dataUrl;
}
