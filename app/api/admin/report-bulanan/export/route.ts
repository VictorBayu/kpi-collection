import * as XLSX from "xlsx";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";
import { toISODate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ekspor baris hasil hitung (sumber 'api') satu periode ke Excel.
 * Query: ?periode=YYYY-MM-DD&jenis=kpi|insentif|semua
 *
 * Kolom ditulis eksplisit (bukan SELECT *) supaya urutan dan judulnya
 * stabil walau skema bertambah kolom. Kolom NUMERIC dari driver datang
 * sebagai teks; di sini diubah jadi angka agar bisa dijumlahkan di Excel,
 * sedangkan NIK sengaja dibiarkan teks (angka nol di depan tidak hilang).
 */

type Kol = { k: string; judul: string; tipe: "t" | "n" | "d" | "w" };

const KOLOM_KPI: Kol[] = [
  { k: "periode", judul: "PERIODE", tipe: "d" },
  { k: "nik", judul: "NIK", tipe: "t" },
  { k: "nama", judul: "NAMA", tipe: "t" },
  { k: "jabatan", judul: "JABATAN", tipe: "t" },
  { k: "cabang", judul: "CABANG", tipe: "t" },
  { k: "produk", judul: "PRODUK", tipe: "t" },
  { k: "indikator", judul: "INDIKATOR", tipe: "t" },
  { k: "peran", judul: "PERAN", tipe: "t" },
  { k: "satuan", judul: "SATUAN", tipe: "t" },
  { k: "pencapaian", judul: "PENCAPAIAN", tipe: "n" },
  { k: "target_kpi3", judul: "TARGET KPI 3", tipe: "n" },
  { k: "target_kpi4", judul: "TARGET KPI 4", tipe: "n" },
  { k: "target_kpi5", judul: "TARGET KPI 5", tipe: "n" },
  { k: "skor_kpi", judul: "SKOR KPI", tipe: "n" },
  { k: "bobot", judul: "BOBOT KPI", tipe: "n" },
  { k: "skor_terbobot", judul: "SKOR TERBOBOT KPI", tipe: "n" },
  { k: "bobot_insentif", judul: "BOBOT INSENTIF", tipe: "n" },
  { k: "skor_terbobot_ins", judul: "SKOR TERBOBOT INSENTIF", tipe: "n" },
  { k: "jenis_nilai", judul: "JENIS NILAI", tipe: "t" },
  { k: "nilai_efek", judul: "NILAI EFEK", tipe: "n" },
  { k: "nominal_baris", judul: "NOMINAL BARIS", tipe: "n" },
  { k: "gerbang_gagal", judul: "GERBANG GAGAL", tipe: "t" },
  { k: "catatan", judul: "RUMUS / CATATAN", tipe: "t" },
  { k: "dihitung_pada", judul: "DIHITUNG PADA", tipe: "w" },
];

const KOLOM_INS: Kol[] = [
  { k: "periode", judul: "PERIODE", tipe: "d" },
  { k: "nik", judul: "NIK", tipe: "t" },
  { k: "jabatan", judul: "JABATAN", tipe: "t" },
  { k: "cabang", judul: "CABANG", tipe: "t" },
  { k: "produk", judul: "PRODUK", tipe: "t" },
  { k: "kategori", judul: "KATEGORI", tipe: "t" },
  { k: "skor_insentif", judul: "SKOR INSENTIF", tipe: "n" },
  { k: "skor_kpi", judul: "SKOR KPI", tipe: "n" },
  { k: "tier", judul: "TIER", tipe: "n" },
  { k: "kelas_cabang", judul: "KELAS CABANG", tipe: "t" },
  { k: "nominal_dasar", judul: "NOMINAL DASAR", tipe: "n" },
  { k: "nominal_reward", judul: "NOMINAL REWARD", tipe: "n" },
  { k: "nominal_penalty", judul: "NOMINAL PENALTY", tipe: "n" },
  { k: "nominal", judul: "NOMINAL INSENTIF", tipe: "n" },
  { k: "keterangan", judul: "KETERANGAN", tipe: "t" },
  { k: "dihitung_pada", judul: "DIHITUNG PADA", tipe: "w" },
];

function nilaiSel(v: any, t: Kol["tipe"]): any {
  if (v === null || v === undefined || v === "") return "";
  if (t === "n") { const x = Number(v); return Number.isFinite(x) ? x : String(v); }
  if (t === "d") return toISODate(v);
  if (t === "w") return v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : String(v);
  return String(v);
}

function lembar(rows: any[], kolom: Kol[]) {
  const data = rows.map((r) =>
    Object.fromEntries(kolom.map((c) => [c.judul, nilaiSel(r[c.k], c.tipe)])));
  const ws = XLSX.utils.json_to_sheet(data, { header: kolom.map((c) => c.judul) });
  ws["!cols"] = kolom.map((c) => ({
    wch: c.tipe === "n" ? 16 : c.k === "catatan" || c.k === "gerbang_gagal" || c.k === "keterangan" ? 48
       : c.k === "indikator" || c.k === "nama" ? 32 : 16,
  }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  return ws;
}

export const GET = handler(async (req) => {
  await requireAdmin();
  const u = new URL(req.url);
  const periode = (u.searchParams.get("periode") ?? "").trim();
  const jenis = (u.searchParams.get("jenis") ?? "semua").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periode)) throw new HttpError(400, "Periode tidak valid.");
  if (!["kpi", "insentif", "semua"].includes(jenis)) throw new HttpError(400, "Jenis tidak valid.");

  const wb = XLSX.utils.book_new();
  let total = 0;

  if (jenis === "kpi" || jenis === "semua") {
    const rows = await q<any>(
      `SELECT * FROM kpi_row WHERE sumber = 'api' AND periode = $1::date
        ORDER BY produk, nik, peran NULLS LAST, indikator`, [periode]);
    total += rows.length;
    XLSX.utils.book_append_sheet(wb, lembar(rows, KOLOM_KPI), "KPI_ROW");
  }
  if (jenis === "insentif" || jenis === "semua") {
    const rows = await q<any>(
      `SELECT * FROM insentif_row WHERE sumber = 'api' AND periode = $1::date
        ORDER BY produk, nik`, [periode]);
    total += rows.length;
    XLSX.utils.book_append_sheet(wb, lembar(rows, KOLOM_INS), "INSENTIF_ROW");
  }
  if (total === 0) {
    throw new HttpError(404, "Tidak ada baris sumber API untuk periode itu.");
  }

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const nama = `report-bulanan-${periode.slice(0, 7)}-${jenis}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
});
