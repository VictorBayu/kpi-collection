-- ---------------------------------------------------------------------
-- SUMBER DATA v21 — banyak sumber, didaftarkan dari layar web
--
-- Latar: sampai v20 hanya ada dua sumber dan keduanya TERTANAM DI KODE —
-- 'api' (data_mentah, endpoint tertulis di lib/tarik-api.ts) dan
-- 'pendukung' (data_pendukung, diisi dari Excel). Nama keduanya bahkan
-- dikunci lewat CHECK di mentah_kolom.sumber, jadi API kedua tidak akan
-- bisa didaftarkan tanpa mengubah kode dan menjalankan migrasi baru.
--
-- Migrasi ini memindahkan daftar sumber dari kode ke database:
--
--   1. Tabel sumber_data menjadi registri — satu baris per sumber,
--      lengkap dengan konfigurasi penarikannya untuk sumber jenis 'api'.
--   2. CHECK yang mengunci nama sumber diganti kunci asing ke registri
--      itu, sehingga sumber baru cukup ditambahkan lewat layar admin.
--   3. indikator_def menyimpan sumber tambahan yang dipakainya, supaya
--      pembangun indikator bisa menyaring daftar kolom sesuai sumber.
--
-- Kenapa satu TABEL FISIK per sumber, bukan satu tabel bersama dengan
-- penanda sumber: tiap sumber punya kolom yang berbeda-beda dan
-- ditambahkan admin sewaktu-waktu lewat layar CRUD Kolom API. Satu tabel
-- bersama berarti setiap kolom baru milik satu sumber ikut menempel pada
-- seluruh baris sumber lain — tabel melebar terus dan hampir seluruhnya
-- kosong. Tabel terpisah juga membuat penggabungan tetap satu-lawan-satu
-- lewat nomor kontrak, yang justru sifat yang harus dijaga.
--
-- Tabel fisik untuk sumber BARU dibuat saat sumbernya didaftarkan lewat
-- layar admin (CREATE TABLE data_sumber_<kode>), bukan di sini — sama
-- seperti kolom kustom yang dibuat lewat ALTER TABLE dari layar.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sumber_data (
  kode           TEXT PRIMARY KEY
                 CHECK (kode ~ '^[a-z][a-z0-9_]{1,30}$'),
  nama           TEXT NOT NULL,

  -- 'utama'   : data_mentah, tempat NIK PIC, cabang, dan produk berada.
  --             Selalu ikut dihitung; tidak pernah digabung ke dirinya.
  -- 'api'     : ditarik berkala dari endpoint, digabung ke utama.
  -- 'unggah'  : diisi dari berkas Excel, digabung ke utama.
  jenis          TEXT NOT NULL DEFAULT 'api'
                 CHECK (jenis IN ('utama','api','unggah')),

  -- Nama tabel fisik. Ditulis sistem, tidak pernah dirangkai dari
  -- masukan bebas — nilainya ditempel ke SQL saat menggabung.
  tabel          TEXT NOT NULL
                 CHECK (tabel ~ '^[a-z][a-z0-9_]{1,50}$'),

  -- Kolom penghubung ke data utama. Tetap satu baris per kontrak:
  -- lihat catatan keunikan di v15.
  kunci_gabung   TEXT NOT NULL DEFAULT 'agreement_no'
                 CHECK (kunci_gabung ~ '^[a-z][a-z0-9_]{1,50}$'),

  -- Nama field di respons API yang memuat kunci itu. Sering berbeda dari
  -- nama kolom kita sendiri (mis. "AgreementNo" vs agreement_no), dan
  -- tanpa ini penarikan akan menyimpan seluruh barisnya tanpa kunci —
  -- tersimpan, tapi tidak pernah cocok dengan satu kontrak pun.
  field_kunci    TEXT,

  -- ---- konfigurasi penarikan (hanya untuk jenis = 'api') ----
  url            TEXT,
  metode         TEXT NOT NULL DEFAULT 'GET' CHECK (metode IN ('GET','POST')),
  -- Header tambahan, mis. {"Authorization":"Bearer ..."}. Disimpan JSONB
  -- supaya tiap API bisa punya cara otentikasi sendiri tanpa kolom baru.
  header         JSONB NOT NULL DEFAULT '{}'::jsonb,
  badan          JSONB,

  -- Sebagian API menuntut permintaan per cabang seperti API utama;
  -- sebagian lain mengembalikan semuanya sekaligus.
  per_cabang     BOOLEAN NOT NULL DEFAULT true,
  param_cabang   TEXT DEFAULT 'branch_id',
  param_tanggal  TEXT,
  param_halaman  TEXT DEFAULT 'page',
  param_ukuran   TEXT DEFAULT 'limit',
  ukuran_halaman INTEGER NOT NULL DEFAULT 300
                 CHECK (ukuran_halaman BETWEEN 1 AND 5000),

  -- Jalur ke larik baris di dalam respons, dipisah titik: "data" atau
  -- "result.rows". Kosong berarti responsnya larik di tingkat teratas.
  jalur_data     TEXT DEFAULT 'data',
  jalur_total    TEXT,

  aktif          BOOLEAN NOT NULL DEFAULT true,
  urutan         INTEGER NOT NULL DEFAULT 100,
  keterangan     TEXT,

  -- Jejak penarikan terakhir, supaya layar admin bisa menampilkan
  -- keadaan tiap sumber tanpa tabel riwayat terpisah.
  ditarik_pada   TIMESTAMPTZ,
  baris_terakhir INTEGER,
  galat          TEXT,

  dibuat_pada    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sumber_aktif ON sumber_data (aktif, urutan);

-- ---------------------------------------------------------------------
-- Dua sumber yang sudah ada dipindahkan ke registri apa adanya.
--
-- 'api' diberi jenis 'utama': endpoint-nya masih dijalankan penarik lama
-- (lib/tarik-api.ts) yang tahu seluk-beluk paging dan pemetaan 76 kolom
-- intinya. Yang berubah hanyalah keberadaannya di registri, supaya layar
-- admin bisa menampilkannya sejajar dengan sumber lain.
-- ---------------------------------------------------------------------
INSERT INTO sumber_data (kode, nama, jenis, tabel, kunci_gabung, urutan, keterangan)
VALUES
  ('api', 'API Collection (utama)', 'utama', 'data_mentah', 'agreement_no', 1,
   'Sumber utama. Di sinilah NIK PIC, cabang, dan produk berada, jadi setiap indikator selalu memakainya.'),
  ('pendukung', 'Data Pendukung (Excel)', 'unggah', 'data_pendukung', 'agreement_no', 2,
   'Diisi dari berkas Excel lewat menu Data Pendukung, digabung ke data utama lewat nomor kontrak.')
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- mentah_kolom.sumber: dari daftar terkunci menjadi kunci asing.
--
-- ON UPDATE CASCADE supaya mengganti kode sumber di layar admin ikut
-- memperbaiki seluruh kolom miliknya. Penghapusan sengaja TIDAK cascade:
-- menghapus sumber yang masih punya kolom harus ditolak, bukan diam-diam
-- membuang kolomnya beserta rumus yang memakainya.
-- ---------------------------------------------------------------------
ALTER TABLE mentah_kolom DROP CONSTRAINT IF EXISTS ck_kolom_sumber;

ALTER TABLE mentah_kolom DROP CONSTRAINT IF EXISTS fk_kolom_sumber;
ALTER TABLE mentah_kolom ADD CONSTRAINT fk_kolom_sumber
  FOREIGN KEY (sumber) REFERENCES sumber_data(kode)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- Sumber tambahan yang dipakai satu indikator.
--
-- NULL = indikator hanya memakai data utama. Terisi = kolom dari sumber
-- itu boleh dipakai rumusnya, dan layar pembangun indikator menyaring
-- daftar kolomnya mengikuti pilihan ini.
--
-- Hanya SATU sumber tambahan per indikator, sesuai kesepakatan: rumus
-- yang menggabung tiga tabel sekaligus membuat baris yang tidak
-- berpasangan sangat sulit ditelusuri saat angkanya terlihat ganjil.
-- ---------------------------------------------------------------------
ALTER TABLE indikator_def ADD COLUMN IF NOT EXISTS sumber_kode TEXT;

ALTER TABLE indikator_def DROP CONSTRAINT IF EXISTS fk_indikator_sumber;
ALTER TABLE indikator_def ADD CONSTRAINT fk_indikator_sumber
  FOREIGN KEY (sumber_kode) REFERENCES sumber_data(kode)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Indikator yang sudah ada dan memakai kolom pendukung ditandai
-- sumbernya, supaya layar tidak tiba-tiba menyembunyikan kolom yang
-- selama ini dipakai rumusnya.
UPDATE indikator_def d
   SET sumber_kode = 'pendukung'
 WHERE d.sumber_kode IS NULL
   AND EXISTS (
     SELECT 1
       FROM indikator_komponen k
       LEFT JOIN indikator_syarat s ON s.komponen_id = k.id
       JOIN mentah_kolom m
         ON m.kolom IN (k.kolom, k.pengakuan_kolom, s.kolom)
      WHERE k.indikator_id = d.id
        AND COALESCE(m.sumber,'api') = 'pendukung');

-- Menu baru untuk peran admin.
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_sumber'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;
