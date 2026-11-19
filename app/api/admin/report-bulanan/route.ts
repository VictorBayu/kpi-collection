import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";
import { ringkasanPeriode } from "@/lib/report-bulanan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Report Bulanan — ringkasan dan penghapusan baris hasil hitung (sumber
 * 'api') per periode.
 *
 * Yang disentuh HANYA baris ber-sumber 'api'. Baris 'excel' dikelola
 * lewat Riwayat impor (batch) dan tidak pernah ikut terhapus dari sini.
 * Baris API aman dihapus: ia hasil turunan dari data_mentah + definisi
 * indikator, dan bisa dibuat ulang lewat hitung ulang periode itu.
 */

const POLA_PERIODE = /^\d{4}-\d{2}-\d{2}$/;

/** Jumlah baris per periode untuk kedua tabel. */
export const GET = handler(async () => {
  await requireAdmin();
  return Response.json({ periode: await ringkasanPeriode() });
});

/** Hapus baris API satu periode. Body: { periode, jenis: 'kpi'|'insentif'|'semua' }. */
export const DELETE = handler(async (req) => {
  await requireAdmin();
  const b = await req.json().catch(() => ({}));
  const periode = String(b.periode ?? "");
  const jenis = String(b.jenis ?? "");
  if (!POLA_PERIODE.test(periode)) throw new HttpError(400, "Periode tidak valid.");
  if (!["kpi", "insentif", "semua"].includes(jenis)) {
    throw new HttpError(400, "Jenis harus kpi, insentif, atau semua.");
  }

  let kpi = 0, insentif = 0;
  if (jenis === "kpi" || jenis === "semua") {
    const r = await q<{ n: number }>(
      `WITH d AS (DELETE FROM kpi_row WHERE sumber = 'api' AND periode = $1::date RETURNING 1)
       SELECT COUNT(*)::int AS n FROM d`, [periode]);
    kpi = r[0]?.n ?? 0;
  }
  if (jenis === "insentif" || jenis === "semua") {
    const r = await q<{ n: number }>(
      `WITH d AS (DELETE FROM insentif_row WHERE sumber = 'api' AND periode = $1::date RETURNING 1)
       SELECT COUNT(*)::int AS n FROM d`, [periode]);
    insentif = r[0]?.n ?? 0;
  }
  return Response.json({ ok: true, kpi, insentif });
});
