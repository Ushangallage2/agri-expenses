function pdfEscape(s: string) {
  return String(s)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function jpegSize(buf: Buffer): { w: number; h: number } {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3
    ) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 1600, h: 900 };
}

export function buildFieldMapPdf(opts: {
  crop: string;
  layer: string;
  label?: string | null;
  placed: number;
  total: number;
  issuedAt: string;
  jpeg: Buffer;
}): Buffer {
  const pageW = 841.89;
  const pageH = 595.28;
  const margin = 36;
  const { w: imgW, h: imgH } = jpegSize(opts.jpeg);
  const maxW = pageW - margin * 2;
  const maxH = pageH - 92;
  const scale = Math.min(maxW / imgW, maxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const imgX = (pageW - drawW) / 2;
  const imgY = 28;

  const issued = new Date(opts.issuedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const layerLabel =
    opts.layer === "plan"
      ? "Land plan"
      : opts.layer === "streets"
        ? "Streets"
        : opts.layer === "hybrid"
          ? "Satellite + roads"
          : opts.layer === "hd"
            ? "Satellite + names"
            : opts.layer === "satellite"
              ? "Archive satellite"
              : "Satellite";
  const place = opts.label ? `  -  ${opts.label}` : "";

  const content = [
    "0.07 0.063 0.055 rg 0 0 841.89 595.28 re f",
    "0.659 0.537 0.176 rg 0 553 841.89 42.28 re f",
    "0.831 0.608 0.176 rg 0 549 841.89 4 re f",
    `BT /F2 16 Tf 0.831 0.608 0.176 rg 36 568 Td (AGRI LEDGER) Tj ET`,
    `BT /F1 8 Tf 0.788 0.722 0.588 rg 36 556 Td (PLANTATION MAP  -  ${pdfEscape(layerLabel)}) Tj ET`,
    `BT /F2 11 Tf 0.969 0.945 0.894 rg 220 568 Td (${pdfEscape(opts.crop)}${pdfEscape(place)}) Tj ET`,
    `BT /F1 8 Tf 0.788 0.722 0.588 rg 220 556 Td (${opts.placed} of ${opts.total} plants placed  -  ${pdfEscape(issued)}) Tj ET`,
    `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm /Im1 Do Q`,
  ].join("\n");

  const stream = Buffer.from(content, "utf8");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${opts.jpeg.length} >>\nstream\n`,
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const xref = [0];
  let offset = chunks[0].length;

  function pushObj(i: number, body: Buffer) {
    xref.push(offset);
    const head = Buffer.from(`${i} 0 obj\n`);
    const tail = Buffer.from("\nendobj\n");
    const block = Buffer.concat([head, body, tail]);
    chunks.push(block);
    offset += block.length;
  }

  for (let i = 0; i < 6; i++) {
    pushObj(i + 1, Buffer.from(objects[i], "utf8"));
  }
  pushObj(
    7,
    Buffer.concat([
      Buffer.from(objects[6], "utf8"),
      opts.jpeg,
      Buffer.from("\nendstream"),
    ])
  );

  const xrefStart = offset;
  let xrefTable = `xref\n0 8\n0000000000 65535 f \n`;
  for (let i = 1; i <= 7; i++) {
    xrefTable += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(Buffer.from(xrefTable, "utf8"));
  chunks.push(Buffer.from(trailer, "utf8"));
  return Buffer.concat(chunks);
}
