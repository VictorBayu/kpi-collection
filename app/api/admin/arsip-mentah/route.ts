import { requireAdmin, handler } from "@/lib/auth";
import { q } from "@/lib/db";
import { headerTemplate } from "@/lib/arsip-mentah";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layar "Arsip Data Mentah": riwayat batch yang pernah diunggah, dan
 * kolom template saat ini (supaya UI bisa menunjukkan berapa kolom yang
 * akan diminta sebelum admin mengunduh templatenya).
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [batch, katalog] = await Promise.all([
    q<any>(
      `SELECT b.id, b.periode, b.status, b.nama_file, b.total_baris,
              b.baris_valid, b.baris_ditolak, b.catatan,
              b.diunggah_pada, b.diterbitkan_pada, u.nama AS diunggah_oleh
         FROM arsip_mentah_batch b
         LEFT JOIN app_user u ON u.id = b.diunggah_oleh
        ORDER BY b.periode DESC, b.diunggah_pada DESC
        LIMIT 100`),
    headerTemplate(),
  ]);

  return Response.json({
    batch,
    jumlahKolomTemplate: katalog.headers.length,
  });
});
