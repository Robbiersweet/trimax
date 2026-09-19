export type OpticalImage = {
  label: string;
  mime: string;
  base64: string;
  width: number;
  height: number;
  exifOrientation: number | null;
  rotation: number;
  source: string;
  transformation: string;
};
export type OpticalEvidence = {
  startedAt?: number;
  timings?: { orientationProbeMs:number; detailedOcrMs:number; recoveryMs:number; totalMs:number };
  images: OpticalImage[];
  notes: string[];
  probe?: unknown;
};
// Read only Orientation. Do not retain GPS, device serials or unrelated EXIF fields.
export function jpegOrientation(bytes: Uint8Array): {
  orientation: number | null;
  offset: number | null;
  littleEndian: boolean;
} {
  const empty = { orientation: null, offset: null, littleEndian: false };
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || v.getUint16(0) !== 0xffd8) return empty;
  for (let p = 2; p + 4 <= bytes.length;) {
    if (bytes[p] !== 255) break;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const n = v.getUint16(p + 2);
    if (n < 2 || p + 2 + n > bytes.length) break;
    if (
      marker === 0xe1 &&
      n >= 16 &&
      String.fromCharCode(...bytes.slice(p + 4, p + 10)) === "Exif\0\0"
    ) {
      const t = p + 10,
        end = p + 2 + n,
        le = v.getUint16(t) === 0x4949;
      if (!le && v.getUint16(t) !== 0x4d4d) return empty;
      if (v.getUint16(t + 2, le) !== 42) return empty;
      const dir = t + v.getUint32(t + 4, le);
      if (dir < t || dir + 2 > end) return empty;
      const count = v.getUint16(dir, le);
      for (let i = 0; i < count; i++) {
        const e = dir + 2 + i * 12;
        if (e + 12 > end) break;
        if (
          v.getUint16(e, le) === 0x112 &&
          v.getUint16(e + 2, le) === 3 &&
          v.getUint32(e + 4, le) === 1
        ) {
          const o = v.getUint16(e + 8, le);
          return o >= 1 && o <= 8
            ? { orientation: o, offset: e + 8, littleEndian: le }
            : empty;
        }
      }
    }
    p += n + 2;
  }
  return empty;
}
export function orientationTransform(
  o: number,
  w: number,
  h: number,
): [number, number, number, number, number, number] {
  return (
    (
      {
        1: [1, 0, 0, 1, 0, 0],
        2: [-1, 0, 0, 1, w, 0],
        3: [-1, 0, 0, -1, w, h],
        4: [1, 0, 0, -1, 0, h],
        5: [0, 1, 1, 0, 0, 0],
        6: [0, 1, -1, 0, h, 0],
        7: [0, -1, -1, 0, h, w],
        8: [0, -1, 1, 0, 0, w],
      } as Record<number, [number, number, number, number, number, number]>
    )[o] ?? [1, 0, 0, 1, 0, 0]
  );
}
export function opticalScore(text: string, confidence = 0) {
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  const meaningful = words.filter(
    (w) => w.length >= 2 && /[A-Za-z]/.test(w) && !/^([A-Za-z0-9])\1+$/.test(w),
  );
  const invoices = (
    text.match(/\b(?:INV|INVOICE)\s*[-#: ]?\s*[0-9OoIl]{3,8}\b/gi) ?? []
  ).length;
  const dates = (text.match(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g) ?? []).length;
  const money = (text.match(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g) ?? []).length;
  const headers = (
    text.match(
      /\b(?:invoice|remittance|check|payor|date|total|amount|payment|balance)\b/gi,
    ) ?? []
  ).length;
  const units = (text.match(/\b[A-Z]\d{2}\b/g) ?? []).length;
  const rows = text
    .split(/\n/)
    .filter((l) => /[A-Za-z]/.test(l) && /\d+\.\d{2}\b/.test(l)).length;
  const unique = new Set(meaningful.map((w) => w.toLowerCase())).size;
  const credible =
    meaningful.length >= 4 &&
    unique >= 4 &&
    ((invoices >= 1 && money >= 1) ||
      (headers >= 2 && (money >= 1 || dates >= 1)) ||
      (rows >= 2 && money >= 2 && (dates >= 1 || units >= 1)));
  const structural =
    invoices * 120 +
    dates * 30 +
    money * 20 +
    headers * 30 +
    units * 15 +
    rows * 50;
  const noisePenalty =
    meaningful.length < 4 ? 300 : unique < meaningful.length / 3 ? 200 : 0;
  const score =
    (credible ? 10000 : 0) +
    structural +
    Math.min(unique, 40) * 2 +
    (credible ? Math.min(Math.max(confidence, 0), 100) / 10 : 0) -
    noisePenalty;
  return {
    credible,
    score,
    invoices,
    dates,
    money,
    headers,
    units,
    rows,
    meaningfulWords: meaningful.length,
    uniqueWords: unique,
    noisePenalty,
    confidenceBonus: credible ? Math.min(Math.max(confidence, 0), 100) / 10 : 0,
  };
}
