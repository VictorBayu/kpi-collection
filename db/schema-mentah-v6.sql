-- =====================================================================
-- v6 — MEMPROMOSIKAN LIMA FIELD TANGGAL DARI `lain` MENJADI KOLOM SENDIRI
--
-- Kelima field ini semula ikut tersimpan di kolom penampung `lain`
-- (JSON), karena awalnya tidak dipakai indikator. Kini diperlukan, jadi
-- dinaikkan menjadi kolom terstruktur agar bisa diindeks, difilter, dan
-- muncul sebagai pilihan di pembangun indikator.
--
-- Kolom ditambahkan ke tabel resmi DAN meja sementara. Meja sementara
-- dibuat dengan LIKE, jadi penambahan kolom di tabel resmi tidak otomatis
-- merambat ke sana — keduanya harus disebut sendiri.
--
-- Aman dijalankan ulang.
-- =====================================================================

ALTER TABLE data_mentah         ADD COLUMN IF NOT EXISTS tgl_tarik            DATE;
ALTER TABLE data_mentah         ADD COLUMN IF NOT EXISTS tanggal_ral          DATE;
ALTER TABLE data_mentah         ADD COLUMN IF NOT EXISTS tgl_value_pertama    DATE;
ALTER TABLE data_mentah         ADD COLUMN IF NOT EXISTS tgl_value_akhir_ini  DATE;
ALTER TABLE data_mentah         ADD COLUMN IF NOT EXISTS tgl_value_akhir_lalu DATE;

ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS tgl_tarik            DATE;
ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS tanggal_ral          DATE;
ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS tgl_value_pertama    DATE;
ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS tgl_value_akhir_ini  DATE;
ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS tgl_value_akhir_lalu DATE;

-- Didaftarkan ke katalog supaya bisa dipilih sebagai kolom syarat di
-- pembangun indikator. Jenis "tanggal" menentukan operator yang ditawarkan
-- (sebelum, setelah, antara) dan bahwa nilainya bukan daftar pilihan.
INSERT INTO mentah_kolom (kolom, label, jenis, agregat, kelompok, urutan) VALUES
  ('tgl_tarik',            'Tanggal Tarik',              'tanggal', FALSE, 'Tanggal', 760),
  ('tanggal_ral',          'Tanggal RAL',                'tanggal', FALSE, 'Tanggal', 770),
  ('tgl_value_pertama',    'Tanggal Value Pertama',      'tanggal', FALSE, 'Tanggal', 780),
  ('tgl_value_akhir_ini',  'Tanggal Value Terakhir Bulan Ini',  'tanggal', FALSE, 'Tanggal', 790),
  ('tgl_value_akhir_lalu', 'Tanggal Value Terakhir Bulan Lalu', 'tanggal', FALSE, 'Tanggal', 800)
ON CONFLICT (kolom) DO UPDATE
  SET label = EXCLUDED.label, jenis = EXCLUDED.jenis,
      agregat = EXCLUDED.agregat, kelompok = EXCLUDED.kelompok,
      urutan = EXCLUDED.urutan;
