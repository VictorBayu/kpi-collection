import { del } from "@vercel/blob";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Menghapus satu batch impor beserta seluruh barisnya dan berkas aslinya.
 *
 * Batch berstatus `published` DILINDUNGI. Menghapusnya berarti KPI dan
 * insentif seluruh karyawan periode itu lenyap dari layar seketika, tanpa
 * cara mengembalikan selain mengunggah ulang. Untuk menghapus batch yang
 * sedang terbit, admin harus mengaktifkan batch lain lebih dulu (rollback)
 * sehingga selalu ada data yang berlaku.
 */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const { batchId } = await req.json();
  if (!batchId) throw new HttpError(400, "Batch tidak dikenal.");

  const [b] = await q<any>(
    `SELECT id, periode, tipe, status, nama_file, blob_url, baris_valid
       FROM import_batch WHERE id = $1`, [batchId]);
  if (!b) throw new HttpError(404, "Batch tidak ditemukan.");

  if (b.status === "published") {
    throw new HttpError(409,
      "Batch ini sedang dipakai karyawan. Aktifkan batch lain untuk periode " +
      "yang sama lebih dulu, baru batch ini bisa dihapus.");
  }

  // Baris KPI/insentif dan temuan pemeriksaan ikut terhapus lewat
  // ON DELETE CASCADE pada foreign key-nya.
  await q(`DELETE FROM import_batch WHERE id = $1`, [batchId]);

  // Berkas asli di penyimpanan blob. Kegagalan di sini tidak membatalkan
  // penghapusan data — berkas yatim jauh lebih ringan akibatnya daripada
  // baris database yang tertinggal.
  let berkasTerhapus = true;
  try {
    if (b.blob_url) await del(b.blob_url);
  } catch {
    berkasTerhapus = false;
  }

  await auditLog(admin.sub, "hapus_batch", batchId, {
    periode: b.periode, tipe: b.tipe, status: b.status,
    namaFile: b.nama_file, baris: Number(b.baris_valid), berkasTerhapus,
  });

  return Response.json({
    ok: true,
    berkasTerhapus,
    pesan: berkasTerhapus
      ? "Batch dan berkas aslinya dihapus."
      : "Batch dihapus, tapi berkas aslinya di penyimpanan gagal dihapus.",
  });
});
