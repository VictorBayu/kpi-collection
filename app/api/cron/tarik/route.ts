import { tarikSemua } from "@/lib/tarik-api";
import { hitungSemuaIndikator } from "@/lib/hitung-indikator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Batas waktu setinggi mungkin.
 *
 * Paket Hobby membatasi 10 detik secara bawaan, tapi bisa dinaikkan sampai
 * 300 detik bila Fluid Compute dinyalakan di pengaturan project. Menarik 57
 * cabang berisi puluhan ribu baris tidak akan pernah selesai dalam 10 detik,
 * jadi nyalakan Fluid Compute sebelum memasang jadwal.
 */
export const maxDuration = 300;

/**
 * Titik masuk penarikan terjadwal.
 *
 * Dipanggil dari luar (cron-job.org), bukan dari Vercel Cron, karena paket
 * Hobby hanya mengizinkan jadwal harian sedangkan yang dibutuhkan tiap jam.
 *
 * Karena bisa dipanggil siapa saja yang tahu alamatnya, dan tiap panggilan
 * membebani API sumber dengan ratusan permintaan, endpoint ini menuntut
 * token rahasia. Tanpa itu satu orang iseng bisa membanjiri sistem pihak
 * lain atas nama kita.
 */
export async function GET(req: Request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) {
    return Response.json(
      { error: "CRON_SECRET belum diset di Environment Variables." },
      { status: 500 },
    );
  }

  // Diterima lewat header Authorization atau parameter, karena sebagian
  // layanan cron gratis tidak bisa mengirim header khusus.
  const url = new URL(req.url);
  const dibawa =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  if (dibawa !== rahasia) {
    return Response.json({ error: "Token tidak cocok." }, { status: 401 });
  }

  const tarik = await tarikSemua("cron");
  if (!tarik.berhasil) {
    // 200, bukan 500. Layanan cron yang menerima 500 berulang kali kerap
    // menonaktifkan jadwalnya sendiri, dan kegagalan menarik data bukan
    // alasan untuk mematikan tarikan jam berikutnya.
    return Response.json({ tahap: "tarik", ...tarik });
  }

  // Data mentah baru tidak ada gunanya sampai diolah jadi angka KPI.
  const hitung = await hitungSemuaIndikator();
  return Response.json({ tahap: "selesai", tarik, hitung });
}
