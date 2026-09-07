import { crc32 } from "node:zlib";

function dosDateTime(d = new Date()) {
  const dt =
    ((d.getFullYear() - 1980) << 9) |
    ((d.getMonth() + 1) << 5) |
    d.getDate();
  const tm =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { dt, tm };
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

/** Uncompressed ZIP (store), enough for a valid .docx. */
export function zipStore(files: { name: string; data: Buffer | string }[]) {
  const { dt, tm } = dosDateTime();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data, "utf8");
    const crc = crc32(data) >>> 0;
    const local = Buffer.concat([
      Buffer.from("PK\u0003\u0004", "binary"),
      u16(20),
      u16(0),
      u16(0),
      u16(tm),
      u16(dt),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    locals.push(local);
    const central = Buffer.concat([
      Buffer.from("PK\u0001\u0002", "binary"),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(tm),
      u16(dt),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    Buffer.from("PK\u0005\u0006", "binary"),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDir, end]);
}
