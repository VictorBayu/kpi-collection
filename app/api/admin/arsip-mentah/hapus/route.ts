import { del } from "@vercel/blob";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Menghapus satu batch arsip beserta seluruh barisnya (CASCADE) dan
 * berkas aslinya. Batch berstatus 'published' DILINDUNGI, sama seperti
 * batch impor KPI/Insentif — menghapusnya diam-diam akan membuat
 * hitungSemuaIndikator() jatuh balik ke data_mentah (data hari ini) untuk
 * periode itu tanpa peringatan.
 */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const { batchId } = await req.json();
  if (!batchId) throw new HttpError(400, "Batch tidak dikenal.");

  const [b] = await q<any>(
    `SELECT id, periode, status, nama_file, blob_url, baris_valid
       FROM arsip_mentah_batch WHERE id = $1`, [batchId]);
  if (!b) throw new HttpError(404, "Batch tidak ditemukan.");

  if (b.status === "published") {
    throw new HttpError(409,
      "Batch ini sedang dipakai untuk hitung ulang. Terbitkan batch lain untuk periode " +
      "yang sama lebih dulu, baru batch ini bisa dihapus.");
  }

  await q(`DELETE FROM arsip_mentah_batch WHERE id = $1`, [batchId]);

  let berkasTerhapus = true;
  try {
    if (b.blob_url) await del(b.blob_url);
  } catch {
    berkasTerhapus = false;
  }

  await auditLog(admin.sub, "arsip_mentah.hapus", batchId, {
    periode: b.periode, status: b.status, namaFile: b.nama_file,
    baris: Number(b.baris_valid), berkasTerhapus,
  });

  return Response.json({ ok: true, berkasTerhapus });
});
