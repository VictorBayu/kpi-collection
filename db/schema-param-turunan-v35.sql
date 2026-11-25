-- =====================================================================
-- v35 — KOLOM TURUNAN MODE "TABEL PARAMETER" + MENU EDITOR TABEL PARAMETER
--
-- Kolom turunan kini bisa diisi dengan mencari nilai di tabel parameter
-- (v34): tiap baris data mentah dicocokkan ke band setiap sumbu, lalu
-- nominal sel kombinasinya ditulis ke kolom turunan. Tabel dirujuk lewat
-- KODE, bukan id, supaya versi per periode dipilih otomatis (param_versi).
--
-- Aman dijalankan ulang.
-- =====================================================================

ALTER TABLE kolom_turunan DROP CONSTRAINT IF EXISTS kolom_turunan_mode_check;
ALTER TABLE kolom_turunan DROP CONSTRAINT IF EXISTS ck_turunan_mode;
ALTER TABLE kolom_turunan ADD CONSTRAINT ck_turunan_mode
  CHECK (mode IN ('visual','sql','tabel'));

ALTER TABLE kolom_turunan ADD COLUMN IF NOT EXISTS param_kode TEXT;

-- Hak akses menu editor tabel parameter untuk peran admin.
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_param_tabel'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;
