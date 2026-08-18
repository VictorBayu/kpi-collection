-- =====================================================================
-- v5 — PEMBANGUN INDIKATOR
--
-- Admin merakit rumus dari kartu, bukan menulis SQL. Satu indikator
-- terdiri dari beberapa komponen berurutan; tiap komponen adalah satu
-- agregasi (SUM/COUNT/AVG) atas satu kolom data mentah dengan sejumlah
-- syarat penyaring. Antar komponen dihubungkan operator matematika.
--
--   Success Rate Tagihan Turun
--     komponen 1  SUM outstanding_principal  WHERE product_id = 'R2 SR TT 1'
--     operator    ÷
--     komponen 2  SUM outstanding_principal  WHERE product_id = 'R2 Tagihan Turun'
--     kali 100    → persen
--
-- Bentuknya sengaja dibuat rata: komponen dijalankan berurutan dari
-- atas ke bawah, tanpa kurung dan tanpa saling merujuk antar indikator.
-- Rumus bercabang akan menuntut penelusuran ketergantungan dan deteksi
-- perulangan, dan tidak ada indikator yang membutuhkannya.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DEFINISI INDIKATOR
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_def (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama         TEXT NOT NULL UNIQUE,
  deskripsi    TEXT,
  satuan       TEXT NOT NULL DEFAULT 'rupiah'
               CHECK (satuan IN ('rupiah','persen','unit')),
  -- Rasio disimpan apa adanya (0.78); tanda ini hanya mengatur tampilan
  -- dan pembandingan target, bukan mengubah nilai tersimpan.
  kali_seratus BOOLEAN NOT NULL DEFAULT FALSE,
  -- Baris data mentah dikelompokkan ke siapa: staf pelaksana, atasan
  -- langsung, atau kepala cabang. Kolom *_pic yang berbeda.
  peran_pic    TEXT NOT NULL DEFAULT 'staff'
               CHECK (peran_pic IN ('staff','spv','bch')),
  aktif        BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. KOMPONEN (KARTU)
--    `operator_sebelum` kosong pada kartu pertama, berisi + - * / pada
--    kartu berikutnya. Urutan kartu menentukan urutan hitung.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_komponen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indikator_id     UUID NOT NULL REFERENCES indikator_def(id) ON DELETE CASCADE,
  urutan           INTEGER NOT NULL DEFAULT 0,
  label            TEXT,
  agregat          TEXT NOT NULL DEFAULT 'SUM'
                   CHECK (agregat IN ('SUM','COUNT','COUNT_DISTINCT','AVG','MIN','MAX')),
  -- Kolom sumber. Wajib terdaftar di mentah_kolom; itulah daftar putih
  -- yang membuat penerjemah rumus tidak bisa menyisipkan nama sembarangan.
  kolom            TEXT REFERENCES mentah_kolom(kolom) ON UPDATE CASCADE,
  operator_sebelum TEXT CHECK (operator_sebelum IN ('+','-','*','/')),
  -- Semua/salah satu syarat harus terpenuhi.
  gabung_syarat    TEXT NOT NULL DEFAULT 'dan' CHECK (gabung_syarat IN ('dan','atau')),
  UNIQUE (indikator_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_komponen_ind ON indikator_komponen (indikator_id, urutan);

-- COUNT boleh tanpa kolom (menghitung baris); agregat lain wajib berkolom.
ALTER TABLE indikator_komponen DROP CONSTRAINT IF EXISTS ck_komponen_kolom;
ALTER TABLE indikator_komponen ADD CONSTRAINT ck_komponen_kolom
  CHECK (agregat = 'COUNT' OR kolom IS NOT NULL);

-- ---------------------------------------------------------------------
-- 3. SYARAT PENYARING TIAP KOMPONEN
--    `nilai` selalu larik, walau operatornya cuma butuh satu isi. Ini
--    yang membuat "termasuk salah satu dari" — misal OD Movement bernilai
--    Out NPF, BTC, Tarik, atau Lunas — tidak butuh bentuk penyimpanan
--    yang berbeda dari "sama dengan".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_syarat (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  komponen_id  UUID NOT NULL REFERENCES indikator_komponen(id) ON DELETE CASCADE,
  urutan       INTEGER NOT NULL DEFAULT 0,
  kolom        TEXT NOT NULL REFERENCES mentah_kolom(kolom) ON UPDATE CASCADE,
  operator     TEXT NOT NULL
               CHECK (operator IN ('sama','tidak_sama','termasuk','tidak_termasuk',
                                   'mengandung','lebih','lebih_sama','kurang','kurang_sama',
                                   'antara','kosong','terisi')),
  nilai        TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_syarat_komponen ON indikator_syarat (komponen_id, urutan);

-- ---------------------------------------------------------------------
-- 4. PENDAFTARAN KE JABATAN + PRODUK
--    Indikator berlaku bagi pasangan jabatan-dan-produk, bukan jabatan
--    saja. Pemegang jabatan MIX terdaftar di dua produk, sehingga
--    mendapat gabungan indikator keduanya tanpa perlu didaftarkan dua
--    kali secara manual.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indikator_target (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indikator_id UUID NOT NULL REFERENCES indikator_def(id) ON DELETE CASCADE,
  alias        TEXT NOT NULL,                    -- jabatan_alias.alias
  produk       TEXT NOT NULL REFERENCES produk_master(kode) ON UPDATE CASCADE,
  bobot        NUMERIC(6,2),
  target_kpi3  NUMERIC(18,4),
  target_kpi4  NUMERIC(18,4),
  target_kpi5  NUMERIC(18,4),
  aktif        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indikator_id, alias, produk)
);

CREATE INDEX IF NOT EXISTS idx_indtarget_alias ON indikator_target (alias, produk) WHERE aktif;

-- ---------------------------------------------------------------------
-- 5. HASIL KPI DARI API HIDUP BERDAMPINGAN DENGAN YANG DARI EXCEL
--
--    Periode lalu tetap berasal dari unggahan Excel, periode berjalan
--    dihitung dari data mentah. Keduanya menumpuk di kpi_row supaya
--    seluruh halaman yang sudah ada — dasbor, tim, detail, insentif —
--    tetap membaca dari satu tempat dan tidak perlu tahu bedanya.
--
--    Yang membedakan hanya kolom `sumber`. Baris dari API tidak punya
--    batch unggahan, jadi batch_id-nya dibolehkan kosong.
-- ---------------------------------------------------------------------
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'excel';
ALTER TABLE kpi_row DROP CONSTRAINT IF EXISTS ck_kpi_sumber;
ALTER TABLE kpi_row ADD CONSTRAINT ck_kpi_sumber CHECK (sumber IN ('excel','api'));
ALTER TABLE kpi_row ALTER COLUMN batch_id DROP NOT NULL;

-- Baris API harus tanpa batch, baris Excel harus punya batch.
ALTER TABLE kpi_row DROP CONSTRAINT IF EXISTS ck_kpi_batch_sumber;
ALTER TABLE kpi_row ADD CONSTRAINT ck_kpi_batch_sumber
  CHECK ((sumber = 'api' AND batch_id IS NULL) OR (sumber = 'excel' AND batch_id IS NOT NULL));

ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS indikator_id UUID REFERENCES indikator_def(id) ON DELETE SET NULL;
ALTER TABLE kpi_row ADD COLUMN IF NOT EXISTS dihitung_pada TIMESTAMPTZ;

-- Baris API selalu punya produk. Selain karena memang selalu terisi,
-- ini juga yang membuat indeks unik di bawah bekerja: kolom NULL dianggap
-- tidak sama dengan NULL lain, sehingga produk kosong akan lolos dari
-- pemeriksaan duplikat dan baris menumpuk tiap penghitungan ulang.
ALTER TABLE kpi_row DROP CONSTRAINT IF EXISTS ck_kpi_api_produk;
ALTER TABLE kpi_row ADD CONSTRAINT ck_kpi_api_produk
  CHECK (sumber <> 'api' OR produk IS NOT NULL);

-- Satu indikator hanya boleh punya satu baris per orang per produk per
-- periode, supaya penghitungan ulang menimpa dan tidak menumpuk.
--
-- Produk ikut menjadi kunci karena pemegang jabatan MIX menerima indikator
-- yang sama untuk dua produk sekaligus, dan keduanya adalah baris yang
-- berbeda dengan target dan pencapaian masing-masing.
--
-- Versi lama indeks ini dibuang lebih dulu: bentuknya berubah, dan
-- CREATE INDEX IF NOT EXISTS tidak akan memperbaiki indeks yang sudah
-- terlanjur ada dengan susunan kolom yang berbeda.
DROP INDEX IF EXISTS uq_kpi_api;
CREATE UNIQUE INDEX uq_kpi_api
  ON kpi_row (nik, periode, indikator_id, produk) WHERE sumber = 'api';

CREATE INDEX IF NOT EXISTS idx_kpi_sumber ON kpi_row (periode, sumber);

-- Tampilan aktif diperluas: baris Excel tetap harus lewat batch yang
-- sudah diterbitkan, baris API langsung dianggap aktif karena tidak
-- melewati proses tinjau-lalu-terbitkan.
CREATE OR REPLACE VIEW v_kpi_aktif AS
SELECT k.*
  FROM kpi_row k
  JOIN import_batch b ON b.id = k.batch_id
 WHERE k.sumber = 'excel' AND b.status = 'published'
UNION ALL
SELECT k.* FROM kpi_row k WHERE k.sumber = 'api';

-- ---------------------------------------------------------------------
-- 6. PERIODE YANG TERSEDIA
--    Pemilih periode di seluruh aplikasi membaca import_batch, jadi
--    periode yang hanya berisi data API tidak akan pernah muncul di
--    sana. Tampilan ini menyatukan keduanya.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_periode_tersedia AS
SELECT b.periode,
       'excel'::TEXT       AS sumber,
       b.diterbitkan_pada  AS diperbarui,
       b.nama_file,
       b.baris_valid       AS total
  FROM import_batch b
 WHERE b.tipe = 'kpi' AND b.status = 'published'
UNION ALL
SELECT k.periode,
       'api'::TEXT,
       MAX(k.dihitung_pada),
       'Dihitung dari API'::TEXT,
       COUNT(*)::INTEGER
  FROM kpi_row k
 WHERE k.sumber = 'api'
 GROUP BY k.periode;
