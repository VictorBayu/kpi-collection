import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, sql, auditLog } from "@/lib/db";
import { hitungSemuaIndikator } from "@/lib/hitung-indikator";
import { toISODate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Menerbitkan satu batch arsip: sejak titik ini, mesin hitung akan
 * memakainya untuk periode yang bersangkutan alih-alih data_mentah.
 *
 * Batch lama untuk periode yang sama (kalau ada) dipindah ke status
 * 'superseded' dalam TRANSAKSI YANG SAMA dengan menaikkan batch baru —
 * indeks unik idx_arsip_periode_published mensyaratkan tidak pernah ada
 * dua batch 'published' sekaligus untuk satu periode, jadi urutannya
 * tidak boleh dipisah jadi dua kueri lepas.
 *
 * body.hitungUlang = true memicu hitungSemuaIndikator(periode) segera
 * setelah terbit — inilah langkah yang benar-benar menghitung ULANG KPI
 * dan insentif periode itu dengan data arsip (dan rumus indikator
 * TERKINI, termasuk yang baru saja diperbaiki admin). Sengaja opsional
 * dan terpisah dari sekadar menerbitkan arsip: admin bisa menerbitkan
 * arsip dulu untuk diperiksa, baru memicu hitung ulang saat sudah yakin.
 */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { batchId, hitungUlang } = await req.json();
  if (!batchId) throw new HttpError(400, "Batch tidak dikenal.");

  const [batch] = await q<any>(
    `SELECT id, periode, status, baris_valid FROM arsip_mentah_batch WHERE id = $1`, [batchId]);
  if (!batch) throw new HttpError(404, "Batch tidak ditemukan.");
  if (batch.status === "published") throw new HttpError(409, "Batch ini sudah terbit.");
  if (Number(batch.baris_valid) === 0) {
    throw new HttpError(400, "Tidak ada baris valid di batch ini. Unggah ulang berkasnya.");
  }

  const [sebelum] = await q<{ id: string }>(
    `SELECT id FROM arsip_mentah_batch WHERE periode = $1 AND status = 'published'`, [batch.periode]);

  await sql.transaction([
    sql`UPDATE arsip_mentah_batch SET status = 'superseded'
         WHERE periode = ${batch.periode} AND status = 'published'`,
    sql`UPDATE arsip_mentah_batch SET status = 'published', diterbitkan_pada = now()
         WHERE id = ${batchId}::uuid`,
  ]);

  await auditLog(s.sub, "arsip_mentah.terbit", batchId, {
    periode: batch.periode, menggantikan: sebelum?.id ?? null,
  });

  let hitung = null;
  if (hitungUlang) {
    hitung = await hitungSemuaIndikator(toISODate(batch.periode));
    await auditLog(s.sub, "arsip_mentah.hitung_ulang", batchId, {
      periode: batch.periode, indikator: hitung.indikator, baris: hitung.baris,
      insentif: hitung.insentif, gagal: hitung.gagal.length, dariArsip: hitung.dariArsip,
    });
  }

  return Response.json({ ok: true, menggantikan: sebelum?.id ?? null, hitung });
});
