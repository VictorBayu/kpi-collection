-- =====================================================================
-- v28 — TARGET TIER (Delq/Coll per periode, kelompok produk, cabang/area)
-- Rancangan: dokumen "Rancangan Menu Target Tiering (Delq)".
-- Jalankan di Neon SEKALI. Aman diulang (IF NOT EXISTS).
-- =====================================================================

-- 1. Grading Cabang: kolom Tier Cabang (1-5), default tier per bucket di
--    template Target Tier dan sumber tier untuk insentif_tier.
ALTER TABLE cabang_kelas
  ADD COLUMN IF NOT EXISTS tier smallint;
ALTER TABLE cabang_kelas DROP CONSTRAINT IF EXISTS ck_cabang_kelas_tier;
ALTER TABLE cabang_kelas ADD CONSTRAINT ck_cabang_kelas_tier
  CHECK (tier IS NULL OR tier BETWEEN 1 AND 5);

-- 2. Tabel target per periode · kelompok produk · cabang/area · bucket.
--    tier_aktif dan t1..t5 dibaca apa adanya dari file unggahan.
--    Sel kosong = NULL (belum berlaku), 0 = target 0 yang sah.
CREATE TABLE IF NOT EXISTS target_tier (
  id               bigserial PRIMARY KEY,
  periode          date NOT NULL CHECK (periode = date_trunc('month', periode)::date),
  kelompok_produk  text NOT NULL CHECK (kelompok_produk IN ('MIX','R2','R4')),
  tipe_lokasi      text NOT NULL CHECK (tipe_lokasi IN ('cabang','area')),
  cabang_atau_area text NOT NULL,
  bucket           text NOT NULL
                     CHECK (bucket IN ('coll1_30','delq0','delq30','delq60','delq90')),
  satuan           text NOT NULL CHECK (satuan IN ('persen','nominal')),
  tier_aktif       smallint CHECK (tier_aktif BETWEEN 1 AND 5),
  t1 numeric, t2 numeric, t3 numeric, t4 numeric, t5 numeric,
  dibuat_oleh      text,
  dibuat_pada      timestamptz NOT NULL DEFAULT now(),
  diubah_pada      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT target_tier_unik
    UNIQUE (periode, kelompok_produk, tipe_lokasi, cabang_atau_area, bucket)
);

CREATE INDEX IF NOT EXISTS idx_target_tier_lookup
  ON target_tier (periode, bucket, kelompok_produk, tipe_lokasi, cabang_atau_area);

-- 3. Create Indicator: sumber target per pendaftaran.
ALTER TABLE indikator_target
  ADD COLUMN IF NOT EXISTS sumber_target text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS target_tier_bucket text,
  ADD COLUMN IF NOT EXISTS mekanisme_target_tier text NOT NULL DEFAULT 'standard';
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_sumber;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_sumber
  CHECK (sumber_target IN ('manual','target_tier'));
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_tier_bucket;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_tier_bucket
  CHECK (target_tier_bucket IS NULL
         OR target_tier_bucket IN ('coll1_30','delq0','delq30','delq60','delq90'));
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_mekanisme_tt;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_mekanisme_tt
  CHECK (mekanisme_target_tier IN ('standard','rasio'));
-- Bersumber Target Tier wajib menunjuk satu bucket.
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_tt_wajib_bucket;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_tt_wajib_bucket
  CHECK (sumber_target = 'manual' OR target_tier_bucket IS NOT NULL);

-- 4. Menu baru. Admin otomatis; peran lain lewat Peran & Hak Akses.
INSERT INTO peran_menu (peran_kode, menu_kode) VALUES ('admin', 'admin_target_tier')
ON CONFLICT DO NOTHING;
