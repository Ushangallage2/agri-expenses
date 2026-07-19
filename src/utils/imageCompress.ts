/** Compress an image file to a JPEG data URL for storage. */
export async function compressImageFile(
  file: File,
  maxEdge = 1280,
  quality = 0.72
): Promise<{ dataUrl: string; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  // ~1.4MB data URL ceiling for Netlify function payloads
  if (dataUrl.length > 1_400_000) {
    return compressImageFile(file, Math.round(maxEdge * 0.75), quality * 0.85);
  }

  return { dataUrl, mimeType: "image/jpeg" };
}
