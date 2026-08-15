import { q } from "./db";

/**
 * ATURAN VISIBILITAS KPI/INSENTIF
 * ================================
 *
 * Dua syarat harus terpenuhi sekaligus:
 *
 * 1. HIERARKI JABATAN — pengamat harus berada di rantai atasan target,
 *    dan hanya boleh melihat ke bawah. Ini dihitung di SQL oleh view
 *    `v_visibilitas` (lihat db/schema-hierarki.sql).
 *
 * 2. WILAYAH — atasan cabang (manager_3 ke bawah) hanya melihat orang
 *    di cabang yang sama. Manajer area (AM/ACH, yaitu manager_1 dan
 *    manager_2) melihat seluruh cabang dalam areanya.
 *
 * Admin melewati keduanya.
 */

export type Lingkup = { jenis: "cabang" | "area" | "semua"; nilai: string };

/** Level yang wilayah kerjanya se-area, bukan se-cabang. */
const LEVEL_AREA = ["manager_1", "manager_2"];

export type ProfilHierarki = {
  nik: string;
  jabatanMaster: string | null;
  level: string | null;
  cabang: string | null;
  area: string | null;
  peran: string;
  lingkup: Lingkup;
};

/**
 * Profil hierarki satu user: jabatan master (setelah alias), levelnya,
 * dan wilayah kerja efektifnya.
 */
export async function profilHierarki(nik: string): Promise<ProfilHierarki | null> {
  const [row] = await q<any>(
    `SELECT v.nik, v.jabatan_master, v.cabang, v.area, v.peran, jl.level
       FROM v_user_jabatan v
       LEFT JOIN jabatan_level jl ON jl.jabatan = v.jabatan_master
      WHERE v.nik = $1`, [nik]);
  if (!row) return null;

  const seArea = row.peran === "admin"
    || (row.level && LEVEL_AREA.includes(row.level))
    || (!row.cabang && !!row.area);

  const lingkup: Lingkup =
    row.peran === "admin" ? { jenis: "semua", nilai: "Semua cabang" }
    : seArea && row.area ? { jenis: "area", nilai: row.area }
    : { jenis: "cabang", nilai: row.cabang ?? "—" };

  return {
    nik: row.nik,
    jabatanMaster: row.jabatan_master,
    level: row.level,
    cabang: row.cabang,
    area: row.area,
    peran: row.peran,
    lingkup,
  };
}

/**
 * Potongan SQL untuk menyaring tabel app_user (alias `u`) menjadi
 * hanya orang yang boleh dilihat oleh `nik` pengamat.
 *
 * Dipakai sebagai sub-kueri agar halaman lain bisa memakai aturan yang
 * sama tanpa menyalin logikanya. Parameter: $1 = nik pengamat.
 *
 * Catatan: pengamat tidak pernah melihat dirinya sendiri di daftar tim;
 * KPI dirinya ada di halaman Dasbor Saya.
 */
export const SQL_TIM_TERLIHAT = `
  WITH pengamat AS (
    SELECT v.nik, v.jabatan_master,
           norm_wilayah(v.cabang) AS cabang, norm_wilayah(v.area) AS area,
           v.peran, jl.level,
           (v.peran = 'admin') AS is_admin,
           (jl.level IN ('manager_1','manager_2') OR (v.cabang IS NULL AND v.area IS NOT NULL))
             AS se_area
      FROM v_user_jabatan v
      LEFT JOIN jabatan_level jl ON jl.jabatan = v.jabatan_master
     WHERE v.nik = $1
  )
  SELECT t.id, t.nik, t.nama, t.jabatan_asli AS jabatan, t.jabatan_master,
         t.cabang, t.area, tl.level, tl.urutan
    FROM v_user_jabatan t
    CROSS JOIN pengamat p
    LEFT JOIN jabatan_level tl ON tl.jabatan = t.jabatan_master
   WHERE t.aktif
     AND t.nik <> p.nik
     AND (
       -- Admin melihat semua orang
       p.is_admin
       OR (
         -- Syarat 1: hierarki jabatan
         EXISTS (
           SELECT 1 FROM v_visibilitas vis
            WHERE vis.pengamat = p.jabatan_master
              AND vis.target   = t.jabatan_master
         )
         -- Syarat 2: wilayah.
         -- Nama wilayah dinormalkan lebih dulu supaya spasi berlebih atau
         -- beda huruf besar-kecil tidak diam-diam menyembunyikan orang.
         AND CASE
               -- Pengamat manajer area: bandingkan area
               WHEN p.se_area
                 THEN norm_wilayah(t.area) IS NOT DISTINCT FROM p.area
               -- Target tidak terikat cabang (ACH/AM biasanya begitu):
               -- cocokkan lewat area, kalau tidak dia tak pernah terlihat
               -- oleh BM mana pun padahal memang atasan di area itu.
               WHEN t.cabang IS NULL AND t.area IS NOT NULL
                 THEN norm_wilayah(t.area) IS NOT DISTINCT FROM p.area
               ELSE norm_wilayah(t.cabang) IS NOT DISTINCT FROM p.cabang
             END
       )
     )
`;

/**
 * Daftar NIK yang boleh dilihat pengamat. Dipakai untuk pengecekan akses
 * satu orang (mis. saat atasan membuka detail KPI anggota).
 */
export async function bolehLihat(pengamatNik: string, targetNik: string): Promise<boolean> {
  const rows = await q<{ ada: number }>(
    `SELECT 1 AS ada FROM (${SQL_TIM_TERLIHAT}) x WHERE x.nik = $2 LIMIT 1`,
    [pengamatNik, targetNik]);
  return rows.length > 0;
}
