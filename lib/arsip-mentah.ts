import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { q } from "./db";

/**
 * Rekon Data EOM (arsip data mentah bulanan) — untuk hitung ulang periode lampau.
 *
 * `data_mentah` ditulis ulang penuh (TRUNCATE + INSERT) tiap kali data
 * ditarik dari API (lihat lib/tarik-api.ts): tabel itu hanya pernah
 * berisi snapshot HARI INI. Begitu ada rumus indikator yang perlu
 * diperbaiki untuk periode yang sudah lewat, data mentah bulan itu sudah
 * tidak ada lagi untuk dihitung ulang.
 *
 * Berkas ini menyediakan jalan keluarnya: admin mengunggah manual arsip
 * data akhir bulan (Excel, dari layar "Rekon Data EOM"), disimpan ke
 * arsip_mentah_batch/arsip_mentah_baris (lihat db/schema-arsip-mentah-v24.sql),
 * dan lib/hitung-indikator.ts memakainya sebagai pengganti data_mentah
 * ketika menghitung ulang periode yang sudah punya arsip terbit.
 *
 * Kolom template mengikuti katalog `mentah_kolom` APA ADANYA saat diminta
 * — bukan daftar tetap di kode — supaya template selalu cocok dengan
 * kolom yang sedang dipakai rumus indikator, termasuk kolom kustom yang
 * ditambahkan admin lewat menu CRUD Kolom API / Kolom Turunan.
 */

/** Kolom identitas: fisik di tabel, bukan di dalam JSONB, karena inilah
 *  yang dipakai JOIN dan WHERE mesin hitung. */
export const KOLOM_IDENTITAS = ["agreement_no", "branch_id", "product"] as const;

/** Kolom PIC mentah — sumber NIK diuraikan, sama seperti data_mentah. */
export const KOLOM_PIC_MENTAH = ["staff_pic", "spv_pic", "bch_pic"] as const;

export type KolomKatalog = { kolom: string; label: string; jenis: "angka" | "teks" | "tanggal" };

/**
 * Kolom yang boleh diarsipkan: sumber 'api' (bukan data pendukung),
 * benar-benar ditarik (bukan kolom turunan yang dihitung sesudahnya),
 * dan bukan salah satu kolom identitas yang sudah eksplisit.
 */
export async function kolomArsip(): Promise<KolomKatalog[]> {
  const idSet = new Set<string>(KOLOM_IDENTITAS);
  const rows = await q<KolomKatalog>(
    `SELECT kolom, label, jenis FROM mentah_kolom
      WHERE COALESCE(sumber, 'api') = 'api'
        AND COALESCE(ditarik, true)
        AND NOT COALESCE(turunan, false)
      ORDER BY urutan, kolom`);
  return rows.filter((r) => !idSet.has(r.kolom));
}

/** Header lengkap template, urutan tetap: identitas, PIC mentah, lalu katalog. */
export async function headerTemplate(): Promise<{ headers: string[]; katalog: KolomKatalog[] }> {
  const katalog = await kolomArsip();
  const headers = [...KOLOM_IDENTITAS, ...KOLOM_PIC_MENTAH, ...katalog.map((k) => k.kolom)];
  return { headers, katalog };
}

/** Menguraikan NIK dari string PIC "20230633 - RIZAL ..." — meniru kolom
 *  generated nik_staff/nik_spv/nik_bch di data_mentah persis. */
export function urai_nik(pic: unknown): string | null {
  const s = String(pic ?? "").trim();
  if (!s) return null;
  const nik = s.split(" - ")[0]?.trim();
  return nik || null;
}

function bersihkanTeks(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function bersihkanAngka(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(String(v).trim());
  if (!isNaN(n)) return n;
  const n2 = Number(s);
  return isNaN(n2) ? null : n2;
}

function bersihkanTanggal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export type BarisArsip = {
  agreement_no: string;
  branch_id: string | null;
  product: string | null;
  nik_staff: string | null;
  nik_spv: string | null;
  nik_bch: string | null;
  staff_pic: string | null;
  spv_pic: string | null;
  bch_pic: string | null;
  kolom: Record<string, string | number | null>;
};

export type HasilUraiBaris =
  | { ok: true; baris: BarisArsip }
  | { ok: false; pesan: string };

/** Menguraikan satu baris Excel (kunci = header) menjadi bentuk siap simpan. */
export function uraiBaris(row: Record<string, unknown>, katalog: KolomKatalog[]): HasilUraiBaris {
  const agreement_no = bersihkanTeks(row["agreement_no"]);
  if (!agreement_no) return { ok: false, pesan: "Agreement No kosong." };

  const kolom: Record<string, string | number | null> = {};
  for (const k of katalog) {
    const v = row[k.kolom];
    kolom[k.kolom] =
      k.jenis === "angka" ? bersihkanAngka(v) :
      k.jenis === "tanggal" ? bersihkanTanggal(v) :
      bersihkanTeks(v);
  }

  return {
    ok: true,
    baris: {
      agreement_no,
      branch_id: bersihkanTeks(row["branch_id"]),
      product: bersihkanTeks(row["product"]),
      nik_staff: urai_nik(row["staff_pic"]),
      nik_spv: urai_nik(row["spv_pic"]),
      nik_bch: urai_nik(row["bch_pic"]),
      staff_pic: bersihkanTeks(row["staff_pic"]),
      spv_pic: bersihkanTeks(row["spv_pic"]),
      bch_pic: bersihkanTeks(row["bch_pic"]),
      kolom,
    },
  };
}

/** Membaca workbook Excel dari blob URL, mengembalikan header + baris mentah. */
export async function bacaWorkbookArsip(blobUrl: string): Promise<{
  sha256: string; headers: string[]; rows: Record<string, unknown>[];
}> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error("Berkas tidak bisa diambil dari penyimpanan.");
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => /rekon|eom|arsip|data mentah/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("Berkas tidak berisi sheet yang bisa dibaca.");

  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (!matrix.length) return { sha256, headers: [], rows: [] };

  const headers = (matrix[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every((c) => c === null || c === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => (obj[h] = raw[i] ?? null));
    rows.push(obj);
  }
  return { sha256, headers, rows };
}

/** Membuat berkas template .xlsx sesuai katalog kolom saat ini. */
export async function buatTemplateXlsx(): Promise<Buffer> {
  const { headers, katalog } = await headerTemplate();

  const wb = XLSX.utils.book_new();

  const wsData = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, wsData, "Rekon Data EOM");

  const petunjuk = [
    ["Kolom (header di sheet)", "Label", "Jenis", "Keterangan"],
    ["agreement_no", "Agreement No", "teks", "Wajib diisi — kunci baris."],
    ["branch_id", "Branch ID", "teks", "Kode cabang API, mis. 451."],
    ["product", "Product", "teks", "Nama produk, mis. R2 / R4."],
    ["staff_pic", "Staff PIC", "teks", 'Format "NIK - NAMA (JABATAN)", sama seperti data API.'],
    ["spv_pic", "SPV PIC", "teks", "Format sama seperti Staff PIC."],
    ["bch_pic", "Branch Head PIC", "teks", "Format sama seperti Staff PIC."],
    ...katalog.map((k) => [k.kolom, k.label, k.jenis, ""]),
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjuk);
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, "Petunjuk");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ===================================================================
 * Pemakaian di mesin hitung — mengganti data_mentah dengan arsip untuk
 * periode yang sudah punya batch terbit.
 * =================================================================== */

export type SumberMentah = {
  arsip: boolean;
  batchId?: string;
  /** NIK → jabatan menurut teks PIC arsip periode ini (hanya bila arsip). */
  jabatanPeriode?: Record<string, string>;
  /** Fragmen SQL untuk ditempel setelah "FROM" (alias "dm" selalu ikut
   *  ditempel oleh pemanggil). Menambah parameter ke `params` bila perlu. */
  ekspresiDari(params: unknown[]): string;
};

/**
 * Jabatan (alias produk, mis. "FC SA R2") tiap NIK menurut teks PIC di
 * data_mentah hari ini. Pengguna & Akses menyimpan jabatan master
 * ("FC SA"), sedangkan indikator didaftarkan per alias — varian R2/R4/MIX
 * hanya diketahui dari teks PIC API. Hanya alias yang dikenal di
 * jabatan_produk yang dipakai; selain itu jatuh ke app_user.jabatan.
 */
export async function jabatanDariLive(): Promise<Record<string, string>> {
  const rows = await q<{ nik: string; jab: string }>(
    `WITH x AS (
       SELECT nik_staff AS nik, staff_pic AS pic FROM data_mentah
       UNION ALL SELECT nik_spv, spv_pic FROM data_mentah
       UNION ALL SELECT nik_bch, bch_pic FROM data_mentah
     ), j AS (
       SELECT nik, norm_jabatan(substring(pic from '\\(([^)]*)\\)\\s*$')) AS jab
         FROM x WHERE nik IS NOT NULL AND pic IS NOT NULL
     ), c AS (
       SELECT nik, jab, count(*) n FROM j
        WHERE jab IS NOT NULL
          AND EXISTS (SELECT 1 FROM jabatan_produk jp WHERE jp.alias = j.jab)
        GROUP BY nik, jab
     )
     SELECT DISTINCT ON (nik) nik, jab FROM c ORDER BY nik, n DESC, jab`);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.nik] = r.jab;
  return out;
}

/**
 * Menentukan dari mana mesin hitung harus membaca "data_mentah" untuk
 * satu periode: tabel langsung (periode berjalan, atau periode lampau
 * yang belum punya arsip) atau arsip yang sudah diterbitkan.
 *
 * Dipanggil SEKALI per hitungSemuaIndikator(), lalu hasilnya dipakai
 * ulang untuk setiap pasangan indikator×produk — supaya tidak query
 * berulang dan supaya seluruh perhitungan satu periode konsisten memakai
 * sumber yang sama walau ada perubahan di tengah proses.
 */
/**
 * Jabatan tiap NIK pada periode arsip, dibaca dari teks PIC
 * "NIK - NAMA (JABATAN)" di batch itu sendiri. Bila satu NIK muncul
 * dengan beberapa jabatan, dipakai yang paling sering (seri: urut abjad).
 */
export async function jabatanDariArsip(batchId: string): Promise<Record<string, string>> {
  const rows = await q<{ nik: string; jab: string }>(
    `WITH x AS (
       SELECT nik_staff AS nik, staff_pic AS pic FROM arsip_mentah_baris WHERE batch_id = $1
       UNION ALL SELECT nik_spv, spv_pic FROM arsip_mentah_baris WHERE batch_id = $1
       UNION ALL SELECT nik_bch, bch_pic FROM arsip_mentah_baris WHERE batch_id = $1
     ), j AS (
       SELECT nik, norm_jabatan(substring(pic from '\\(([^)]*)\\)\\s*$')) AS jab
         FROM x WHERE nik IS NOT NULL AND pic IS NOT NULL
     ), c AS (
       SELECT nik, jab, count(*) n FROM j
        WHERE jab IS NOT NULL
          AND EXISTS (SELECT 1 FROM jabatan_produk jp WHERE jp.alias = j.jab)
        GROUP BY nik, jab
     )
     SELECT DISTINCT ON (nik) nik, jab FROM c ORDER BY nik, n DESC, jab`,
    [batchId]);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.nik] = r.jab;
  return out;
}

export async function sumberUntukPeriode(periode: string): Promise<SumberMentah> {
  const [batch] = await q<{ id: string }>(
    `SELECT id FROM arsip_mentah_batch WHERE periode = $1 AND status = 'published'`,
    [periode],
  );
  if (!batch) {
    return { arsip: false, jabatanPeriode: await jabatanDariLive(), ekspresiDari: () => "data_mentah" };
  }

  const katalog = await kolomArsip();
  const jabatanPeriode = await jabatanDariArsip(batch.id);

  return {
    arsip: true,
    batchId: batch.id,
    jabatanPeriode,
    ekspresiDari(params: unknown[]) {
      const pBatch = `$${params.push(batch.id)}`;
      const proyeksi = katalog.map((k) => {
        const ekspr = `b.kolom->>'${k.kolom}'`;
        const cast = k.jenis === "angka" ? "::numeric" : k.jenis === "tanggal" ? "::date" : "";
        return `NULLIF(${ekspr}, '')${cast} AS ${k.kolom}`;
      }).join(",\n               ");
      return `(
        SELECT b.agreement_no, b.branch_id, b.product,
               b.nik_staff, b.nik_spv, b.nik_bch,
               ${proyeksi}
          FROM arsip_mentah_baris b
         WHERE b.batch_id = ${pBatch}
      )`;
    },
  };
}

/* ===================================================================
 * Penyimpanan batch — dipakai rute API unggah/terbitkan/hapus.
 * =================================================================== */

export async function batchSepertiSekarang(id: string) {
  const [b] = await q<any>(
    `SELECT id, periode, status, nama_file, total_baris, baris_valid,
            baris_ditolak, catatan, diunggah_pada, diterbitkan_pada
       FROM arsip_mentah_batch WHERE id = $1`, [id]);
  return b ?? null;
}

/** Menyimpan baris arsip, 500 baris per perintah — pola sama seperti
 *  lib/import/parse.ts untuk unggahan Excel lain di aplikasi ini. */
export async function simpanBarisArsip(batchId: string, periode: string, baris: BarisArsip[]) {
  for (let i = 0; i < baris.length; i += 500) {
    const potongan = baris.slice(i, i + 500);
    await q(
      `INSERT INTO arsip_mentah_baris
         (batch_id, periode, agreement_no, branch_id, product, nik_staff, nik_spv, nik_bch,
          staff_pic, spv_pic, bch_pic, kolom)
       SELECT $1, $2::date, r->>'agreement_no', r->>'branch_id', r->>'product',
              r->>'nik_staff', r->>'nik_spv', r->>'nik_bch',
              r->>'staff_pic', r->>'spv_pic', r->>'bch_pic', r->'kolom'
         FROM jsonb_array_elements($3::jsonb) r`,
      [batchId, periode, JSON.stringify(potongan)]);
  }
}
