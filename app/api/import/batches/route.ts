import { requireAdmin, handler } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

/** Daftar riwayat impor + temuan satu batch (?batchId=...). */
export const GET = handler(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");

  if (batchId) {
    const [batch] = await q<any>(
      `SELECT b.*, u.nama AS pengunggah
         FROM import_batch b LEFT JOIN app_user u ON u.id = b.diunggah_oleh
        WHERE b.id = $1`, [batchId]);
    const issues = await q<any>(
      `SELECT baris, kolom, tingkat, pesan, nilai_asli
         FROM import_issue WHERE batch_id = $1
        ORDER BY (tingkat = 'error') DESC, baris LIMIT 200`, [batchId]);
    return Response.json({ batch, issues });
  }

  const list = await q<any>(
    `SELECT b.id, b.periode, b.tipe, b.status, b.nama_file, b.blob_url,
            b.total_baris, b.baris_valid, b.baris_warning, b.baris_ditolak,
            b.diunggah_pada, b.diterbitkan_pada, u.nama AS pengunggah
       FROM import_batch b LEFT JOIN app_user u ON u.id = b.diunggah_oleh
      ORDER BY b.diunggah_pada DESC LIMIT 60`);
  return Response.json({ list });
});
