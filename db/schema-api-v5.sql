-- =====================================================================
-- v5 — DATA MENTAH DARI API COLLECTION
--
-- Data ditarik berkala dari API, bukan dipanggil langsung saat halaman
-- dibuka. Tiga alasan: API pihak lain bisa lambat atau mati dan halaman
-- tidak boleh ikut mati; agregasi ratusan ribu baris harus dikerjakan
-- database, bukan Node; dan angka periode berjalan perlu tetap ada
-- walau tarikan berikutnya gagal.
--
-- Aturan penimpaan: SEMUA ATAU TIDAK SAMA SEKALI. Data baru masuk ke
-- meja sementara (staging) dulu. Hanya kalau seluruh cabang dan seluruh
-- halamannya berhasil terambil, isinya dipindah ke tabel resmi dalam
-- satu transaksi. Kalau satu saja gagal, staging dibuang dan tabel
-- resmi tidak tersentuh — jadi tidak pernah ada keadaan setengah lama
-- setengah baru.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MASTER KODE CABANG API
--    BranchID yang dipakai API tidak sama dengan nama cabang di app_user
--    ("451" vs "MANADO"), jadi perlu tabel pemetaannya sendiri. Tabel ini
--    juga yang menjadi daftar putaran saat penarikan: hanya baris aktif
--    yang ditarik.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cabang_api (
  branch_id  TEXT PRIMARY KEY,
  cabang     TEXT NOT NULL,            -- disamakan dengan app_user.cabang
  area       TEXT,
  aktif      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cabang_api (branch_id, cabang, area) VALUES
  ('451', 'MANADO', 'AREA SULUT-TENG-GO')
ON CONFLICT (branch_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. DATA MENTAH
--    Kolom yang dipakai indikator ditulis eksplisit supaya bisa diindeks
--    dan diagregasi cepat. Sisanya disimpan apa adanya di kolom `lain`
--    agar perubahan bentuk respons API tidak merusak penarikan.
--
--    Kolom NIK diturunkan otomatis dari kolom *_pic. API menuliskannya
--    sebagai "20230633 - RIZAL STEVANUS LEMPAS (FC TT R2)"; yang
--    dibutuhkan untuk menghubungkan ke app_user hanya angka di depan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_mentah (
  id                    BIGSERIAL PRIMARY KEY,

  -- identitas baris
  branch_id             TEXT        NOT NULL,
  rym                   TEXT,                     -- '202608'
  agreement_no          TEXT        NOT NULL,
  application_id        TEXT,
  customers_id          TEXT,
  full_name             TEXT,
  branch_full_name      TEXT,
  area_full_name        TEXT,

  -- produk
  product               TEXT,
  product_id            TEXT,
  detail_produk         TEXT,
  model                 TEXT,
  is_syariah            SMALLINT,

  -- penanggung jawab (mentah dari API)
  staff_pic             TEXT,
  spv_pic               TEXT,
  bch_pic               TEXT,

  -- NIK hasil penguraian; inilah yang dipakai mengelompokkan per orang
  nik_staff             TEXT GENERATED ALWAYS AS
                          (NULLIF(btrim(split_part(staff_pic, ' - ', 1)), '')) STORED,
  nik_spv               TEXT GENERATED ALWAYS AS
                          (NULLIF(btrim(split_part(spv_pic, ' - ', 1)), '')) STORED,
  nik_bch               TEXT GENERATED ALWAYS AS
                          (NULLIF(btrim(split_part(bch_pic, ' - ', 1)), '')) STORED,

  -- nilai uang
  outstanding_principal NUMERIC(18,2),
  saldo_pokok_harian    NUMERIC(18,2),
  principal_amount      NUMERIC(18,2),
  interest_amount       NUMERIC(18,2),
  saldo_bunga           NUMERIC(18,2),
  installment_amount    NUMERIC(18,2),
  late_charge_amount    NUMERIC(18,2),
  amount_tobe_paid      NUMERIC(18,2),
  exposure              NUMERIC(18,2),
  contract_prepaid      NUMERIC(18,2),

  -- bucket dan pergerakan tunggakan
  bucket_harian         TEXT,
  bucket_awal_bulan     TEXT,
  bucket_wiltag         TEXT,
  od_movement           TEXT,
  odm1                  TEXT,
  flagging_flow         TEXT,
  flagging_kuadran      TEXT,
  flagging_sp           TEXT,
  flagging_ro           TEXT,
  btc_flag              TEXT,
  kategori_bayar        TEXT,

  -- status kontrak dan aset
  contract_status_awal  TEXT,
  contract_status_hari  TEXT,
  status_asset_awal     TEXT,
  status_asset_harian   TEXT,
  status_wo_awal        TEXT,
  status_wo_harian      TEXT,

  -- hari tunggakan dan angsuran
  ovd_days              INTEGER,
  ovd_awal_bulan        INTEGER,
  ovd_max               INTEGER,
  max_ovd1              INTEGER,
  tenor                 INTEGER,
  sisa_angke            INTEGER,
  angke_harian          INTEGER,
  angke_awal_bulan      INTEGER,

  -- aktivitas penagihan
  total_assign          INTEGER,
  total_visit           INTEGER,
  total_ptp             INTEGER,
  total_pelacakan       INTEGER,
  total_interaksi       INTEGER,
  hasil_aktifitas       TEXT,
  tipe_aktifitas        TEXT,

  -- wilayah tagih
  area_tagih            TEXT,
  kd_wilayah            TEXT,
  kode_sub_pos          TEXT,
  debtor_city           TEXT,

  -- tanggal penting
  due_date_harian       DATE,
  due_date_awal_bulan   DATE,
  ptp_date              DATE,
  tgl_bayar_pertama     DATE,
  tgl_bayar_akhir_ini   DATE,
  tgl_bayar_akhir_lalu  DATE,
  tgl_cair              DATE,
  tanggal_aktifitas     DATE,
  tgl_flow              DATE,

  -- sisa respons API apa adanya, untuk field yang belum dipakai indikator
  lain                  JSONB,

  ditarik_pada          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pengelompokan indikator hampir selalu per orang; ini indeks utamanya.
CREATE INDEX IF NOT EXISTS idx_mentah_staff  ON data_mentah (nik_staff);
CREATE INDEX IF NOT EXISTS idx_mentah_spv    ON data_mentah (nik_spv);
CREATE INDEX IF NOT EXISTS idx_mentah_bch    ON data_mentah (nik_bch);
CREATE INDEX IF NOT EXISTS idx_mentah_cabang ON data_mentah (branch_id);
CREATE INDEX IF NOT EXISTS idx_mentah_produk ON data_mentah (product_id);
-- Syarat indikator paling sering menyaring dua kolom ini bersamaan.
CREATE INDEX IF NOT EXISTS idx_mentah_bucket ON data_mentah (bucket_awal_bulan, od_movement);

-- Meja sementara: bentuknya persis sama, isinya dibuang tiap tarikan.
CREATE TABLE IF NOT EXISTS data_mentah_staging (LIKE data_mentah INCLUDING DEFAULTS);

-- ---------------------------------------------------------------------
-- 3. RIWAYAT PENARIKAN
--    Dicatat baik berhasil maupun gagal. Yang gagal justru yang penting:
--    tanpa catatan ini, tarikan yang diam-diam berhenti seminggu tidak
--    akan ketahuan sampai ada yang curiga angkanya tidak berubah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarik_status (
  id             BIGSERIAL PRIMARY KEY,
  mulai          TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai        TIMESTAMPTZ,
  berhasil       BOOLEAN     NOT NULL DEFAULT FALSE,
  tanggal_loc    DATE,                       -- parameter TanggalLoc yang dipakai
  cabang_diminta INTEGER     NOT NULL DEFAULT 0,
  cabang_sukses  INTEGER     NOT NULL DEFAULT 0,
  cabang_gagal   TEXT[],
  jumlah_baris   INTEGER     NOT NULL DEFAULT 0,
  durasi_ms      INTEGER,
  pesan          TEXT,
  dipicu_oleh    TEXT        NOT NULL DEFAULT 'cron'
                 CHECK (dipicu_oleh IN ('cron','manual'))
);

CREATE INDEX IF NOT EXISTS idx_tarik_waktu ON tarik_status (mulai DESC);

-- ---------------------------------------------------------------------
-- 4. KATALOG KOLOM UNTUK PEMBANGUN INDIKATOR
--    Daftar putih: hanya kolom yang terdaftar di sini boleh dipakai di
--    rumus indikator. Ini yang menjaga penerjemah rumus tidak pernah
--    menyisipkan nama kolom sembarangan ke dalam SQL.
--
--    `jenis` menentukan operator apa yang ditawarkan UI, dan `agregat`
--    menandai kolom yang boleh dijumlahkan (bukan sekadar disaring).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentah_kolom (
  kolom    TEXT PRIMARY KEY,
  label    TEXT    NOT NULL,
  jenis    TEXT    NOT NULL CHECK (jenis IN ('angka','teks','tanggal')),
  agregat  BOOLEAN NOT NULL DEFAULT FALSE,   -- boleh jadi bahan SUM/AVG
  kelompok TEXT,                             -- untuk pengelompokan di dropdown
  urutan   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO mentah_kolom (kolom, label, jenis, agregat, kelompok, urutan) VALUES
  ('outstanding_principal','Outstanding Principal','angka',TRUE,'Nilai',10),
  ('saldo_pokok_harian','Saldo Pokok Harian','angka',TRUE,'Nilai',20),
  ('principal_amount','Principal Amount','angka',TRUE,'Nilai',30),
  ('interest_amount','Interest Amount','angka',TRUE,'Nilai',40),
  ('saldo_bunga','Saldo Bunga','angka',TRUE,'Nilai',50),
  ('installment_amount','Installment Amount','angka',TRUE,'Nilai',60),
  ('late_charge_amount','Late Charge Amount','angka',TRUE,'Nilai',70),
  ('amount_tobe_paid','Amount To Be Paid','angka',TRUE,'Nilai',80),
  ('exposure','Exposure','angka',TRUE,'Nilai',90),

  ('bucket_awal_bulan','Bucket Awal Bulan','teks',FALSE,'Bucket',110),
  ('bucket_harian','Bucket Harian','teks',FALSE,'Bucket',120),
  ('bucket_wiltag','Bucket Wiltag','teks',FALSE,'Bucket',130),
  ('od_movement','OD Movement','teks',FALSE,'Bucket',140),
  ('odm1','ODM 1','teks',FALSE,'Bucket',150),
  ('flagging_flow','Flagging Flow','teks',FALSE,'Bucket',160),
  ('flagging_kuadran','Flagging Kuadran','teks',FALSE,'Bucket',170),
  ('flagging_sp','Flagging SP','teks',FALSE,'Bucket',180),
  ('btc_flag','BTC Flag','teks',FALSE,'Bucket',190),
  ('kategori_bayar','Kategori Bayar','teks',FALSE,'Bucket',200),

  ('product','Product','teks',FALSE,'Produk',210),
  ('product_id','Product ID','teks',FALSE,'Produk',220),
  ('detail_produk','Detail Produk','teks',FALSE,'Produk',230),

  ('contract_status_awal','Contract Status Awal Bulan','teks',FALSE,'Status',310),
  ('contract_status_hari','Contract Status Harian','teks',FALSE,'Status',320),
  ('status_asset_awal','Status Asset Awal Bulan','teks',FALSE,'Status',330),
  ('status_asset_harian','Status Asset Harian','teks',FALSE,'Status',340),
  ('status_wo_awal','Status WO Awal Bulan','teks',FALSE,'Status',350),
  ('status_wo_harian','Status WO Harian','teks',FALSE,'Status',360),

  ('ovd_days','OVD Days','angka',TRUE,'Tunggakan',410),
  ('ovd_awal_bulan','OVD Awal Bulan','angka',TRUE,'Tunggakan',420),
  ('ovd_max','OVD Max','angka',TRUE,'Tunggakan',430),
  ('tenor','Tenor','angka',TRUE,'Tunggakan',440),
  ('sisa_angke','Sisa Angsuran','angka',TRUE,'Tunggakan',450),
  ('angke_harian','Angsuran Harian','angka',TRUE,'Tunggakan',460),
  ('angke_awal_bulan','Angsuran Awal Bulan','angka',TRUE,'Tunggakan',470),

  ('total_assign','Total Assign','angka',TRUE,'Aktivitas',510),
  ('total_visit','Total Visit','angka',TRUE,'Aktivitas',520),
  ('total_ptp','Total PTP','angka',TRUE,'Aktivitas',530),
  ('total_pelacakan','Total Pelacakan','angka',TRUE,'Aktivitas',540),
  ('total_interaksi','Total Interaksi','angka',TRUE,'Aktivitas',550),
  ('hasil_aktifitas','Hasil Aktivitas Terakhir','teks',FALSE,'Aktivitas',560),

  ('agreement_no','Agreement No','teks',FALSE,'Identitas',610),
  ('branch_id','Branch ID','teks',FALSE,'Identitas',620),
  ('area_tagih','Area Tagih','teks',FALSE,'Identitas',630),
  ('debtor_city','Kota Debitur','teks',FALSE,'Identitas',640),

  ('due_date_harian','Due Date Harian','tanggal',FALSE,'Tanggal',710),
  ('due_date_awal_bulan','Due Date Awal Bulan','tanggal',FALSE,'Tanggal',720),
  ('ptp_date','Tanggal PTP','tanggal',FALSE,'Tanggal',730),
  ('tgl_bayar_pertama','Tanggal Bayar Pertama','tanggal',FALSE,'Tanggal',740),
  ('tgl_cair','Tanggal Cair','tanggal',FALSE,'Tanggal',750)
ON CONFLICT (kolom) DO UPDATE
  SET label = EXCLUDED.label, jenis = EXCLUDED.jenis,
      agregat = EXCLUDED.agregat, kelompok = EXCLUDED.kelompok,
      urutan = EXCLUDED.urutan;
