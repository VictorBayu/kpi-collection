-- ================================================================
-- LEVEL JABATAN JADI DATA (v4)
-- Jalankan SETELAH db/schema-hierarki-v3.sql. Aman dijalankan ulang.
--
-- Sebelumnya daftar level dikunci di dalam CHECK constraint dan di kode
-- aplikasi. Menambah satu tingkat baru — misalnya ketika perusahaan
-- menyisipkan jabatan di antara SPV dan Manager — berarti mengubah kode
-- lalu deploy ulang, padahal itu perubahan organisasi biasa yang bisa
-- terjadi kapan saja.
--
-- Sekarang level disimpan di tabelnya sendiri sehingga admin bisa
-- menambah, mengubah nama, dan menyusun ulang urutannya dari layar
-- Master Hierarki.
-- ================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TABEL LEVEL
--    urutan: makin besar makin tinggi kedudukannya. Dipakai untuk
--    mengurutkan diagram dan menentukan siapa berwenang se-area.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jabatan_level_ref (
  kode       TEXT PRIMARY KEY,
  nama       TEXT    NOT NULL,
  urutan     INTEGER NOT NULL DEFAULT 0,
  -- Level yang wilayah kerjanya se-area, bukan se-cabang (AM, ACH).
  se_area    BOOLEAN NOT NULL DEFAULT FALSE,
  aktif      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO jabatan_level_ref (kode, nama, urutan, se_area) VALUES
  ('staff',       'Staff',                  10, FALSE),
  ('spv_level_1', 'SPV level 1',            20, FALSE),
  ('spv_level_2', 'SPV level 2',            30, FALSE),
  ('manager_3',   'Manager 3 (BM/DBM/P)',   40, FALSE),
  ('manager_2',   'Manager 2 (ACH)',        50, TRUE),
  ('manager_1',   'Manager 1 (AM)',         60, TRUE),
  ('admin',       'Admin',                  99, TRUE)
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. LEPASKAN DAFTAR LEVEL DARI CHECK CONSTRAINT
--    Diganti foreign key ke tabel di atas, supaya level baru cukup
--    ditambahkan lewat aplikasi tanpa mengubah skema.
-- ---------------------------------------------------------------------
ALTER TABLE jabatan_level DROP CONSTRAINT IF EXISTS jabatan_level_level_check;

-- Pastikan setiap level yang sudah terpakai punya barisnya, agar
-- penambahan foreign key di bawah tidak gagal.
INSERT INTO jabatan_level_ref (kode, nama, urutan)
SELECT DISTINCT jl.level, INITCAP(REPLACE(jl.level, '_', ' ')), 0
  FROM jabatan_level jl
 WHERE jl.level IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM jabatan_level_ref r WHERE r.kode = jl.level)
ON CONFLICT (kode) DO NOTHING;

ALTER TABLE jabatan_level DROP CONSTRAINT IF EXISTS fk_jabatan_level_ref;
ALTER TABLE jabatan_level
  ADD CONSTRAINT fk_jabatan_level_ref
  FOREIGN KEY (level) REFERENCES jabatan_level_ref(kode)
  ON UPDATE CASCADE;   -- ganti nama kode level ikut terbawa

COMMIT;

-- ---------------------------------------------------------------------
-- PEMERIKSAAN
-- ---------------------------------------------------------------------
-- Level beserta jumlah jabatan yang memakainya:
--   SELECT r.kode, r.nama, r.urutan, r.se_area, COUNT(jl.jabatan) AS jabatan
--     FROM jabatan_level_ref r
--     LEFT JOIN jabatan_level jl ON jl.level = r.kode
--    GROUP BY 1,2,3,4 ORDER BY r.urutan DESC;
