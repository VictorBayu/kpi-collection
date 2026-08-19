-- =====================================================================
-- v8 — DUA BOBOT TERPISAH DAN MASTER PAGU INSENTIF
--
-- Satu indikator bisa berlaku untuk dua skema penilaian dengan bobot
-- yang berbeda: SR TT 1 berbobot 25% pada skor KPI tapi 20% pada skor
-- insentif. Ada pula indikator yang hanya masuk salah satunya — di FC TT
-- misalnya, satu indikator murni penentu insentif dan tidak ikut
-- memengaruhi skor KPI sama sekali.
--
-- Karena itu `bobot` tunggal dipecah jadi dua kolom. Yang dikosongkan
-- berarti indikator itu tidak ikut skema bersangkutan — bukan berbobot
-- nol, melainkan memang tidak dihitung.
--
-- Nominal insentif sengaja TIDAK ditaruh di indikator. Nominal melekat
-- pada jabatan, bukan pada indikatornya: beberapa indikator dijumlahkan
-- dulu jadi satu skor insentif, baru skor itu dikalikan pagu jabatan.
-- Menaruhnya di indikator akan berarti mengulang angka pagu yang sama di
-- tiap baris pendaftaran, dan membuatnya bisa berbeda-beda tanpa sengaja.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DUA BOBOT PADA PENDAFTARAN INDIKATOR
-- ---------------------------------------------------------------------
ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS bobot_kpi      NUMERIC(6,2);
ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS bobot_insentif NUMERIC(6,2);

-- Bobot lama dipindahkan ke bobot KPI sekali jalan, lalu kolomnya dibuang.
-- Sampai sekarang bobot tunggal itu memang hanya dipakai menghitung skor
-- KPI, jadi pemindahannya tidak mengubah angka mana pun.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'indikator_target' AND column_name = 'bobot') THEN
    UPDATE indikator_target SET bobot_kpi = bobot WHERE bobot_kpi IS NULL;
    ALTER TABLE indikator_target DROP COLUMN bobot;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. MASTER PAGU INSENTIF
--    Nominal maksimal per jabatan+produk, dan skor minimal sebelum
--    insentif mulai dibayarkan.
--
--    Rumusnya: nominal = (skor insentif terbobot / pembagi) x pagu,
--    dan nol bila skor di bawah skor_minimal. Pembagi disimpan sebagai
--    data (bukan angka 5 yang ditanam di kode) supaya skala penilaian
--    bisa berubah tanpa menyentuh program.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insentif_pagu (
  alias         TEXT NOT NULL,
  produk        TEXT NOT NULL REFERENCES produk_master(kode) ON UPDATE CASCADE,
  nominal       NUMERIC(18,2) NOT NULL DEFAULT 0,
  skor_minimal  NUMERIC(6,2)  NOT NULL DEFAULT 3,
  pembagi       NUMERIC(6,2)  NOT NULL DEFAULT 5,
  aktif         BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (alias, produk)
);

CREATE INDEX IF NOT EXISTS idx_pagu_aktif ON insentif_pagu (alias, produk) WHERE aktif;

-- ---------------------------------------------------------------------
-- 3. BARIS INSENTIF DARI API
--    Sama seperti kpi_row: baris dari Excel dan dari API menumpuk di satu
--    tabel, dibedakan kolom `sumber`, supaya halaman yang sudah ada tetap
--    membaca dari satu tempat.
-- ---------------------------------------------------------------------
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'excel';
ALTER TABLE insentif_row DROP CONSTRAINT IF EXISTS ck_insentif_sumber;
ALTER TABLE insentif_row ADD CONSTRAINT ck_insentif_sumber
  CHECK (sumber IN ('excel','api'));
ALTER TABLE insentif_row ALTER COLUMN batch_id DROP NOT NULL;

ALTER TABLE insentif_row DROP CONSTRAINT IF EXISTS ck_insentif_batch_sumber;
ALTER TABLE insentif_row ADD CONSTRAINT ck_insentif_batch_sumber
  CHECK ((sumber = 'api' AND batch_id IS NULL) OR (sumber = 'excel' AND batch_id IS NOT NULL));

ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS skor_insentif  NUMERIC(6,2);
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS dihitung_pada  TIMESTAMPTZ;

-- Baris API selalu punya produk; lihat alasan yang sama pada kpi_row v5.
ALTER TABLE insentif_row DROP CONSTRAINT IF EXISTS ck_insentif_api_produk;
ALTER TABLE insentif_row ADD CONSTRAINT ck_insentif_api_produk
  CHECK (sumber <> 'api' OR produk IS NOT NULL);

DROP INDEX IF EXISTS uq_insentif_api;
CREATE UNIQUE INDEX uq_insentif_api
  ON insentif_row (nik, periode, produk) WHERE sumber = 'api';

CREATE INDEX IF NOT EXISTS idx_insentif_sumber ON insentif_row (periode, sumber);

CREATE OR REPLACE VIEW v_insentif_aktif AS
SELECT i.*
  FROM insentif_row i
  JOIN import_batch b ON b.id = i.batch_id
 WHERE i.sumber = 'excel' AND b.status = 'published'
UNION ALL
SELECT i.* FROM insentif_row i WHERE i.sumber = 'api';

-- ---------------------------------------------------------------------
-- 4. SKOR TERBOBOT INSENTIF PADA BARIS KPI
--    Disimpan berdampingan dengan skor terbobot KPI supaya keduanya bisa
--    ditelusuri dari baris yang sama — tanpa itu, admin yang memeriksa
--    nominal insentif tidak punya cara melihat indikator mana saja yang
--    membentuknya.
-- ---------------------------------------------------------------------
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS bobot_insentif    NUMERIC(6,2);
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS skor_terbobot_ins NUMERIC(8,2);
