import { requireAdmin, requireMenu, handler, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Menjelaskan MENGAPA seseorang muncul atau tidak muncul di layar Tim Saya
 * milik orang lain.
 *
 * Aturannya punya beberapa syarat yang harus terpenuhi bersamaan, dan kalau
 * salah satu gagal hasilnya sama saja: orangnya hilang tanpa keterangan.
 * Endpoint ini memeriksa tiap syarat satu per satu dan mengembalikan nilai
 * sebenarnya di database — termasuk spasi tersembunyi dan beda huruf besar
 * kecil yang tidak kelihatan di layar.
 */
export const GET = handler(async (req) => {
  await requireMenu("admin_hierarki");
  const url = new URL(req.url);
  const pengamatNik = (url.searchParams.get("pengamat") || "").trim();
  const targetNik = (url.searchParams.get("target") || "").trim();

  if (!pengamatNik) throw new HttpError(400, "NIK pengamat belum diisi.");

  const [p] = await q<any>(
    `SELECT v.nik, v.nama, v.jabatan_asli, v.jabatan_master, v.cabang, v.area,
            v.peran, v.aktif, jl.level,
            (v.peran = 'admin') AS is_admin,
            (jl.level IN ('manager_1','manager_2')
             OR (v.cabang IS NULL AND v.area IS NOT NULL)) AS se_area
       FROM v_user_jabatan v
       LEFT JOIN jabatan_level jl ON jl.jabatan = v.jabatan_master
      WHERE v.nik = $1`, [pengamatNik]);
  if (!p) throw new HttpError(404, `NIK ${pengamatNik} tidak ditemukan.`);

  // Mode 1: tanpa target — tampilkan ringkasan siapa saja yang dia lihat,
  // plus orang sewilayah yang TIDAK terlihat beserta alasannya.
  if (!targetNik) {
    const sekitar = await q<any>(
      `SELECT t.nik, t.nama, t.jabatan_asli, t.jabatan_master, t.cabang, t.area, t.aktif,
              EXISTS (SELECT 1 FROM v_visibilitas vis
                       WHERE vis.pengamat = $2 AND vis.target = t.jabatan_master) AS lolos_hierarki,
              CASE WHEN $5::bool THEN t.area IS NOT DISTINCT FROM $4
                   ELSE t.cabang IS NOT DISTINCT FROM $3 END AS lolos_wilayah
         FROM v_user_jabatan t
        WHERE t.nik <> $1
          AND (t.cabang IS NOT DISTINCT FROM $3 OR t.area IS NOT DISTINCT FROM $4)
        ORDER BY t.jabatan_master, t.nama`,
      [pengamatNik, p.jabatan_master, p.cabang, p.area, p.se_area]);

    return Response.json({
      pengamat: p,
      terlihat: sekitar.filter((x) => x.aktif && x.lolos_hierarki && x.lolos_wilayah),
      tersembunyi: sekitar.filter((x) => !(x.aktif && x.lolos_hierarki && x.lolos_wilayah)),
    });
  }

  // Mode 2: satu lawan satu — periksa tiap syarat.
  const [t] = await q<any>(
    `SELECT v.nik, v.nama, v.jabatan_asli, v.jabatan_master, v.cabang, v.area,
            v.aktif, jl.level
       FROM v_user_jabatan v
       LEFT JOIN jabatan_level jl ON jl.jabatan = v.jabatan_master
      WHERE v.nik = $1`, [targetNik]);
  if (!t) throw new HttpError(404, `NIK ${targetNik} tidak ditemukan.`);

  const [cek] = await q<any>(
    `SELECT
       EXISTS (SELECT 1 FROM v_visibilitas
                WHERE pengamat = $1 AND target = $2) AS lolos_hierarki,
       EXISTS (SELECT 1 FROM jabatan_level WHERE jabatan = $1) AS pengamat_dikenal,
       EXISTS (SELECT 1 FROM jabatan_level WHERE jabatan = $2) AS target_dikenal,
       (SELECT string_agg(atasan, ' → ' ORDER BY tingkat)
          FROM jabatan_atasan WHERE jabatan = $2) AS rantai_target`,
    [p.jabatan_master, t.jabatan_master]);

  const wilayahCocok = p.se_area
    ? (t.area ?? null) === (p.area ?? null)
    : (t.cabang ?? null) === (p.cabang ?? null);

  const syarat = [
    {
      nama: "Jabatan pengamat dikenal master",
      lolos: Boolean(cek.pengamat_dikenal),
      detail: cek.pengamat_dikenal
        ? `${p.jabatan_asli ?? "—"} dibaca sebagai ${p.jabatan_master}`
        : `"${p.jabatan_asli ?? "—"}" belum ada di master hierarki. Daftarkan atau buat aliasnya.`,
    },
    {
      nama: "Jabatan target dikenal master",
      lolos: Boolean(cek.target_dikenal),
      detail: cek.target_dikenal
        ? `${t.jabatan_asli ?? "—"} dibaca sebagai ${t.jabatan_master}`
        : `"${t.jabatan_asli ?? "—"}" belum ada di master hierarki. Daftarkan atau buat aliasnya.`,
    },
    {
      nama: "Target masih aktif",
      lolos: Boolean(t.aktif),
      detail: t.aktif ? "Akun aktif" : "Akun nonaktif, jadi tidak pernah muncul di daftar tim.",
    },
    {
      nama: "Hierarki jabatan",
      lolos: Boolean(cek.lolos_hierarki),
      detail: cek.lolos_hierarki
        ? `${p.jabatan_master} berada di atas ${t.jabatan_master} pada rantai.`
        : `${p.jabatan_master} tidak ada di rantai atasan ${t.jabatan_master}` +
          (cek.rantai_target ? ` (${t.jabatan_master} → ${cek.rantai_target}).` : " — rantai target masih kosong."),
    },
    {
      nama: p.se_area ? "Area sama" : "Cabang sama",
      lolos: wilayahCocok,
      detail: p.se_area
        ? `Pengamat: "${p.area ?? "(kosong)"}" · Target: "${t.area ?? "(kosong)"}"`
        : `Pengamat: "${p.cabang ?? "(kosong)"}" · Target: "${t.cabang ?? "(kosong)"}"`,
    },
  ];

  return Response.json({
    pengamat: p,
    target: t,
    syarat,
    terlihat: syarat.every((s) => s.lolos),
    catatanWilayah: p.se_area
      ? "Pengamat berlevel manajer area, jadi yang dibandingkan kolom area."
      : "Pengamat berlevel cabang, jadi yang dibandingkan kolom cabang — harus sama persis, termasuk spasi dan huruf besar-kecil.",
  });
});
