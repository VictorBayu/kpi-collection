import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KELAS = ["large", "medium", "small"];

/**
 * Tier cabang per produk, berperiode.
 *
 * Disimpan berbaris dengan tanggal mulai berlaku, bukan diedit di tempat.
 * Kalau kelasnya ditimpa langsung, mengubahnya akan ikut mengubah insentif
 * periode lampau yang sudah dibayarkan — baris lama tetap dipertahankan
 * sebagai riwayat, dan yang dipakai adalah baris terbaru yang tanggal
 * berlakunya sudah lewat.
 *
 * Produk masuk kunci karena satu cabang bisa berkelas berbeda antar produk:
 * besar untuk R2 tapi kecil untuk R4, mengikuti volume masing-masing.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [kelas, cabang, produk] = await Promise.all([
    q<any>(
      `SELECT cabang, produk, berlaku_mulai, kelas
         FROM cabang_kelas ORDER BY cabang, produk, berlaku_mulai DESC`),

    // Daftar cabang diambil dari master cabang API, bukan diketik bebas.
    // Nama yang meleset sedikit saja tidak akan cocok saat dicari lewat
    // norm_wilayah() ketika menghitung insentif, dan kegagalannya sunyi:
    // nominalnya nol tanpa pesan galat apa pun.
    q<any>(
      `SELECT branch_id, cabang, area FROM cabang_api
        WHERE aktif ORDER BY area NULLS LAST, cabang`),

    q<any>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),
  ]);

  return Response.json({ kelas, cabang, produk });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const cabang = String(b.cabang ?? "").trim();
  const produk = String(b.produk ?? "").trim().toUpperCase();
  const berlakuMulai = String(b.berlaku_mulai ?? "").trim();
  const kelas = String(b.kelas ?? "").trim();

  if (!cabang) throw new HttpError(400, "Cabang belum dipilih.");
  if (!produk) throw new HttpError(400, "Produk belum dipilih.");
  if (!berlakuMulai) throw new HttpError(400, "Tanggal mulai berlaku belum diisi.");
  if (!KELAS.includes(kelas)) throw new HttpError(400, "Tier harus Large, Medium, atau Small.");

  await q(
    `INSERT INTO cabang_kelas (cabang, produk, berlaku_mulai, kelas)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (cabang, produk, berlaku_mulai) DO UPDATE
       SET kelas = EXCLUDED.kelas, updated_at = now()`,
    [cabang, produk, berlakuMulai, kelas]);

  await auditLog(admin.sub, "tier-cabang.simpan", `${cabang}/${produk}`, { berlakuMulai, kelas });
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const cabang = url.searchParams.get("cabang");
  const produk = url.searchParams.get("produk");
  const berlakuMulai = url.searchParams.get("berlaku_mulai");
  if (!cabang || !produk || !berlakuMulai) {
    throw new HttpError(400, "Baris yang dihapus belum jelas.");
  }

  await q(
    `DELETE FROM cabang_kelas WHERE cabang=$1 AND produk=$2 AND berlaku_mulai=$3`,
    [cabang, produk, berlakuMulai]);
  await auditLog(admin.sub, "tier-cabang.hapus", `${cabang}/${produk}`, { berlakuMulai });
  return Response.json({ ok: true });
});
