import { revalidateTag } from "next/cache";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Daftar level tidak lagi ditulis di kode — diambil dari tabel
 * jabatan_level_ref supaya admin bisa menambah tingkat baru saat struktur
 * organisasi berubah, tanpa menunggu perubahan kode dan deploy ulang.
 */
async function levelSah(): Promise<Map<string, number>> {
  const rows = await q<{ kode: string; urutan: number }>(
    `SELECT kode, urutan FROM jabatan_level_ref WHERE aktif ORDER BY urutan`);
  return new Map(rows.map((r) => [r.kode, Number(r.urutan)]));
}

const rapikan = (v: unknown) =>
  String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Seluruh isi master hierarki: daftar jabatan beserta level, rantai atasan,
 * alias, dan jumlah pegawai yang memakainya. Termasuk daftar jabatan yang
 * dipakai pegawai tapi belum terdaftar di master — itu yang paling perlu
 * ditindaklanjuti admin, karena KPI-nya tidak akan terlihat siapa pun.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const level = await q<any>(
    `SELECT r.kode, r.nama, r.urutan, r.se_area, r.aktif,
            COUNT(jl.jabatan)::int AS jabatan
       FROM jabatan_level_ref r
       LEFT JOIN jabatan_level jl ON jl.level = r.kode
      GROUP BY r.kode, r.nama, r.urutan, r.se_area, r.aktif
      ORDER BY r.urutan DESC, r.nama`);

  const jabatan = await q<any>(
    `SELECT jl.jabatan, jl.level, jl.urutan, jl.aktif,
            COALESCE(p.pemakai, 0) AS pemakai,
            COALESCE(ar.rantai, '[]'::json) AS rantai,
            COALESCE(al.alias, '[]'::json) AS alias
       FROM jabatan_level jl
       LEFT JOIN (
         SELECT COALESCE(a.jabatan, norm_jabatan(u.jabatan)) AS jab,
                COUNT(*)::int AS pemakai
           FROM app_user u
           LEFT JOIN jabatan_alias a ON a.alias = norm_jabatan(u.jabatan)
          WHERE u.aktif
          GROUP BY 1
       ) p ON p.jab = jl.jabatan
       LEFT JOIN (
         SELECT jabatan, json_agg(json_build_object('tingkat', tingkat, 'atasan', atasan)
                                  ORDER BY tingkat) AS rantai
           FROM jabatan_atasan GROUP BY jabatan
       ) ar ON ar.jabatan = jl.jabatan
       LEFT JOIN (
         SELECT jabatan, json_agg(alias ORDER BY alias) AS alias
           FROM jabatan_alias GROUP BY jabatan
       ) al ON al.jabatan = jl.jabatan
      ORDER BY jl.urutan DESC, jl.jabatan`);

  // Jabatan yang dipakai pegawai tapi tidak ada di master.
  const yatim = await q<any>(
    `SELECT norm_jabatan(u.jabatan) AS jabatan, COUNT(*)::int AS pemakai
       FROM app_user u
       LEFT JOIN jabatan_alias a  ON a.alias   = norm_jabatan(u.jabatan)
       LEFT JOIN jabatan_level jl ON jl.jabatan = COALESCE(a.jabatan, norm_jabatan(u.jabatan))
      WHERE u.aktif AND u.jabatan IS NOT NULL AND jl.jabatan IS NULL
      GROUP BY 1 ORDER BY 2 DESC`);

  return Response.json({ jabatan, yatim, level });
});

/** Tambah atau ubah satu jabatan beserta rantai atasannya. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const jabatan = rapikan(b.jabatan);
  const level = String(b.level ?? "");
  const asli = rapikan(b.jabatanAsli);   // diisi saat mengganti nama jabatan

  if (!jabatan) throw new HttpError(400, "Nama jabatan belum diisi.");
  const daftarLevel = await levelSah();
  if (!daftarLevel.has(level)) {
    throw new HttpError(400,
      `Level "${level}" tidak dikenal. Tambahkan dulu lewat pengaturan level.`);
  }

  const urutan = Number.isFinite(Number(b.urutan)) && b.urutan !== null && b.urutan !== ""
    ? Number(b.urutan) : (daftarLevel.get(level) ?? 0);

  // Rantai atasan: daftar nama, urut dari atasan langsung ke paling atas.
  const rantai: string[] = Array.isArray(b.rantai)
    ? b.rantai.map(rapikan).filter(Boolean) : [];
  if (rantai.includes(jabatan)) {
    throw new HttpError(400, "Jabatan tidak boleh menjadi atasan dirinya sendiri.");
  }
  if (new Set(rantai).size !== rantai.length) {
    throw new HttpError(400, "Ada atasan yang tertulis dua kali di rantai.");
  }
  if (rantai.length > 10) throw new HttpError(400, "Rantai atasan maksimal 10 tingkat.");

  // Ganti nama: pindahkan referensi lama sebelum baris lama dihapus.
  if (asli && asli !== jabatan) {
    const [ada] = await q<any>(`SELECT jabatan FROM jabatan_level WHERE jabatan = $1`, [jabatan]);
    if (ada) throw new HttpError(409, `Jabatan ${jabatan} sudah ada di master.`);
    await q(`UPDATE jabatan_atasan SET atasan = $2 WHERE atasan = $1`, [asli, jabatan]);
    await q(`UPDATE jabatan_alias  SET jabatan = $2 WHERE jabatan = $1`, [asli, jabatan]);
    await q(`DELETE FROM jabatan_atasan WHERE jabatan = $1`, [asli]);
    await q(`DELETE FROM jabatan_level  WHERE jabatan = $1`, [asli]);
  }

  await q(
    `INSERT INTO jabatan_level (jabatan, level, urutan, aktif, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (jabatan) DO UPDATE
        SET level = EXCLUDED.level, urutan = EXCLUDED.urutan,
            aktif = EXCLUDED.aktif, updated_at = now()`,
    [jabatan, level, urutan, b.aktif === undefined ? true : Boolean(b.aktif)]);

  await q(`DELETE FROM jabatan_atasan WHERE jabatan = $1`, [jabatan]);
  for (let i = 0; i < rantai.length; i++) {
    await q(`INSERT INTO jabatan_atasan (jabatan, tingkat, atasan) VALUES ($1,$2,$3)`,
      [jabatan, i + 1, rantai[i]]);
  }

  await auditLog(admin.sub, asli && asli !== jabatan ? "ubah_jabatan" : "simpan_jabatan",
    jabatan, { level, urutan, rantai, dariNama: asli || null });

  revalidateTag("hierarki");
  return Response.json({ ok: true });
});

/** Hapus satu jabatan dari master. */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const jabatan = rapikan((await req.json()).jabatan);
  if (!jabatan) throw new HttpError(400, "Jabatan tidak dikenal.");

  const [pakai] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM app_user u
       LEFT JOIN jabatan_alias a ON a.alias = norm_jabatan(u.jabatan)
      WHERE u.aktif AND COALESCE(a.jabatan, norm_jabatan(u.jabatan)) = $1`, [jabatan]);
  if (Number(pakai.n) > 0) {
    throw new HttpError(409,
      `Masih ada ${pakai.n} pegawai aktif dengan jabatan ini. ` +
      `Pindahkan jabatan mereka dulu sebelum menghapusnya.`);
  }

  const [jadiAtasan] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM jabatan_atasan WHERE atasan = $1`, [jabatan]);
  if (Number(jadiAtasan.n) > 0) {
    throw new HttpError(409,
      `Jabatan ini masih tercatat sebagai atasan di ${jadiAtasan.n} rantai jabatan lain. ` +
      `Keluarkan dari rantai itu dulu.`);
  }

  await q(`DELETE FROM jabatan_atasan WHERE jabatan = $1`, [jabatan]);
  await q(`DELETE FROM jabatan_alias  WHERE jabatan = $1`, [jabatan]);
  await q(`DELETE FROM jabatan_level  WHERE jabatan = $1`, [jabatan]);
  await auditLog(admin.sub, "hapus_jabatan", jabatan);

  revalidateTag("hierarki");
  return Response.json({ ok: true });
});

/** Kelola alias — memetakan penulisan lain ke satu jabatan master. */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const { aksi, alias, jabatan } = await req.json();
  const a = rapikan(alias);
  const j = rapikan(jabatan);

  if (aksi === "tambah") {
    if (!a || !j) throw new HttpError(400, "Alias dan jabatan tujuan harus diisi.");
    const [ada] = await q<any>(`SELECT jabatan FROM jabatan_level WHERE jabatan = $1`, [j]);
    if (!ada) throw new HttpError(404, `Jabatan ${j} belum ada di master.`);
    if (a === j) throw new HttpError(400, "Alias tidak boleh sama dengan nama jabatan master.");
    await q(`INSERT INTO jabatan_alias (alias, jabatan) VALUES ($1,$2)
             ON CONFLICT (alias) DO UPDATE SET jabatan = EXCLUDED.jabatan`, [a, j]);
    await auditLog(admin.sub, "tambah_alias_jabatan", a, { jabatan: j });
  } else if (aksi === "hapus") {
    if (!a) throw new HttpError(400, "Alias tidak dikenal.");
    await q(`DELETE FROM jabatan_alias WHERE alias = $1`, [a]);
    await auditLog(admin.sub, "hapus_alias_jabatan", a);
  } else {
    throw new HttpError(400, "Aksi tidak dikenal.");
  }

  revalidateTag("hierarki");
  return Response.json({ ok: true });
});
