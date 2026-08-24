-- =====================================================================
-- v11 — NOMINAL DATAR BERSYARAT ("komponen di dalam komponen")
--
-- Bentuk skema yang belum tertampung sebelumnya:
--
--   Flow 1 Angsuran ke 1-6 R2
--     Target Flowrate 1 < 4,5 %          <- gerbang atas indikator sendiri
--     Bahan kerja minimal 5 kontrak      <- gerbang atas indikator lain
--     Bahan > 100 JT  -> Rp 750.000      <- pita nominal
--     Bahan <= 100 JT -> Rp 500.000
--
-- Tiga hal di situ tidak ada padanannya di v9/v10:
--
--   1. Nominalnya DATAR, bukan sebanding skor. Mekanisme 'pagu'
--      (skor / pembagi * pagu) selalu menghasilkan angka proporsional,
--      jadi tidak bisa dipakai.
--   2. Nominal dipilih oleh VARIABEL LAIN (rupiah bahan kerja) milik
--      orang itu sendiri — bukan oleh kelas cabang seperti 'tier'.
--   3. Ada GERBANG kelayakan: gagal satu saja, nominalnya nol, bukan
--      sekadar mengecil.
--
-- Karena itu yang ditambahkan bukan satu kolom, melainkan tiga bagian
-- yang saling melengkapi: daftar gerbang, pita nominal, dan penunjuk
-- indikator mana yang memilih pita.
--
-- Jumlah kontrak tidak perlu kolom baru di data mentah: data mentahnya
-- satu baris per kontrak, jadi COUNT baris — yang sudah didukung
-- indikator_komponen sejak v5 — sudah menjawabnya.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DUA PERAN BARU
--
--    'nominal'   baris ini menghasilkan nominal datar bersyarat.
--    'pendukung' baris ini dihitung dan disimpan, tapi tidak menyumbang
--                skor apa pun — keberadaannya semata supaya angkanya
--                bisa dipakai gerbang atau pemilih pita. Tanpa peran
--                ini, "jumlah kontrak" terpaksa didaftarkan sebagai KPI
--                dan ikut mengotori skor orangnya.
-- ---------------------------------------------------------------------
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_peran;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_peran
  CHECK (peran IN ('kpi','reguler','reward','penalty','tier','nominal','pendukung'));

-- Indikator yang nilainya memilih pita nominal (mis. rupiah bahan kerja).
-- Kosong berarti pitanya dipilih oleh nilai indikator ini sendiri.
--
-- Sengaja RESTRICT, bukan SET NULL. Kalau indikator pemilih dihapus dan
-- kolom ini diam-diam jadi kosong, pita berpindah mencocokkan nilai
-- indikator ini sendiri — nominalnya tetap keluar, hanya saja salah, dan
-- tidak ada yang tahu. Lebih baik penghapusannya ditolak.
ALTER TABLE indikator_target
  ADD COLUMN IF NOT EXISTS pemilih_id UUID;
ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS fk_target_pemilih;
ALTER TABLE indikator_target ADD CONSTRAINT fk_target_pemilih
  FOREIGN KEY (pemilih_id) REFERENCES indikator_def(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 2. PITA NOMINAL
--
--    Sengaja tabel tersendiri, bukan menumpang indikator_pita. Pita di
--    sana memetakan nilai ke POIN 1–5 dan diinterpolasi lurus di
--    antaranya; pita di sini memetakan nilai ke RUPIAH dan justru tidak
--    boleh diinterpolasi — bahan kerja 150 JT dapat 750.000 penuh, bukan
--    750.000 dikurangi sekian karena belum mencapai 200 JT.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_nominal (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id  UUID NOT NULL REFERENCES indikator_target(id) ON DELETE CASCADE,
  urutan     INTEGER NOT NULL DEFAULT 0,
  -- Batas kosong berarti tak terhingga ke arah itu.
  nilai_min  NUMERIC(18,4),
  nilai_max  NUMERIC(18,4),
  nominal    NUMERIC(18,2) NOT NULL,
  UNIQUE (target_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_nominal_target ON indikator_nominal (target_id, urutan);

ALTER TABLE indikator_nominal DROP CONSTRAINT IF EXISTS ck_nominal_batas;
ALTER TABLE indikator_nominal ADD CONSTRAINT ck_nominal_batas
  CHECK (nilai_min IS NULL OR nilai_max IS NULL OR nilai_max >= nilai_min);

-- ---------------------------------------------------------------------
-- 3. GERBANG KELAYAKAN
--
--    `sumber_id` kosong berarti gerbang diuji pada nilai indikator ini
--    sendiri — itulah cara "Flowrate < 4,5%" ditulis tanpa perlu
--    indikator bantu. Diisi berarti diuji pada indikator lain milik
--    orang dan produk yang sama, misalnya jumlah kontrak.
--
--    Nama tabelnya indikator_gerbang, bukan indikator_syarat: yang
--    terakhir sudah dipakai v5 untuk menyaring BARIS data mentah di
--    dalam satu komponen. Yang ini menyaring ORANG dari kelayakan
--    menerima nominal. Beda lapisan, beda tabel.
-- ---------------------------------------------------------------------
--    `sumber_id` memakai RESTRICT, bukan CASCADE. Menghapus indikator
--    "Jumlah Kontrak" tidak boleh diam-diam melenyapkan gerbang yang
--    memakainya — kalau itu terjadi, syaratnya hilang dan nominal mulai
--    cair tanpa penahan, tepat kesalahan yang gerbang ini ada untuk
--    mencegah. Penghapusan ditolak sampai gerbangnya dilepas dulu.
CREATE TABLE IF NOT EXISTS indikator_gerbang (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id  UUID NOT NULL REFERENCES indikator_target(id) ON DELETE CASCADE,
  urutan     INTEGER NOT NULL DEFAULT 0,
  label      TEXT,
  sumber_id  UUID REFERENCES indikator_def(id) ON DELETE RESTRICT,
  operator   TEXT NOT NULL
             CHECK (operator IN ('lebih','lebih_sama','kurang','kurang_sama','sama')),
  nilai      NUMERIC(18,4) NOT NULL,
  UNIQUE (target_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_gerbang_target ON indikator_gerbang (target_id, urutan);

-- Ditulis ulang secara eksplisit supaya pemasangan yang terlanjur memakai
-- CASCADE (dari draf v11 sebelumnya) ikut terkoreksi saat berkas ini
-- dijalankan ulang — CREATE TABLE IF NOT EXISTS tidak menyentuh tabel
-- yang sudah ada.
ALTER TABLE indikator_gerbang DROP CONSTRAINT IF EXISTS indikator_gerbang_sumber_id_fkey;
ALTER TABLE indikator_gerbang DROP CONSTRAINT IF EXISTS fk_gerbang_sumber;
ALTER TABLE indikator_gerbang ADD CONSTRAINT fk_gerbang_sumber
  FOREIGN KEY (sumber_id) REFERENCES indikator_def(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 4. PENCARIAN NOMINAL DARI PITA
--
--    Pita pertama yang memuat nilai dipakai — tanpa interpolasi. Kalau
--    tidak ada yang memuat, hasilnya 0, bukan NULL: orangnya memang
--    tidak masuk pita mana pun, dan itu keputusan yang sah, bukan data
--    yang hilang.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nominal_dari_pita(p_target UUID, p_nilai NUMERIC)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT n.nominal FROM indikator_nominal n
     WHERE n.target_id = p_target
       AND p_nilai IS NOT NULL
       AND (n.nilai_min IS NULL OR p_nilai >= n.nilai_min)
       AND (n.nilai_max IS NULL OR p_nilai <  n.nilai_max)
     ORDER BY n.urutan
     LIMIT 1
  ), 0)
$$;

-- ---------------------------------------------------------------------
-- 5. HASIL PENILAIAN GERBANG DISIMPAN DI BARISNYA
--
--    Nominal per baris dihitung sekali seusai semua indikator selesai,
--    lalu ditulis balik ke kpi_row. Alternatifnya — menghitung gerbang
--    di dalam kueri insentif — memaksa kueri itu menjangkau baris
--    indikator lain milik orang yang sama, dan membuatnya jauh lebih
--    sulit ditelusuri saat angkanya dipertanyakan.
--
--    `gerbang_gagal` menyimpan alasan dalam bahasa manusia. Nominal nol
--    tanpa penjelasan adalah keluhan yang pasti datang; jawabannya
--    sebaiknya sudah tersimpan sejak angkanya dihitung.
-- ---------------------------------------------------------------------
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS nominal_baris NUMERIC(18,2);
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS gerbang_gagal TEXT;

-- ---------------------------------------------------------------------
-- 6. MEKANISME KETIGA
-- ---------------------------------------------------------------------
ALTER TABLE insentif_pagu DROP CONSTRAINT IF EXISTS ck_pagu_mekanisme;
ALTER TABLE insentif_pagu ADD CONSTRAINT ck_pagu_mekanisme
  CHECK (mekanisme IN ('pagu','tier','bersyarat'));

-- ---------------------------------------------------------------------
-- 7. BANGUN ULANG TAMPILAN
--
--    Postgres membekukan daftar kolom sebuah view saat view dibuat,
--    walau ditulis SELECT *. Kolom nominal_baris dan gerbang_gagal di
--    atas karena itu tidak akan pernah terlihat lewat v_kpi_aktif kalau
--    tampilannya tidak dibuat ulang — gejalanya sunyi dan menyesatkan:
--    kueri berkata kolomnya tidak ada, padahal tabelnya jelas punya.
--    Kekeliruan yang sama sudah pernah terjadi pada v_insentif_aktif.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_kpi_aktif;
CREATE VIEW v_kpi_aktif AS
SELECT k.*
  FROM kpi_row k
  JOIN import_batch b ON b.id = k.batch_id
 WHERE k.sumber = 'excel' AND b.status = 'published'
UNION ALL
SELECT k.* FROM kpi_row k WHERE k.sumber = 'api';
