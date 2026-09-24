import { revalidateTag } from "next/cache";
import { requireAdmin, requireMenu, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/** Kode level dipakai sebagai kunci, jadi bentuknya dibatasi agar rapi. */
const keKode = (v: unknown) =>
  String(v ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Pengelolaan level jabatan.
 *
 * Level menentukan dua hal: urutan tampil di diagram, dan apakah pemegang
 * jabatan itu berwenang se-area (AM/ACH) atau hanya se-cabang. Keduanya
 * ikut menentukan siapa melihat KPI siapa, sehingga perubahannya dicatat
 * ke audit log.
 */
export const GET = handler(async () => {
  await requireMenu("admin_hierarki");
  const level = await q<any>(
    `SELECT r.kode, r.nama, r.urutan, r.se_area, r.aktif,
            COUNT(jl.jabatan)::int AS jabatan
       FROM jabatan_level_ref r
       LEFT JOIN jabatan_level jl ON jl.level = r.kode
      GROUP BY r.kode, r.nama, r.urutan, r.se_area, r.aktif
      ORDER BY r.urutan DESC, r.nama`);
  return Response.json({ level });
});

/** Tambah level, atau ubah level yang sudah ada. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kodeAsli = keKode(b.kodeAsli);           // diisi saat mengubah
  const kode = keKode(b.kode || b.nama);
  const nama = String(b.nama ?? "").trim();
  const urutan = Number(b.urutan);
  const seArea = Boolean(b.seArea ?? b.se_area);
  const aktif = b.aktif === undefined ? true : Boolean(b.aktif);

  if (!kode) throw new HttpError(400, "Kode level belum terisi.");
  if (nama.length < 2) throw new HttpError(400, "Nama level belum diisi.");
  if (!Number.isFinite(urutan)) throw new HttpError(400, "Urutan harus berupa angka.");

  if (kodeAsli && kodeAsli !== kode) {
    const [bentrok] = await q<any>(
      `SELECT kode FROM jabatan_level_ref WHERE kode = $1`, [kode]);
    if (bentrok) throw new HttpError(409, `Kode "${kode}" sudah dipakai level lain.`);
    // ON UPDATE CASCADE pada jabatan_level ikut membawa perubahan kode,
    // jadi jabatan yang memakainya tidak putus rujukan.
    await q(`UPDATE jabatan_level_ref
                SET kode = $2, nama = $3, urutan = $4, se_area = $5,
                    aktif = $6, updated_at = now()
              WHERE kode = $1`,
      [kodeAsli, kode, nama, urutan, seArea, aktif]);
    await auditLog(admin.sub, "ubah_level", kode, { dariKode: kodeAsli, nama, urutan, seArea });
  } else {
    await q(
      `INSERT INTO jabatan_level_ref (kode, nama, urutan, se_area, aktif, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (kode) DO UPDATE
          SET nama = EXCLUDED.nama, urutan = EXCLUDED.urutan,
              se_area = EXCLUDED.se_area, aktif = EXCLUDED.aktif,
              updated_at = now()`,
      [kode, nama, urutan, seArea, aktif]);
    await auditLog(admin.sub, "simpan_level", kode, { nama, urutan, seArea, aktif });
  }

  revalidateTag("hierarki");
  return Response.json({ ok: true, kode });
});

/** Hapus level yang belum dipakai jabatan mana pun. */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kode = keKode((await req.json()).kode);
  if (!kode) throw new HttpError(400, "Level tidak dikenal.");

  const [pakai] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM jabatan_level WHERE level = $1`, [kode]);
  if (Number(pakai.n) > 0) {
    throw new HttpError(409,
      `Masih ada ${pakai.n} jabatan memakai level ini. Pindahkan dulu ke level lain.`);
  }

  await q(`DELETE FROM jabatan_level_ref WHERE kode = $1`, [kode]);
  await auditLog(admin.sub, "hapus_level", kode);

  revalidateTag("hierarki");
  return Response.json({ ok: true });
});
