-- ---------------------------------------------------------------------
-- v18 — memilih kolom yang ditarik + mengelola baris data pendukung
--
-- 1. `ditarik` pada mentah_kolom
--
--    Sebelumnya penanda `aktif` hanya menyembunyikan kolom dari perakit
--    rumus; kolomnya tetap diambil tiap kali cron berjalan. Jadi
--    pertanyaan "kolom mana yang sebenarnya diambil dari API" tidak
--    pernah benar-benar bisa dijawab dari layar. Penanda ini yang
--    menjawabnya: kolom dengan ditarik = false dilewati saat menulis
--    baris, sehingga tidak memakan lebar permintaan maupun penyimpanan.
--
--    Dibedakan dari `aktif` dengan sengaja — keduanya menjawab pertanyaan
--    berbeda. Sebuah kolom bisa saja tetap ditarik (datanya dibutuhkan
--    kolom turunan) tapi tidak ditawarkan saat menyusun rumus.
--
-- 2. `aktif` pada data_pendukung
--
--    Data pendukung diunggah manual, jadi wajar ada berkas yang keliru
--    atau kedaluwarsa. Menghapus barisnya menghilangkan jejak; menandainya
--    tidak aktif membuat angkanya berhenti dipakai tanpa kehilangan
--    riwayat apa yang pernah masuk.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS ditarik BOOLEAN NOT NULL DEFAULT true;

-- Kolom turunan tidak pernah datang dari API — ia dihitung sesudahnya.
UPDATE mentah_kolom SET ditarik = false
 WHERE COALESCE(turunan, false) AND ditarik;

ALTER TABLE data_pendukung ADD COLUMN IF NOT EXISTS aktif BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE data_pendukung ADD COLUMN IF NOT EXISTS catatan TEXT;
ALTER TABLE data_pendukung ADD COLUMN IF NOT EXISTS diperbarui TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE data_pendukung_staging ADD COLUMN IF NOT EXISTS aktif BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE data_pendukung_staging ADD COLUMN IF NOT EXISTS catatan TEXT;
ALTER TABLE data_pendukung_staging ADD COLUMN IF NOT EXISTS diperbarui TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pendukung_aktif ON data_pendukung (aktif);
