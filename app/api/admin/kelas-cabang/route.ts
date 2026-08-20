import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KELAS = ["large", "medium", "small"];

/**
 * Kelas cabang berperiode.
 *
 * Disimpan berbaris dengan tanggal mulai berlaku, bukan satu kolom di
 * master cabang. Kalau hanya satu kolom, memperbarui kelas cabang akan
 * ikut mengubah insentif periode lampau yang sudah dibayarkan — baris
 * baru ditambahkan, baris lama tetap dipertahankan sebagai riwayat.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [kelas, cabang] = await Promise.all([
    q<any>(
      `SELECT cabang, berlaku_mulai, kelas
         FROM cabang_kelas ORDER BY cabang, berlaku_mulai DESC`),
    // Nama cabang yang benar-benar dipakai pengguna, untuk dropdown —
    // mengetik bebas mudah meleset dari nama yang dicocokkan norm_wilayah()
    // saat menghitung insentif.
    q<any>(
      `SELECT DISTINCT cabang FROM app_user
        WHERE cabang IS NOT NULL AND cabang <> '' ORDER BY cabang`),
  ]);

  return Response.json({ kelas, cabang: cabang.map((c) => c.cabang) });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const cabang = String(b.cabang ?? "").trim();
  const berlakuMulai = String(b.berlaku_mulai ?? "").trim();
  const kelas = String(b.kelas ?? "").trim();

  if (!cabang) throw new HttpError(400, "Cabang belum diisi.");
  if (!berlakuMulai) throw new HttpError(400, "Tanggal mulai berlaku belum diisi.");
  if (!KELAS.includes(kelas)) throw new HttpError(400, "Kelas harus large, medium, atau small.");

  await q(
    `INSERT INTO cabang_kelas (cabang, berlaku_mulai, kelas)
     VALUES ($1,$2,$3)
     ON CONFLICT (cabang, berlaku_mulai) DO UPDATE
       SET kelas = EXCLUDED.kelas, updated_at = now()`,
    [cabang, berlakuMulai, kelas]);

  await auditLog(admin.sub, "kelas-cabang.simpan", cabang, { berlakuMulai, kelas });
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const cabang = url.searchParams.get("cabang");
  const berlakuMulai = url.searchParams.get("berlaku_mulai");
  if (!cabang || !berlakuMulai) throw new HttpError(400, "Baris yang dihapus belum jelas.");

  await q(`DELETE FROM cabang_kelas WHERE cabang=$1 AND berlaku_mulai=$2`, [cabang, berlakuMulai]);
  await auditLog(admin.sub, "kelas-cabang.hapus", cabang, { berlakuMulai });
  return Response.json({ ok: true });
});
