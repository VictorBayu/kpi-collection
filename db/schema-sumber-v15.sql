-- ---------------------------------------------------------------------
-- SUMBER DATA v15 — data pendukung di samping data API utama
--
-- Kebutuhannya: sebagian indikator perlu menggabungkan angka dari API
-- utama dengan angka dari sumber lain (data pendukung), dikaitkan lewat
-- nomor kontrak. Struktur data pendukung belum final saat migrasi ini
-- dibuat, jadi tabelnya sengaja dibuat MINIMAL: hanya kunci dan kolom
-- pengelola. Kolom isinya ditambahkan admin lewat layar Kolom Data API,
-- persis seperti kolom kustom pada data utama.
--
-- Dengan begitu struktur akhirnya tidak perlu diketahui sekarang — dan
-- saat sudah pasti, tidak perlu migrasi baru sama sekali.
--
-- Kuncinya agreement_no untuk kedua sumber, sesuai kesepakatan.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_pendukung (
  id           BIGSERIAL PRIMARY KEY,
  agreement_no TEXT NOT NULL,
  branch_id    TEXT,
  ditarik_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu baris per kontrak: penggabungan ke data utama harus tidak pernah
-- melipatgandakan baris. Tanpa keunikan ini, satu kontrak yang muncul dua
-- kali di data pendukung akan menggandakan outstanding principal-nya di
-- data utama — kesalahan yang sangat sulit terlihat karena angkanya tetap
-- masuk akal, hanya terlalu besar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pendukung_agreement
  ON data_pendukung (agreement_no);

CREATE TABLE IF NOT EXISTS data_pendukung_staging (LIKE data_pendukung INCLUDING DEFAULTS);

-- ---------------------------------------------------------------------
-- Penanda sumber pada katalog kolom. Kolom lama seluruhnya milik data
-- utama; kolom pendukung ditambahkan admin sesudahnya.
-- ---------------------------------------------------------------------
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'api';

ALTER TABLE mentah_kolom DROP CONSTRAINT IF EXISTS ck_kolom_sumber;
ALTER TABLE mentah_kolom ADD CONSTRAINT ck_kolom_sumber
  CHECK (sumber IN ('api', 'pendukung'));

-- Nama kolom hanya perlu unik di dalam satu sumber, tapi kunci utama
-- tabel ini adalah `kolom` saja. Dibiarkan begitu dengan sengaja: nama
-- yang sama di dua sumber akan membingungkan saat menyusun rumus, dan
-- keunikan menyeluruh membuat rumus tidak pernah ambigu kolom mana yang
-- dimaksud tanpa harus menyebut sumbernya.

CREATE INDEX IF NOT EXISTS idx_kolom_sumber ON mentah_kolom (sumber);
