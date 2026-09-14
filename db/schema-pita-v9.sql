-- =====================================================================
-- v9 — PITA TARGET, PERAN INDIKATOR, KELAS CABANG, DAN TIER INSENTIF
--
-- Tiga ambang (KPI 3/4/5) ternyata tidak cukup. Target sebenarnya berupa
-- tabel pita: FC TT misalnya menilai Success Rate TT 1 dalam lima pita
-- bertingkat, dan pitanya bisa berbeda antara produk R2 dan R4. Karena
-- itu target disimpan sebagai baris-baris pita, bukan tiga kolom tetap.
--
-- Selain itu tiap jabatan punya indikator dengan peran berbeda: penentu
-- skor KPI, penentu insentif reguler, penambah reward, pengurang penalty,
-- dan penentu tier. Peran ditaruh pada pendaftaran (jabatan+produk),
-- bukan pada indikatornya, sebab indikator yang sama bisa berperan lain
-- di jabatan lain.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PITA TARGET
--    Batas bawah inklusif, batas atas eksklusif, supaya pita bersambung
--    tanpa celah maupun tumpang tindih. nilai_min NULL berarti terbuka ke
--    bawah, nilai_max NULL terbuka ke atas.
--
--    poin_min dan poin_max memungkinkan nilai di dalam satu pita
--    diinterpolasi, bukan melompat. Bila keduanya sama, pita itu bernilai
--    tetap.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_pita (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id  UUID NOT NULL REFERENCES indikator_target(id) ON DELETE CASCADE,
  urutan     INTEGER NOT NULL DEFAULT 0,
  nilai_min  NUMERIC(18,4),
  nilai_max  NUMERIC(18,4),
  poin_min   NUMERIC(6,2) NOT NULL,
  poin_max   NUMERIC(6,2) NOT NULL,
  UNIQUE (target_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_pita_target ON indikator_pita (target_id, urutan);

ALTER TABLE indikator_pita DROP CONSTRAINT IF EXISTS ck_pita_poin;
ALTER TABLE indikator_pita ADD CONSTRAINT ck_pita_poin
  CHECK (poin_max >= poin_min);

-- ---------------------------------------------------------------------
-- 2. PENCARIAN POIN DARI PITA
--    Ditaruh di basis data, bukan di program, supaya perhitungan massal
--    per periode tetap satu query dan tidak menarik ribuan baris ke Node
--    hanya untuk mencocokkan angka.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION poin_dari_pita(p_target UUID, p_nilai NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE r RECORD;
BEGIN
  IF p_nilai IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO r FROM indikator_pita
   WHERE target_id = p_target
     AND (nilai_min IS NULL OR p_nilai >= nilai_min)
     AND (nilai_max IS NULL OR p_nilai <  nilai_max)
   ORDER BY urutan LIMIT 1;

  -- Nilai di luar semua pita tidak dipaksa jadi nol: NULL menandakan
  -- "belum tercakup aturan", yang perlu terlihat sebagai kekeliruan
  -- penyusunan pita, bukan tersamar sebagai skor terburuk.
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF r.nilai_min IS NULL OR r.nilai_max IS NULL
     OR r.nilai_max = r.nilai_min OR r.poin_max = r.poin_min THEN
    RETURN r.poin_min;
  END IF;

  RETURN ROUND(
    r.poin_min + (p_nilai - r.nilai_min) / (r.nilai_max - r.nilai_min)
                 * (r.poin_max - r.poin_min), 2);
END $$;

-- ---------------------------------------------------------------------
-- 3. PERAN PENDAFTARAN INDIKATOR
--    kpi      : ikut membentuk skor KPI
--    reguler  : ikut membentuk skor insentif reguler
--    reward   : menambah nominal insentif
--    penalty  : mengurangi nominal insentif
--    tier     : menentukan tier, tidak ikut skor mana pun
-- ---------------------------------------------------------------------
ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS peran TEXT NOT NULL DEFAULT 'kpi';
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_peran;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_peran
  CHECK (peran IN ('kpi','reguler','reward','penalty','tier'));

-- Dipakai peran reward dan penalty: besaran efeknya terhadap nominal.
ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS jenis_nilai TEXT;
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_jenis_nilai;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_jenis_nilai
  CHECK (jenis_nilai IS NULL OR jenis_nilai IN ('nominal','persen'));

ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS nilai_efek NUMERIC(18,2);

CREATE INDEX IF NOT EXISTS idx_target_peran ON indikator_target (peran) WHERE aktif;

-- ---------------------------------------------------------------------
-- 4. KELAS CABANG BERPERIODE
--    Disimpan berbaris dengan tanggal mulai berlaku, bukan satu kolom di
--    master cabang. Kalau hanya satu kolom, memperbarui kelas cabang akan
--    ikut mengubah insentif periode lampau yang sudah dibayarkan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cabang_kelas (
  cabang        TEXT NOT NULL,
  berlaku_mulai DATE NOT NULL,
  kelas         TEXT NOT NULL CHECK (kelas IN ('large','medium','small')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cabang, berlaku_mulai)
);

CREATE INDEX IF NOT EXISTS idx_cabang_kelas ON cabang_kelas (cabang, berlaku_mulai DESC);

CREATE OR REPLACE FUNCTION kelas_cabang(p_cabang TEXT, p_periode DATE)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT k.kelas FROM cabang_kelas k
   WHERE norm_wilayah(k.cabang) = norm_wilayah(p_cabang)
     AND k.berlaku_mulai <= p_periode
   ORDER BY k.berlaku_mulai DESC LIMIT 1
$$;

-- ---------------------------------------------------------------------
-- 5. TABEL TIER INSENTIF
--    Mekanisme kedua penentuan nominal: tier (dari indikator berperan
--    'tier') disilangkan dengan kelas cabang. Berbeda sama sekali dari
--    rumus pagu, jadi disimpan terpisah, bukan dipaksakan ke satu bentuk.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insentif_tier (
  alias      TEXT NOT NULL,
  produk     TEXT NOT NULL REFERENCES produk_master(kode) ON UPDATE CASCADE,
  tier       SMALLINT NOT NULL,
  kelas      TEXT NOT NULL CHECK (kelas IN ('large','medium','small')),
  nominal    NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alias, produk, tier, kelas)
);

-- Penanda mekanisme mana yang dipakai satu jabatan+produk.
ALTER TABLE insentif_pagu ADD COLUMN IF NOT EXISTS mekanisme TEXT NOT NULL DEFAULT 'pagu';
ALTER TABLE insentif_pagu DROP CONSTRAINT IF EXISTS ck_pagu_mekanisme;
ALTER TABLE insentif_pagu ADD CONSTRAINT ck_pagu_mekanisme
  CHECK (mekanisme IN ('pagu','tier'));

-- ---------------------------------------------------------------------
-- 6. JEJAK PERHITUNGAN PADA BARIS INSENTIF
--    Nominal akhir saja tidak cukup ditelusuri. Tier, kelas, dan tiga
--    komponen pembentuknya disimpan supaya admin bisa menjelaskan angka
--    kepada yang bertanya tanpa menghitung ulang manual.
-- ---------------------------------------------------------------------
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS tier            SMALLINT;
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS kelas_cabang    TEXT;
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS nominal_dasar   NUMERIC(18,2);
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS nominal_reward  NUMERIC(18,2);
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS nominal_penalty NUMERIC(18,2);

-- ---------------------------------------------------------------------
-- 7. PERAN DAN EFEK DISALIN KE BARIS KPI
--    kpi_row menyalin bobot dan target dari indikator_target saat
--    dihitung (lihat v5), bukan menyambung baliknya tiap dibaca. Peran,
--    jenis nilai, dan besaran efek ikut disalin dengan alasan yang sama —
--    baris reward/penalty butuh ini untuk dijumlahkan tanpa join balik ke
--    pendaftaran indikator saat menghitung nominal insentif.
-- ---------------------------------------------------------------------
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS peran       TEXT;
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS jenis_nilai TEXT;
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS nilai_efek  NUMERIC(18,2);
