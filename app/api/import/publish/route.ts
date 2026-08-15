import { revalidateTag } from "next/cache";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, sql, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/** Langkah 4: satu-satunya titik di mana data karyawan berubah. */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { batchId } = await req.json();

  const [batch] = await q<any>(
    `SELECT id, periode, tipe, status, baris_valid, baris_ditolak
       FROM import_batch WHERE id = $1`, [batchId]);

  if (!batch) throw new HttpError(404, "Batch tidak ditemukan.");
  if (batch.status === "published") throw new HttpError(409, "Batch ini sudah terbit.");
  if (batch.status !== "validated") {
    throw new HttpError(400, "Jalankan pemeriksaan sampai selesai sebelum menerbitkan.");
  }
  if (Number(batch.baris_valid) === 0) {
    throw new HttpError(400, "Tidak ada baris yang lolos pemeriksaan. Perbaiki berkas lalu unggah ulang.");
  }

  const [sebelum] = await q<{ id: string }>(
    `SELECT id FROM import_batch
      WHERE periode = $1 AND tipe = $2 AND status = 'published'`, [batch.periode, batch.tipe]);

  // Satu transaksi: batch lama digeser, batch baru naik
  await sql.transaction([
    sql`SELECT publish_batch(${batchId}::uuid)`,
    sql`DELETE FROM import_staging_row WHERE batch_id = ${batchId}::uuid`,
  ]);

  const [dampak] = await q<{ karyawan: number }>(
    batch.tipe === "kpi"
      ? `SELECT COUNT(DISTINCT nik)::int AS karyawan FROM kpi_row WHERE batch_id = $1`
      : `SELECT COUNT(DISTINCT nik)::int AS karyawan FROM insentif_row WHERE batch_id = $1`,
    [batchId]);

  await auditLog(s.sub, "publish_batch", batchId, {
    periode: batch.periode, menggantikan: sebelum?.id ?? null, karyawan: dampak.karyawan,
  });

  // Daftar periode di-cache; segarkan agar batch baru langsung tampil.
  revalidateTag("batch-kpi");

  return Response.json({
    ok: true,
    barisTerbit: Number(batch.baris_valid),
    karyawanTerdampak: dampak.karyawan,
    menggantikan: sebelum?.id ?? null,
  });
});
