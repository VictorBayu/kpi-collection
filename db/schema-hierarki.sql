-- ================================================================
-- MASTER HIERARKI JABATAN
-- Jalankan SEKALI setelah schema.sql, schema-addendum.sql,
-- dan schema-access.sql. Aman dijalankan ulang.
--
-- Dua tabel:
--   jabatan_level  — setiap jabatan punya satu level (staff s/d manager_1)
--   jabatan_atasan — rantai atasan tiap jabatan, berurutan naik ke atas
--
-- Aturan visibilitas (lihat v_visibilitas di bawah): seorang atasan boleh
-- melihat KPI/insentif jabatan yang menempatkan dia di rantai atasannya,
-- TAPI hanya sampai satu tingkat sebelum dirinya sendiri. Artinya
-- atasan{n} melihat jabatan staf itu dan semua atasan{1..n-1}, tidak
-- pernah atasan{n+1} ke atas.
-- ================================================================

-- ---------------------------------------------------------------------
-- 1. LEVEL TIAP JABATAN
--    urutan: makin besar makin tinggi. Dipakai untuk mengurutkan
--    tampilan dan sebagai pagar tambahan saat rantai atasan belum lengkap.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jabatan_level (
  jabatan    TEXT PRIMARY KEY,
  level      TEXT NOT NULL
             CHECK (level IN ('staff','spv_level_1','spv_level_2',
                              'manager_3','manager_2','manager_1','admin')),
  urutan     INTEGER NOT NULL DEFAULT 0,
  aktif      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. RANTAI ATASAN TIAP JABATAN
--    tingkat 1 = atasan langsung, 2 = atasannya atasan, dst.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jabatan_atasan (
  jabatan    TEXT    NOT NULL,
  tingkat    INTEGER NOT NULL CHECK (tingkat BETWEEN 1 AND 10),
  atasan     TEXT    NOT NULL,
  PRIMARY KEY (jabatan, tingkat)
);
CREATE INDEX IF NOT EXISTS idx_jab_atasan ON jabatan_atasan (atasan);

-- ---------------------------------------------------------------------
-- 3. NORMALISASI NAMA JABATAN
--    Data pegawai memakai varian seperti "BCH F MIX", sedangkan master
--    memakai "BCH F". Fungsi ini merapikan spasi/kapital saja; pencocokan
--    varian dilakukan lewat jabatan_alias di bawah.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norm_jabatan(p TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(BTRIM(UPPER(regexp_replace(COALESCE(p,''), '\s+', ' ', 'g'))), '');
$$ LANGUAGE sql IMMUTABLE;

-- Alias opsional: memetakan penulisan lain ke jabatan master.
-- Contoh isi: ('BCH F MIX' -> 'BCH F'). Dikelola admin lewat UI.
CREATE TABLE IF NOT EXISTS jabatan_alias (
  alias   TEXT PRIMARY KEY,
  jabatan TEXT NOT NULL
);

-- Jabatan efektif seorang user: alias dulu, kalau tidak ada pakai apa adanya.
CREATE OR REPLACE VIEW v_user_jabatan AS
SELECT u.id, u.nik, u.nama, u.cabang, u.area, u.peran, u.aktif,
       COALESCE(a.jabatan, norm_jabatan(u.jabatan)) AS jabatan_master,
       u.jabatan AS jabatan_asli
  FROM app_user u
  LEFT JOIN jabatan_alias a ON a.alias = norm_jabatan(u.jabatan);

-- ---------------------------------------------------------------------
-- 4. VISIBILITAS — siapa boleh melihat jabatan apa
--    Baris (pengamat, target) berarti: pemegang jabatan `pengamat`
--    boleh melihat KPI pemegang jabatan `target`.
--
--    Diturunkan langsung dari rantai atasan:
--      untuk jabatan J dengan rantai a1..an,
--        a1 melihat J
--        a2 melihat J, a1
--        ak melihat J, a1..a(k-1)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_visibilitas AS
-- atasan melihat jabatan stafnya sendiri
SELECT x.atasan AS pengamat, x.jabatan AS target
  FROM jabatan_atasan x
UNION
-- atasan tingkat tinggi melihat atasan yang tingkatnya lebih rendah
-- pada rantai jabatan yang sama
SELECT hi.atasan AS pengamat, lo.atasan AS target
  FROM jabatan_atasan hi
  JOIN jabatan_atasan lo
    ON lo.jabatan = hi.jabatan AND lo.tingkat < hi.tingkat;

-- ---------------------------------------------------------------------
-- 5. SEED — sesuai dokumen hierarki_jabatan_kpi.md
-- ---------------------------------------------------------------------
INSERT INTO jabatan_level (jabatan, level, urutan) VALUES
  ('AM',        'manager_1',   60),
  ('ACH',       'manager_2',   50),
  ('BM',        'manager_3',   40),
  ('DBM',       'manager_3',   40),
  ('P',         'manager_3',   40),
  ('BCH F',     'spv_level_2', 30),
  ('BCH ME',    'spv_level_2', 30),
  ('BCH FE',    'spv_level_2', 30),
  ('BCS TT',    'spv_level_1', 20),
  ('EBS MIX',   'staff',       10),
  ('FAR MIX',   'staff',       10),
  ('FAR R2',    'staff',       10),
  ('FAR R4',    'staff',       10),
  ('FC F R2',   'staff',       10),
  ('FC F R4',   'staff',       10),
  ('FC SA MIX', 'staff',       10),
  ('FC SA R2',  'staff',       10),
  ('FC TT R2',  'staff',       10),
  ('FC TT R4',  'staff',       10),
  ('MBS MIX',   'staff',       10),
  ('MEBS MIX',  'staff',       10),
  ('RE MIX',    'staff',       10),
  ('RE R2',     'staff',       10)
ON CONFLICT (jabatan) DO NOTHING;

INSERT INTO jabatan_atasan (jabatan, tingkat, atasan) VALUES
  -- EBS MIX → BCH ME → ACH → BM → AM
  ('EBS MIX',  1, 'BCH ME'), ('EBS MIX',  2, 'ACH'),
  ('EBS MIX',  3, 'BM'),     ('EBS MIX',  4, 'AM'),
  -- MBS MIX → BCH ME → ACH → BM → AM
  ('MBS MIX',  1, 'BCH ME'), ('MBS MIX',  2, 'ACH'),
  ('MBS MIX',  3, 'BM'),     ('MBS MIX',  4, 'AM'),
  -- MEBS MIX → BCH FE → BCH ME → ACH → BM
  ('MEBS MIX', 1, 'BCH FE'), ('MEBS MIX', 2, 'BCH ME'),
  ('MEBS MIX', 3, 'ACH'),    ('MEBS MIX', 4, 'BM'),
  -- FAR MIX / FAR R2 / FAR R4 / FC SA MIX / FC SA R2 / RE MIX / RE R2
  --   → BCH F → BCH FE → ACH → BM → AM
  ('FAR MIX',   1, 'BCH F'), ('FAR MIX',   2, 'BCH FE'), ('FAR MIX',   3, 'ACH'),
  ('FAR MIX',   4, 'BM'),    ('FAR MIX',   5, 'AM'),
  ('FAR R2',    1, 'BCH F'), ('FAR R2',    2, 'BCH FE'), ('FAR R2',    3, 'ACH'),
  ('FAR R2',    4, 'BM'),    ('FAR R2',    5, 'AM'),
  ('FAR R4',    1, 'BCH F'), ('FAR R4',    2, 'BCH FE'), ('FAR R4',    3, 'ACH'),
  ('FAR R4',    4, 'BM'),    ('FAR R4',    5, 'AM'),
  ('FC SA MIX', 1, 'BCH F'), ('FC SA MIX', 2, 'BCH FE'), ('FC SA MIX', 3, 'ACH'),
  ('FC SA MIX', 4, 'BM'),    ('FC SA MIX', 5, 'AM'),
  ('FC SA R2',  1, 'BCH F'), ('FC SA R2',  2, 'BCH FE'), ('FC SA R2',  3, 'ACH'),
  ('FC SA R2',  4, 'BM'),    ('FC SA R2',  5, 'AM'),
  ('RE MIX',    1, 'BCH F'), ('RE MIX',    2, 'BCH FE'), ('RE MIX',    3, 'ACH'),
  ('RE MIX',    4, 'BM'),    ('RE MIX',    5, 'AM'),
  ('RE R2',     1, 'BCH F'), ('RE R2',     2, 'BCH FE'), ('RE R2',     3, 'ACH'),
  ('RE R2',     4, 'BM'),    ('RE R2',     5, 'AM'),
  -- FC F R2 / FC F R4 → BCS TT → BCH F → ACH → BM → AM
  ('FC F R2',  1, 'BCS TT'), ('FC F R2',  2, 'BCH F'), ('FC F R2',  3, 'ACH'),
  ('FC F R2',  4, 'BM'),     ('FC F R2',  5, 'AM'),
  ('FC F R4',  1, 'BCS TT'), ('FC F R4',  2, 'BCH F'), ('FC F R4',  3, 'ACH'),
  ('FC F R4',  4, 'BM'),     ('FC F R4',  5, 'AM'),
  -- FC TT R2 / FC TT R4 → BCS TT → BCH F → BCH FE → ACH → BM → AM
  ('FC TT R2', 1, 'BCS TT'), ('FC TT R2', 2, 'BCH F'),  ('FC TT R2', 3, 'BCH FE'),
  ('FC TT R2', 4, 'ACH'),    ('FC TT R2', 5, 'BM'),     ('FC TT R2', 6, 'AM'),
  ('FC TT R4', 1, 'BCS TT'), ('FC TT R4', 2, 'BCH F'),  ('FC TT R4', 3, 'BCH FE'),
  ('FC TT R4', 4, 'ACH'),    ('FC TT R4', 5, 'BM'),     ('FC TT R4', 6, 'AM')
ON CONFLICT (jabatan, tingkat) DO NOTHING;

-- Alias untuk varian penulisan yang dipakai di data pegawai.
INSERT INTO jabatan_alias (alias, jabatan) VALUES
  ('BCH F MIX',  'BCH F'),
  ('BCH ME MIX', 'BCH ME'),
  ('BCH FE MIX', 'BCH FE'),
  ('BCS TT MIX', 'BCS TT')
ON CONFLICT (alias) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. INDEKS PENDUKUNG
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_jabatan ON app_user (jabatan) WHERE aktif;

-- ---------------------------------------------------------------------
-- 7. v_akses_ringkas DIPERBARUI — tambah jabatan & level
--    Dipakai layar "Pengguna & Akses" yang sekarang bisa mengedit user.
--
--    DROP dulu, bukan CREATE OR REPLACE: Postgres hanya mengizinkan
--    REPLACE bila daftar kolom lama tetap sama persis dan kolom baru
--    ditambahkan di akhir. Di sini `jabatan` disisipkan di tengah, jadi
--    view-nya harus dibuat ulang. Tidak ada objek lain yang bergantung
--    pada view ini, sehingga aman.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_akses_ringkas;
CREATE VIEW v_akses_ringkas AS
SELECT
  u.id, u.nik, u.nama, u.peran, u.jabatan, u.cabang, u.area, u.aktif,
  COALESCE(al.jabatan, norm_jabatan(u.jabatan)) AS jabatan_master,
  jl.level,
  u.login_count, u.access_count, u.last_login_at, u.last_access_at,
  u.suspended_at, u.suspended_reason,
  COALESCE(a30.akses_30h, 0)  AS akses_30h,
  COALESCE(a7.akses_7h, 0)    AS akses_7h
FROM app_user u
LEFT JOIN jabatan_alias al ON al.alias = norm_jabatan(u.jabatan)
LEFT JOIN jabatan_level jl ON jl.jabatan = COALESCE(al.jabatan, norm_jabatan(u.jabatan))
LEFT JOIN (
  SELECT user_id, COUNT(*) AS akses_30h FROM access_log
   WHERE created_at > now() - interval '30 days' GROUP BY user_id
) a30 ON a30.user_id = u.id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS akses_7h FROM access_log
   WHERE created_at > now() - interval '7 days' GROUP BY user_id
) a7 ON a7.user_id = u.id;
