import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { guessMapping } from "./fields";

export type SheetInfo = { name: string; rows: number };

export type ParseResult = {
  sha256: string;
  sheets: SheetInfo[];
  sheetName: string;
  headers: string[];
  headerRow: number;
  rows: Record<string, unknown>[];   // sudah memakai header sebagai kunci
  firstDataRow: number;              // nomor baris Excel untuk rows[0]
  sample: Record<string, unknown>[];
  mapping: Record<string, string>;
};

/** Nama sheet yang biasa dipakai tim data, diurutkan berdasarkan tipe. */
const SHEET_HINTS: Record<string, string[]> = {
  kpi: ["kpi calculation", "kpi", "calculation"],
  insentif: ["insentif calc", "insentif", "incentive"],
};

export async function parseWorkbook(
  blobUrl: string,
  tipe: string,
  pilihSheet?: string,
): Promise<ParseResult> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error("Berkas tidak bisa diambil dari penyimpanan.");
  const buf = Buffer.from(await res.arrayBuffer());

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

  const sheets: SheetInfo[] = wb.SheetNames.map((name) => {
    const ref = wb.Sheets[name]["!ref"];
    return { name, rows: ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0 };
  });

  const sheetName = pilihSheet ?? pilihSheetOtomatis(wb.SheetNames, tipe);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" tidak ada di berkas ini.`);

  // Baca sebagai matriks agar baris header bisa dideteksi sendiri
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1, raw: true, defval: null, blankrows: false,
  });

  const headerRow = cariBarisHeader(matrix);
  const headers = (matrix[headerRow] ?? []).map((h, i) =>
    String(h ?? "").trim() || `Kolom ${XLSX.utils.encode_col(i)}`,
  );

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every((c) => c === null || c === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => (obj[h] = raw[i] ?? null));
    obj.__row = r + 1; // nomor baris seperti terlihat di Excel
    rows.push(obj);
  }

  return {
    sha256, sheets, sheetName, headers,
    headerRow: headerRow + 1,
    rows,
    firstDataRow: headerRow + 2,
    sample: rows.slice(0, 5),
    mapping: guessMapping(headers, tipe),
  };
}

function pilihSheetOtomatis(names: string[], tipe: string): string {
  const hints = SHEET_HINTS[tipe] ?? [];
  for (const h of hints) {
    const found = names.find((n) => n.toLowerCase().includes(h));
    if (found) return found;
  }
  return names[0];
}

/** Baris header = baris dengan sel terisi terbanyak di 15 baris pertama. */
function cariBarisHeader(matrix: any[][]): number {
  let best = 0, bestCount = -1;
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const count = (matrix[r] ?? []).filter(
      (c) => c !== null && c !== "" && typeof c !== "number",
    ).length;
    if (count > bestCount) { bestCount = count; best = r; }
  }
  return best;
}
