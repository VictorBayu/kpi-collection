-- =====================================================================
-- v5 — MASTER PRODUK DAN PEMETAAN JABATAN → PRODUK
--
-- Sampai sekarang informasi produk hanya menempel pada tulisan jabatan:
-- "FC TT R2" berarti R2, "RE MIX" berarti dua produk sekaligus. Bagi
-- manusia itu terbaca, bagi mesin tidak — tidak ada cara memberi tahu
-- sistem bahwa MIX artinya R2 dan R4 tanpa menebak dari teks.
--
-- Karena itu produk dijadikan data tersendiri, dan hubungan jabatan ke
-- produk dibuat banyak-ke-banyak. Pemetaannya menempel pada ALIAS, bukan
-- jabatan pokok, karena justru alias yang membedakan cakupan produk:
-- "FC TT R2" dan "FC TT R4" sama-sama jabatan pokok "FC TT".
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MASTER PRODUK
--    Dibuat sebagai tabel, bukan teks bebas, supaya "R2" tidak pernah
--    tertulis "r2" atau "R 2" di satu tempat dan gagal dicocokkan di
--    tempat lain.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produk_master (
  kode       TEXT PRIMARY KEY,
  nama       TEXT    NOT NULL,
  urutan     INTEGER NOT NULL DEFAULT 0,
  aktif      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO produk_master (kode, nama, urutan) VALUES
  ('R2', 'Roda 2', 10),
  ('R4', 'Roda 4', 20)
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. JABATAN (ALIAS) → PRODUK
--    Satu baris per pasangan. "RE MIX" punya dua baris; "FC TT R2" satu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jabatan_produk (
  alias      TEXT NOT NULL,
  produk     TEXT NOT NULL REFERENCES produk_master(kode) ON UPDATE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alias, produk)
);

CREATE INDEX IF NOT EXISTS idx_jabprod_produk ON jabatan_produk (produk);

-- ---------------------------------------------------------------------
-- 3. TEBAKAN AWAL DARI NAMA ALIAS
--    Sekali jalan saja, untuk mengisi pemetaan yang sudah jelas dari
--    tulisannya sehingga admin tidak perlu mengisi 50-an baris dari nol.
--    Yang meragukan sengaja dibiarkan kosong agar diisi manual.
--
--    Sumber alias diambil dari dua tempat: tabel jabatan_alias, dan
--    kolom jabatan di app_user yang belum pernah dibuatkan aliasnya.
-- ---------------------------------------------------------------------
WITH semua_alias AS (
  SELECT alias FROM jabatan_alias
  UNION
  SELECT DISTINCT norm_jabatan(jabatan) FROM app_user
   WHERE jabatan IS NOT NULL AND btrim(jabatan) <> ''
),
tebakan AS (
  SELECT a.alias, p.kode AS produk
    FROM semua_alias a
    CROSS JOIN produk_master p
   WHERE (
     -- "MIX" berarti menangani semua produk
     a.alias ~ '(^|[^A-Z])MIX([^A-Z]|$)'
     -- selain itu cocokkan kode produk yang tertulis eksplisit
     OR a.alias ~ ('(^|[^A-Z0-9])' || p.kode || '([^A-Z0-9]|$)')
   )
)
INSERT INTO jabatan_produk (alias, produk)
SELECT alias, produk FROM tebakan
ON CONFLICT (alias, produk) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. TAMPILAN BANTU
--    Produk efektif tiap pengguna. Dipakai mesin hitung untuk menentukan
--    indikator mana yang berlaku bagi seseorang. Pengguna berjabatan MIX
--    muncul beberapa kali di sini — satu baris per produk — dan itu
--    memang yang diinginkan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_produk AS
SELECT u.nik,
       u.nama,
       u.cabang,
       u.area,
       norm_jabatan(u.jabatan) AS alias,
       jp.produk
  FROM app_user u
  JOIN jabatan_produk jp ON jp.alias = norm_jabatan(u.jabatan)
 WHERE u.aktif;
