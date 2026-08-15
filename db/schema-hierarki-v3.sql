-- ================================================================
-- PERBAIKAN PENCOCOKAN WILAYAH (v3)
-- Jalankan SETELAH db/schema-hierarki-v2.sql. Aman dijalankan ulang.
--
-- Masalah yang diperbaiki
-- -----------------------
-- Visibilitas mensyaratkan dua hal: hierarki jabatan cocok DAN wilayah
-- cocok. Syarat wilayah dulu dibandingkan mentah-mentah, sehingga:
--
--   1. "MANADO " (dengan spasi di belakang) dianggap berbeda dari "MANADO",
--      dan orangnya hilang dari layar atasannya tanpa keterangan apa pun.
--
--   2. Atasan yang tidak terikat satu cabang — ACH dan AM biasanya punya
--      kolom cabang kosong karena membawahi area — tidak pernah cocok
--      dengan BM mana pun, padahal BM seharusnya bisa melihat KPI ACH-nya.
--
-- Keduanya bergejala sama: orang hilang begitu saja. Yang pertama diobati
-- dengan normalisasi, yang kedua dengan mencocokkan lewat area.
-- ================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. NORMALISASI NAMA WILAYAH
--    Merapikan spasi berlebih dan menyeragamkan huruf, supaya
--    "manado", "MANADO ", dan "MANADO" dianggap satu tempat yang sama.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norm_wilayah(p TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(BTRIM(UPPER(regexp_replace(COALESCE(p,''), '\s+', ' ', 'g'))), '');
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 2. RAPIKAN DATA YANG SUDAH ADA
--    Memperbaiki penyebabnya sekaligus, bukan hanya menutupinya saat
--    membaca. Baris yang sudah rapi tidak tersentuh.
-- ---------------------------------------------------------------------
UPDATE app_user
   SET cabang = norm_wilayah(cabang)
 WHERE cabang IS DISTINCT FROM norm_wilayah(cabang);

UPDATE app_user
   SET area = norm_wilayah(area)
 WHERE area IS DISTINCT FROM norm_wilayah(area);

-- ---------------------------------------------------------------------
-- 3. INDEKS MENGIKUTI BENTUK YANG DINORMALKAN
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_cabang_norm
  ON app_user (norm_wilayah(cabang)) WHERE aktif;
CREATE INDEX IF NOT EXISTS idx_user_area_norm
  ON app_user (norm_wilayah(area)) WHERE aktif;

COMMIT;

-- ---------------------------------------------------------------------
-- PEMERIKSAAN — jalankan terpisah bila ingin melihat hasilnya
-- ---------------------------------------------------------------------
-- Pegawai aktif yang kolom cabangnya kosong (akan dicocokkan lewat area):
--   SELECT nik, nama, jabatan, area FROM app_user
--    WHERE aktif AND cabang IS NULL AND area IS NOT NULL ORDER BY area, nama;
--
-- Daftar cabang setelah dirapikan:
--   SELECT cabang, COUNT(*) FROM app_user WHERE aktif GROUP BY 1 ORDER BY 1;
