import { requireAdmin, handler } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATAS_MAKS = 200;

/**
 * Contoh baris data mentah, dengan kolom terkurasi.
 *
 * data_mentah punya sekitar tujuh puluh kolom — cocok untuk mesin hitung,
 * tapi kalau ditampilkan apa adanya di layar admin harus menggulir ke
 * samping tanpa ujung untuk menemukan yang dicarinya. Di sini cuma kolom
 * yang biasa dipakai memeriksa hasil tarikan: siapa, cabang mana, produk
 * apa, dan tiga kolom yang paling sering jadi syarat indikator (bucket,
 * OD movement, outstanding).
 *
 * Nama staf disandingkan dari app_user lewat NIK yang sudah diuraikan,
 * supaya admin tidak perlu menghafal NIK untuk tahu baris itu milik siapa.
 */
export const GET = handler(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const cabang = url.searchParams.get("cabang");
  const cari = url.searchParams.get("cari")?.trim();
  const batas = Math.min(BATAS_MAKS, Math.max(1, Number(url.searchParams.get("batas") ?? 50)));
  const lewati = Math.max(0, Number(url.searchParams.get("lewati") ?? 0));

  const syarat: string[] = [];
  const params: any[] = [];
  if (cabang) { params.push(cabang); syarat.push(`dm.branch_id = $${params.length}`); }
  if (cari) {
    params.push(`%${cari}%`);
    syarat.push(`(dm.agreement_no ILIKE $${params.length} OR dm.full_name ILIKE $${params.length})`);
  }
  const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";

  // Paginasi dikerjakan database, bukan di browser. Dengan puluhan ribu
  // baris, mengirim semuanya lalu memotongnya di sisi klien berarti
  // menunggu lama untuk data yang 99 persennya tidak jadi dilihat.
  const pBatas = `$${params.push(batas)}`;
  const pLewati = `$${params.push(lewati)}`;

  const rows = await q<any>(
    `SELECT dm.branch_id, dm.branch_full_name, dm.agreement_no, dm.full_name,
            dm.product_id, dm.nik_staff, u.nama AS nama_staf,
            dm.outstanding_principal, dm.bucket_awal_bulan, dm.od_movement,
            dm.due_date_harian, dm.ditarik_pada
       FROM data_mentah dm
       LEFT JOIN app_user u ON u.nik = dm.nik_staff
       ${where}
      ORDER BY dm.id DESC
      LIMIT ${pBatas} OFFSET ${pLewati}`, params);

  // Jumlah baris dihitung dengan penyaring yang sama, supaya nomor
  // halaman ikut menyusut saat admin mempersempit pencarian.
  const [cocok] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM data_mentah dm ${where}`,
    params.slice(0, params.length - 2));

  const [total] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM data_mentah`);
  const cabangList = await q<{ branch_id: string; cabang: string }>(
    `SELECT DISTINCT dm.branch_id, COALESCE(ca.cabang, dm.branch_full_name) AS cabang
       FROM data_mentah dm LEFT JOIN cabang_api ca ON ca.branch_id = dm.branch_id
      ORDER BY 2`);

  return Response.json({
    baris: rows, cocok: cocok?.n ?? 0, total: total?.n ?? 0, cabang: cabangList,
  });
});
