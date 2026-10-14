import * as XLSX from "xlsx";
import { q } from "./db";

/**
 * Unggah Grading & Tier Cabang via Excel.
 *
 * FORMAT DINAMIS: seluruh format (template, lembar Petunjuk, pembacaan
 * berkas, dan perintah simpan) diturunkan dari satu daftar, KOLOM, di bawah.
 * Menambah kolom baru = menambah SATU entri di daftar itu:
 *   - ikut muncul di template & petunjuk;
 *   - dikenali saat membaca berkas lewat NAMA JUDUL (urutan kolom di Excel
 *     bebas, kolom opsional boleh tidak ada);
 *   - bila entri punya `db`, otomatis ikut disimpan ke tabel cabang_kelas
 *     (kolom tabelnya harus sudah ada lewat migrasi).
 * Kolom di berkas yang tidak dikenal tidak membuat berkas ditolak; hanya
 * diberi peringatan dan diabaikan.
 */

export const KELAS = ["large", "medium", "small"] as const;

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const kunciHeader = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Konteks = {
  cabang: Map<string, string>;     // norm(nama|branch_id) -> nama kanonik
  produk: Map<string, string>;     // norm(kode) -> kode
  periodeBawaan: string;           // YYYY-MM-01
};
type Hasil<T> = { nilai: T } | { galat: string };

type Kolom = {
  key: string;
  header: string;
  alias?: string[];
  wajib: boolean;
  /** Bagian kunci baris (cabang, produk, berlaku_mulai) atau nilai biasa. */
  peran: "kunci" | "nilai" | "referensi";
  /** Nama kolom di cabang_kelas; kosong = tidak disimpan. */
  db?: string;
  tipeSql?: "text" | "int" | "date";
  lebar: number;
  petunjuk: string;
  baca: (v: unknown, k: Konteks) => Hasil<unknown>;
};

/** "2026-10", "2026-10-01", tanggal Excel, atau "10/2026" -> YYYY-MM-01. */
function bacaPeriode(v: unknown): string | null {
  if (v instanceof Date) {
    const j = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(t);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  return null;
}

const PETA_KELAS: Record<string, string> = {
  LARGE: "large", L: "large", BESAR: "large",
  MEDIUM: "medium", M: "medium", SEDANG: "medium",
  SMALL: "small", S: "small", KECIL: "small",
};

/** ===== DAFTAR KOLOM — satu-satunya tempat format didefinisikan. ===== */
export const KOLOM: Kolom[] = [
  {
    key: "periode", header: "Periode", alias: ["Berlaku Mulai", "Periode Berlaku"],
    wajib: false, peran: "kunci", db: "berlaku_mulai", tipeSql: "date", lebar: 12,
    petunjuk: "Bulan mulai berlaku, format YYYY-MM (mis. 2026-10). Kosong = memakai periode yang dipilih saat unggah. Berlaku untuk periode itu dan seterusnya sampai ada baris yang lebih baru.",
    baca: (v, k) => {
      if (v === "" || v === null || v === undefined) return { nilai: k.periodeBawaan };
      const p = bacaPeriode(v);
      return p ? { nilai: p } : { galat: `Periode "${v}" tidak terbaca (pakai format YYYY-MM).` };
    },
  },
  {
    key: "cabang", header: "Cabang", alias: ["Kantor Cabang", "Nama Cabang", "Branch", "Branch ID"],
    wajib: true, peran: "kunci", db: "cabang", tipeSql: "text", lebar: 22,
    petunjuk: "Nama cabang persis seperti di Master Cabang API (kode cabang juga diterima).",
    baca: (v, k) => {
      const t = norm(v);
      if (!t) return { galat: "Cabang kosong." };
      const ada = k.cabang.get(t);
      return ada ? { nilai: ada } : { galat: `Cabang "${String(v).trim()}" tidak ada di Master Cabang API aktif.` };
    },
  },
  {
    key: "area", header: "Area", alias: [], wajib: false, peran: "referensi", lebar: 16,
    petunjuk: "Hanya referensi, TIDAK diimpor (area dikelola di Master Cabang API).",
    baca: () => ({ nilai: null }),
  },
  {
    key: "produk", header: "Produk", alias: ["Product"],
    wajib: true, peran: "kunci", db: "produk", tipeSql: "text", lebar: 10,
    petunjuk: "Kode produk dari Master Produk (mis. R2, R4).",
    baca: (v, k) => {
      const t = norm(v);
      if (!t) return { galat: "Produk kosong." };
      const ada = k.produk.get(t);
      return ada ? { nilai: ada } : { galat: `Produk "${String(v).trim()}" tidak ada di Master Produk aktif.` };
    },
  },
  {
    key: "kelas", header: "Grading", alias: ["Kelas", "Kelas Cabang", "Grade"],
    wajib: true, peran: "nilai", db: "kelas", tipeSql: "text", lebar: 11,
    petunjuk: "Large, Medium, atau Small.",
    baca: (v) => {
      const t = norm(v);
      if (!t) return { galat: "Grading kosong." };
      const k = PETA_KELAS[t];
      return k ? { nilai: k } : { galat: `Grading "${String(v).trim()}" tidak dikenal (Large/Medium/Small).` };
    },
  },
  {
    key: "tier", header: "Tier Cabang", alias: ["Tier"],
    wajib: false, peran: "nilai", db: "tier", tipeSql: "int", lebar: 12,
    petunjuk: "Angka 1 sampai 5 (default tier per bucket di Target Tier). Sel kosong = tanpa Tier Cabang; bila baris periode itu sudah punya tier, nilainya ikut dikosongkan.",
    baca: (v) => {
      if (v === "" || v === null || v === undefined) return { nilai: null };
      const n = Number(String(v).replace(",", "."));
      return Number.isInteger(n) && n >= 1 && n <= 5 ? { nilai: n } : { galat: `Tier Cabang "${v}" harus angka 1 sampai 5.` };
    },
  },
];

/** Ringkasan kolom untuk ditampilkan di UI (ikut berubah otomatis). */
export const kolomUntukUI = () => KOLOM.map((k) => ({
  header: k.header, wajib: k.wajib, impor: k.peran !== "referensi", petunjuk: k.petunjuk,
}));

/* ------------------------------------------------------------------ */

async function muatKonteks(periodeBawaan: string) {
  const [cab, prod] = await Promise.all([
    q<{ branch_id: string; cabang: string; area: string | null }>(
      `SELECT branch_id, cabang, area FROM cabang_api WHERE aktif ORDER BY area NULLS LAST, cabang`),
    q<{ kode: string; nama: string }>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),
  ]);
  const cabang = new Map<string, string>();
  for (const c of cab) { cabang.set(norm(c.cabang), c.cabang); if (c.branch_id) cabang.set(norm(c.branch_id), c.cabang); }
  const produk = new Map(prod.map((p) => [norm(p.kode), p.kode]));
  const k: Konteks = { cabang, produk, periodeBawaan };
  return { k, cab, prod };
}

/* ------------------------------ Template ---------------------------- */

export async function buatTemplate(periode: string): Promise<Buffer> {
  const { cab, prod } = await muatKonteks(periode);
  const sekarang = await q<any>(
    `SELECT DISTINCT ON (cabang, produk) cabang, produk, kelas, tier
       FROM cabang_kelas WHERE berlaku_mulai <= $1::date
      ORDER BY cabang, produk, berlaku_mulai DESC`, [periode]);
  const peta = new Map(sekarang.map((r: any) => [`${norm(r.cabang)}|${norm(r.produk)}`, r]));

  const header = KOLOM.map((k) => k.header);
  const data = cab.flatMap((c) => prod.map((p) => {
    const r: any = peta.get(`${norm(c.cabang)}|${norm(p.kode)}`);
    const o: Record<string, unknown> = {};
    for (const k of KOLOM) {
      if (k.key === "periode") o[k.header] = periode.slice(0, 7);
      else if (k.key === "cabang") o[k.header] = c.cabang;
      else if (k.key === "area") o[k.header] = c.area ?? "";
      else if (k.key === "produk") o[k.header] = p.kode;
      else if (k.key === "kelas") o[k.header] = r?.kelas ? String(r.kelas).replace(/^./, (x: string) => x.toUpperCase()) : "";
      else o[k.header] = r?.[k.db ?? k.key] ?? "";
    }
    return o;
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { header });
  ws["!cols"] = KOLOM.map((k) => ({ wch: k.lebar }));
  XLSX.utils.book_append_sheet(wb, ws, "GRADING CABANG");

  const petunjuk: (string | number)[][] = [["Kolom", "Wajib", "Keterangan"],
    ...KOLOM.map((k) => [k.header, k.wajib ? "Ya" : "Tidak", k.petunjuk]),
    [],
    ["Cara pakai", "", "Satu baris = satu pasangan cabang × produk. Urutan kolom bebas; yang dibaca adalah NAMA judul kolom."],
    ["", "", "Kolom tambahan yang tidak dikenal akan diabaikan. Baris lama di sistem tidak dihapus: baris baru berlaku mulai periodenya dan menjadi riwayat."],
    ["", "", "Template ini sudah terisi grading yang berlaku untuk periode " + periode.slice(0, 7) + "; ubah hanya yang perlu."]];
  const wp = XLSX.utils.aoa_to_sheet(petunjuk);
  wp["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");

  const ref: (string)[][] = [["Produk", "Nama produk"], ...prod.map((p) => [p.kode, p.nama])];
  const wr = XLSX.utils.aoa_to_sheet(ref);
  wr["!cols"] = [{ wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wr, "Referensi");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ------------------------------- Baca ------------------------------- */

export type BarisGrading = Record<string, any> & { _baris: number };
export type HasilBaca = {
  baris: BarisGrading[];
  galat: string[];
  peringatan: string[];
  kolomDikenal: string[];
  kolomAbaikan: string[];
  ringkas: { barisFile: number; baru: number; berubah: number; sama: number };
  contoh: { cabang: string; produk: string; periode: string; kelas: string; tier: number | null; status: string }[];
};

export async function bacaFile(buf: ArrayBuffer, periodeBawaan: string): Promise<HasilBaca> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const nama = wb.SheetNames.find((n) => /grading|kelas|cabang/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[nama];
  if (!ws || !ws["!ref"]) throw new Error("Berkas tidak punya lembar data yang bisa dibaca.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });

  const peta = new Map<string, Kolom>();
  for (const k of KOLOM) for (const h of [k.header, ...(k.alias ?? [])]) peta.set(kunciHeader(h), k);

  // Baris judul = baris pertama (dari 10 teratas) yang memuat semua kolom wajib.
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const ada = new Set(rows[i].map((c) => peta.get(kunciHeader(c))?.key).filter(Boolean));
    if (KOLOM.filter((k) => k.wajib).every((k) => ada.has(k.key))) { hIdx = i; break; }
  }
  const wajibTeks = KOLOM.filter((k) => k.wajib).map((k) => k.header).join(", ");
  if (hIdx < 0) throw new Error(`Baris judul tidak ditemukan. Kolom wajib: ${wajibTeks}.`);

  const judul = rows[hIdx];
  const kolomIdx = new Map<string, number>();
  const abaikan: string[] = [];
  judul.forEach((c, i) => {
    const t = String(c ?? "").trim();
    if (!t) return;
    const k = peta.get(kunciHeader(t));
    if (k && !kolomIdx.has(k.key)) kolomIdx.set(k.key, i);
    else abaikan.push(t);
  });

  const { k: ctx } = await muatKonteks(periodeBawaan);
  const galat: string[] = [];
  const peringatan: string[] = [];
  if (abaikan.length) peringatan.push(`Kolom tidak dikenal diabaikan: ${abaikan.join(", ")}.`);

  const baris: BarisGrading[] = [];
  const lihat = new Map<string, number>();
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => String(c ?? "").trim() === "")) continue;
    if (baris.length + galat.length > 6000) { galat.push("Terlalu banyak baris (maks 6.000)."); break; }
    const nomor = i + 1;
    const o: BarisGrading = { _baris: nomor };
    let ok = true;
    for (const k of KOLOM) {
      if (k.peran === "referensi") continue;
      const idx = kolomIdx.get(k.key);
      const mentah = idx === undefined ? "" : r[idx];
      const h = k.baca(mentah, ctx);
      if ("galat" in h) { galat.push(`Baris ${nomor}: ${h.galat}`); ok = false; } else o[k.key] = h.nilai;
    }
    if (!ok) continue;
    const kunci = KOLOM.filter((k) => k.peran === "kunci").map((k) => o[k.key]).join("|");
    const prev = lihat.get(kunci);
    if (prev) { galat.push(`Baris ${nomor}: sama dengan baris ${prev} (cabang·produk·periode ganda).`); continue; }
    lihat.set(kunci, nomor);
    baris.push(o);
  }

  // Bandingkan dengan isi tabel pada kunci yang sama.
  const ada = await q<any>(`SELECT cabang, produk, berlaku_mulai, kelas, tier FROM cabang_kelas`);
  const isoTgl = (v: any) => v instanceof Date ? new Date(v.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : String(v).slice(0, 10);
  const petaAda = new Map(ada.map((a: any) => [`${a.cabang}|${a.produk}|${isoTgl(a.berlaku_mulai)}`, a]));
  let baru = 0, berubah = 0, sama = 0;
  const contoh: HasilBaca["contoh"] = [];
  for (const b of baris) {
    const a: any = petaAda.get(`${b.cabang}|${b.produk}|${b.periode}`);
    const status = !a ? "baru" : (a.kelas !== b.kelas || (a.tier ?? null) !== (b.tier ?? null)) ? "berubah" : "sama";
    if (status === "baru") baru++; else if (status === "berubah") berubah++; else sama++;
    b._status = status;
    if (contoh.length < 15 && status !== "sama") contoh.push({ cabang: b.cabang, produk: b.produk, periode: b.periode, kelas: b.kelas, tier: b.tier ?? null, status });
  }
  if (baris.length && baru + berubah === 0) peringatan.push("Semua baris sama dengan isi sistem; tidak ada yang akan berubah.");

  return {
    baris, galat: galat.slice(0, 300), peringatan, contoh,
    kolomDikenal: [...kolomIdx.keys()].map((key) => KOLOM.find((k) => k.key === key)!.header),
    kolomAbaikan: abaikan,
    ringkas: { barisFile: baris.length, baru, berubah, sama },
  };
}

/* ------------------------------ Simpan ------------------------------ */

/** Upsert dinamis dari kolom ber-`db`. Baris yang sama persis dilewati. */
export async function simpanBaris(baris: BarisGrading[]): Promise<number> {
  const kolom = KOLOM.filter((k) => k.db);
  const kunciDb = ["cabang", "produk", "berlaku_mulai"];
  const aktif = baris.filter((b) => b._status !== "sama");
  if (!aktif.length) return 0;
  const nilaiCols = kolom.filter((k) => !kunciDb.includes(k.db!));
  const unnest = kolom.map((k, i) => `$${i + 1}::${k.tipeSql}[]`).join(", ");
  const sql = `INSERT INTO cabang_kelas (${kolom.map((k) => k.db).join(", ")})
     SELECT * FROM unnest(${unnest})
     ON CONFLICT (cabang, produk, berlaku_mulai) DO UPDATE SET
       ${nilaiCols.map((k) => `${k.db} = EXCLUDED.${k.db}`).concat("updated_at = now()").join(", ")}`;
  const param = kolom.map((k) => aktif.map((b) => b[k.key] ?? null));
  await q(sql, param);
  return aktif.length;
}
