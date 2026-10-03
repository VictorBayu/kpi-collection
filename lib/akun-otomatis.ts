import { q } from "./db";

/**
 * Akun otomatis dari data API.
 *
 * Setiap NIK yang muncul di kolom PIC data_mentah (staff/spv/bch,
 * format "NIK - NAMA (JABATAN)") dibuatkan baris app_user bila belum
 * ada, supaya KPI & insentifnya tetap dihitung walau orangnya belum
 * punya login. Akun ini:
 *   - bisa_login = FALSE, password_hash = '!' (tidak mungkin cocok),
 *   - sumber_akun = 'api', peran 'karyawan' (tidak pernah otomatis
 *     diberi peran istimewa),
 *   - perlu_ditinjau = TRUE bila jabatannya tidak dikenal di
 *     jabatan_produk (tetap dibuat; admin yang memutuskan).
 * Akun yang sumber_akun-nya 'manual' TIDAK disentuh. Akun api yang
 * tidak lagi muncul di API hanya ditandai hilang_dari_api, tidak dihapus.
 */
export async function sinkronAkunDariApi() {
  const dibuat = await q<{ nik: string }>(
    `WITH x AS (
       SELECT nik_staff AS nik, staff_pic AS pic, branch_id FROM data_mentah
       UNION ALL SELECT nik_spv, spv_pic, branch_id FROM data_mentah
       UNION ALL SELECT nik_bch, bch_pic, branch_id FROM data_mentah
     ), j AS (
       SELECT nik,
              btrim(regexp_replace(regexp_replace(pic, '^\\s*\\d+\\s*-\\s*', ''),
                                   '\\s*\\([^)]*\\)\\s*$', '')) AS nama,
              upper(btrim(substring(pic from '\\(([^)]*)\\)\\s*$'))) AS jab,
              branch_id
         FROM x WHERE nik IS NOT NULL AND pic IS NOT NULL
     ), c AS (
       SELECT nik, nama, jab, branch_id, count(*) n FROM j GROUP BY nik, nama, jab, branch_id
     ), p AS (
       SELECT DISTINCT ON (nik) nik, nama, jab, branch_id
         FROM c ORDER BY nik, (jab IS NULL), n DESC, jab, branch_id
     ), f AS (
       SELECT p.nik, p.nama, p.jab,
              ca.cabang, ca.area,
              (p.jab IS NULL OR NOT EXISTS (
                 SELECT 1 FROM jabatan_produk jp WHERE jp.alias = norm_jabatan(p.jab))) AS tinjau
         FROM p LEFT JOIN cabang_api ca ON ca.branch_id = p.branch_id
        WHERE p.nama <> ''
     ), ins AS (
       INSERT INTO app_user
         (nik, nama, password_hash, jabatan, cabang, area, peran, aktif,
          must_change_password, bisa_login, sumber_akun, perlu_ditinjau)
       SELECT nik, nama, '!', jab, upper(cabang), upper(area), 'karyawan', TRUE,
              TRUE, FALSE, 'api', tinjau
         FROM f
       ON CONFLICT (nik) DO UPDATE
          SET jabatan = COALESCE(EXCLUDED.jabatan, app_user.jabatan),
              cabang  = COALESCE(EXCLUDED.cabang, app_user.cabang),
              area    = COALESCE(EXCLUDED.area, app_user.area),
              nama    = EXCLUDED.nama,
              perlu_ditinjau = EXCLUDED.perlu_ditinjau,
              hilang_dari_api = FALSE
        WHERE app_user.sumber_akun = 'api'
       RETURNING nik, (xmax = 0) AS baru
     )
     SELECT nik FROM ins WHERE baru`);

  // Akun api yang tidak muncul lagi -> ditandai saja. Hanya bila data
  // mentah tidak kosong, supaya tarikan gagal tidak menandai semua orang.
  const [hilang] = await q<{ n: number }>(
    `WITH ada AS (
       SELECT nik_staff AS nik FROM data_mentah UNION SELECT nik_spv FROM data_mentah
       UNION SELECT nik_bch FROM data_mentah
     ), u AS (
       UPDATE app_user SET hilang_dari_api = TRUE
        WHERE sumber_akun = 'api' AND NOT hilang_dari_api
          AND EXISTS (SELECT 1 FROM ada WHERE nik IS NOT NULL)
          AND nik NOT IN (SELECT nik FROM ada WHERE nik IS NOT NULL)
        RETURNING 1)
     SELECT count(*)::int AS n FROM u`);

  return { baru: dibuat.length, hilang: hilang?.n ?? 0 };
}
