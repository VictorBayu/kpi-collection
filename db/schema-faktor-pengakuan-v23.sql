-- ---------------------------------------------------------------------
-- FAKTOR PENGAKUAN v23 — pengakuan sebagian per pendaftaran jabatan·produk
--
-- Sebagian jabatan menghandle lebih dari satu produk sekaligus (mis. MBS
-- MIX menghandle R2 dan R4). Kalau porsi kerjanya di satu produk memang
-- cuma separuh, pencapaian mentah yang dihitung dari data (SUM/COUNT dari
-- data_mentah) perlu diakui sebagian saja di pendaftaran itu — bukan
-- dihitung penuh seolah seluruh portofolio produk itu ditangani sendirian.
--
-- Beda dengan pengakuan_kolom/indikator_pengakuan (v13): yang itu memberi
-- bobot berbeda PER NILAI pada satu kolom data (mis. BTC 50%, Lunas 80%).
-- Faktor ini berlaku BLANKO untuk satu pendaftaran jabatan·produk,
-- terlepas dari isi datanya — dipakai saat porsi kerja itu sendiri yang
-- terbagi, bukan datanya.
--
-- Diterapkan di titik paling awal: mengalikan pencapaian mentah SEBELUM
-- dicocokkan ke pita/target, supaya skor dan gerbang yang menunjuknya
-- ikut konsisten memakai angka yang sudah diakui, bukan angka penuh.
--
-- 100 berarti diakui penuh (default, tidak mengubah perilaku lama apa
-- pun). Rentang 0–1000 disamakan dengan ck_pengakuan_persen (v13): 1000
-- untuk kasus langka pengakuan berlipat, sekaligus tetap menangkap salah
-- ketik seperti "5000" yang akan mengacaukan seluruh perhitungan.
--
-- Aman dijalankan berulang.
-- ---------------------------------------------------------------------

ALTER TABLE indikator_target
  ADD COLUMN IF NOT EXISTS faktor_pengakuan NUMERIC(6,2) NOT NULL DEFAULT 100;

ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_faktor_pengakuan;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_faktor_pengakuan
  CHECK (faktor_pengakuan >= 0 AND faktor_pengakuan <= 1000);
