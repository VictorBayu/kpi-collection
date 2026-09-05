-- ---------------------------------------------------------------------
-- KOLOM TURUNAN v16 — kolom hasil olahan, disusun dari layar web
--
-- Kebutuhannya: kolom seperti od_movement_new yang nilainya bukan datang
-- dari API, melainkan hasil olahan kolom lain — termasuk kolom dari data
-- pendukung yang digabung lewat agreement_no.
--
-- Kolom turunan DIMATERIALISASI: nilainya dihitung sekali seusai menarik
-- data lalu disimpan ke kolom fisik di data_mentah. Alternatifnya adalah
-- menyisipkan ekspresinya tiap kali rumus dipakai, tapi itu membuat satu
-- kolom turunan yang keliru merusak setiap indikator yang menyentuhnya,
-- dan hasilnya tidak bisa diperiksa admin lewat Sample Data. Dengan
-- dimaterialisasi, isinya bisa dilihat seperti kolom biasa.
--
-- Dua cara menyusunnya:
--   'visual' — daftar cabang syarat → nilai, dirakit lewat dropdown.
--   'sql'    — ekspresi CASE WHEN yang diketik admin, disaring ketat
--              terhadap katalog kolom sebelum dijalankan.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kolom_turunan (
  kolom        TEXT PRIMARY KEY
               REFERENCES mentah_kolom(kolom) ON DELETE CASCADE ON UPDATE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'visual' CHECK (mode IN ('visual','sql')),

  -- Mode visual: [{ syarat:[{kolom,operator,nilai[]}], gabung:'dan'|'atau', nilai:'…' }]
  aturan       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Nilai bila tak satu pun cabang terpenuhi.
  nilai_lain   TEXT,

  -- Mode sql: ekspresi mentah yang diketik admin (sudah lolos penyaringan).
  ekspresi_sql TEXT,

  -- Jejak perhitungan terakhir, supaya admin tahu kolomnya sudah terisi
  -- atau belum tanpa harus membuka Sample Data.
  dihitung_pada TIMESTAMPTZ,
  baris_terisi  INTEGER,
  galat         TEXT,

  diperbarui   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Unggahan data pendukung dari Excel.
--
-- Data pendukung bisa datang dari API (v15) maupun dari berkas Excel
-- berisi agreement_no dan beberapa kolom nilai. Riwayatnya dicatat supaya
-- angka yang berubah bisa ditelusuri ke berkas mana yang menaikkannya —
-- pertanyaan yang selalu muncul begitu ada yang merasa angkanya salah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pendukung_unggah (
  id           BIGSERIAL PRIMARY KEY,
  nama_file    TEXT,
  kolom_diisi  TEXT[],
  baris_masuk  INTEGER NOT NULL DEFAULT 0,
  baris_tolak  INTEGER NOT NULL DEFAULT 0,
  oleh         UUID,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pendukung_unggah_waktu
  ON pendukung_unggah (dibuat_pada DESC);

-- Menandai kolom yang nilainya berasal dari olahan, bukan dari API. Kolom
-- semacam ini tidak boleh diisi saat menarik data — ia dihitung sesudahnya.
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS turunan BOOLEAN NOT NULL DEFAULT false;

-- Menu baru untuk peran admin.
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', m FROM unnest(ARRAY['admin_turunan','admin_pendukung']) m
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;

-- Dasbor tim untuk peran yang memang punya bawahan. Diberikan ke peran
-- yang sudah boleh membuka "Tim saya", supaya tidak ada peran yang bisa
-- melihat ringkasannya tapi tidak rinciannya (atau sebaliknya).
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT peran_kode, 'tim_dashboard' FROM peran_menu WHERE menu_kode = 'tim'
ON CONFLICT DO NOTHING;
