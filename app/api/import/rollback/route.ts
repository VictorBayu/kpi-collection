import { revalidateTag } from "next/cache";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, sql, auditLog } from "@/lib/db";

export const runtime = "nodejs";

/** Mengaktifkan kembali batch lama. Tidak ada data yang dihapus. */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { batchId, alasan } = await req.json();

  const [batch] = await q<any>(
    `SELECT id, periode, tipe, status, baris_valid FROM import_batch WHERE id = $1`, [batchId]);
  if (!batch) throw new HttpError(404, "Batch tidak ditemukan.");
  if (batch.status !== "superseded") {
    throw new HttpError(400, "Hanya batch yang pernah terbit dan sudah digantikan yang bisa diaktifkan kembali.");
  }

  await sql.transaction([sql`SELECT publish_batch(${batchId}::uuid)`]);
  await auditLog(s.sub, "rollback_batch", batchId, { periode: batch.periode, alasan: alasan ?? null });

  revalidateTag("login-info");

  return Response.json({ ok: true, barisAktif: Number(batch.baris_valid) });
});
