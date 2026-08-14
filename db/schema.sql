-- =====================================================================
-- KPI COLLECTION — Skema Postgres (Neon / Vercel Postgres)
-- Jalankan sekali saat setup. Aman dijalankan ulang.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PENGGUNA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_user (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nik                  VARCHAR(16)  NOT NULL UNIQUE,
  nama                 TEXT         NOT NULL,
  password_hash        TEXT         NOT NULL,          -- bcrypt cost 12
  jabatan              TEXT,
  cabang               TEXT,
  area                 TEXT,
  peran                TEXT         NOT NULL DEFAULT 'karyawan'
                       CHECK (peran IN ('karyawan','atasan','admin')),
  aktif                BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_cabang ON app_user (cabang) WHERE aktif;
CREATE INDEX IF NOT EXISTS idx_user_area   ON app_user (area)   WHERE aktif;

-- ---------------------------------------------------------------------
-- 2. BATCH IMPOR
--    Satu unggahan Excel = satu batch. Data hanya terlihat karyawan
--    ketika status = 'published'.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_batch (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode        DATE         NOT NULL,                -- selalu tanggal 1
  tipe           TEXT         NOT NULL
                 CHECK (tipe IN ('kpi','insentif','od_movement','cp')),
  status         TEXT         NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','validated','published','superseded','failed')),
  nama_file      TEXT         NOT NULL,
  blob_url       TEXT         NOT NULL,
  file_sha256    CHAR(64)     NOT NULL,
  total_baris    INTEGER      NOT NULL DEFAULT 0,
  baris_valid    INTEGER      NOT NULL DEFAULT 0,
  baris_warning  INTEGER      NOT NULL DEFAULT 0,
  baris_ditolak  INTEGER      NOT NULL DEFAULT 0,
  catatan        TEXT,
  diunggah_oleh  UUID         REFERENCES app_user(id),
  diunggah_pada  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  diterbitkan_pada TIMESTAMPTZ
);

-- Hash file diindeks untuk pencarian cepat (TIDAK unik: berkas sama boleh
-- diunggah ulang untuk menggantikan periode yang sama)
CREATE INDEX IF NOT EXISTS idx_batch_file ON import_batch (file_sha256);
-- Hanya satu batch aktif per periode per tipe
CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_published
  ON import_batch (periode, tipe) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_batch_lookup ON import_batch (tipe, periode, status);

-- ---------------------------------------------------------------------
-- 3. TEMUAN VALIDASI (ditampilkan di layar Tinjau)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_issue (
  id         BIGSERIAL PRIMARY KEY,
  batch_id   UUID NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
  baris      INTEGER NOT NULL,          -- nomor baris di file Excel
  kolom      TEXT,
  tingkat    TEXT NOT NULL CHECK (tingkat IN ('warning','error')),
  pesan      TEXT NOT NULL,             -- ditulis untuk admin, bukan stack trace
  nilai_asli TEXT
);
CREATE INDEX IF NOT EXISTS idx_issue_batch ON import_issue (batch_id, tingkat);

-- ---------------------------------------------------------------------
-- 4. DATA KPI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_row (
  id             BIGSERIAL PRIMARY KEY,
  batch_id       UUID        NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
  periode        DATE        NOT NULL,
  nik            VARCHAR(16) NOT NULL,
  nama           TEXT,
  jabatan        TEXT,
  cabang         TEXT,
  produk         TEXT,
  indikator      TEXT        NOT NULL,
  bobot          NUMERIC(6,2),
  saldo_awal     NUMERIC(18,2),
  pencapaian     NUMERIC(18,2),
  rasio          NUMERIC(8,4),          -- 0.78 = 78%
  skor_kpi       NUMERIC(6,2),
  skor_terbobot  NUMERIC(8,2),
  target_kpi3    NUMERIC(18,2),
  target_kpi4    NUMERIC(18,2),
  target_kpi5    NUMERIC(18,2),
  satuan         TEXT DEFAULT 'rupiah'  -- rupiah | persen | unit
                 CHECK (satuan IN ('rupiah','persen','unit')),
  catatan        TEXT
);
CREATE INDEX IF NOT EXISTS idx_kpi_lookup ON kpi_row (nik, periode);
CREATE INDEX IF NOT EXISTS idx_kpi_batch  ON kpi_row (batch_id);

-- ---------------------------------------------------------------------
-- 5. DATA INSENTIF
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insentif_row (
  id          BIGSERIAL PRIMARY KEY,
  batch_id    UUID        NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
  periode     DATE        NOT NULL,
  nik         VARCHAR(16) NOT NULL,
  kategori    TEXT        NOT NULL,
  produk      TEXT,
  jabatan     TEXT,
  cabang      TEXT,
  bobot       TEXT,
  saldo_awal  NUMERIC(18,2),
  pencapaian  NUMERIC(18,2),
  rasio       NUMERIC(8,4),
  skor_kpi    NUMERIC(6,2),
  nominal     NUMERIC(18,2) NOT NULL DEFAULT 0,
  keterangan  TEXT
);
CREATE INDEX IF NOT EXISTS idx_insentif_lookup ON insentif_row (nik, periode);

-- ---------------------------------------------------------------------
-- 6. MODUL REQUEST (dipindahkan dari Apps Script)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS request (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor       TEXT UNIQUE NOT NULL,      -- REQ-202608-0001
  user_id     UUID NOT NULL REFERENCES app_user(id),
  kategori    TEXT NOT NULL,
  periode     DATE,
  judul       TEXT NOT NULL,
  deskripsi   TEXT NOT NULL,
  lampiran_url TEXT,
  prioritas   TEXT NOT NULL DEFAULT 'normal'
              CHECK (prioritas IN ('rendah','normal','tinggi')),
  status      TEXT NOT NULL DEFAULT 'baru'
              CHECK (status IN ('baru','diproses','butuh_info','selesai','ditolak')),
  hasil       TEXT,
  petugas_id  UUID REFERENCES app_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dilihat_user_at  TIMESTAMPTZ,
  dilihat_admin_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_request_user   ON request (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_status ON request (status, created_at DESC);

CREATE TABLE IF NOT EXISTS request_message (
  id         BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES request(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES app_user(id),
  peran      TEXT NOT NULL CHECK (peran IN ('karyawan','admin')),
  pesan      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_request ON request_message (request_id, created_at);

-- ---------------------------------------------------------------------
-- 7. JEJAK AUDIT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES app_user(id),
  aksi       TEXT NOT NULL,              -- login, publish_batch, rollback_batch, ...
  objek      TEXT,
  detail     JSONB,
  ip         INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at DESC);

-- ---------------------------------------------------------------------
-- 8. VIEW: hanya data terbit yang boleh dibaca aplikasi
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_aktif AS
SELECT k.*
FROM kpi_row k
JOIN import_batch b ON b.id = k.batch_id
WHERE b.status = 'published';

CREATE OR REPLACE VIEW v_insentif_aktif AS
SELECT i.*
FROM insentif_row i
JOIN import_batch b ON b.id = i.batch_id
WHERE b.status = 'published';

-- ---------------------------------------------------------------------
-- 9. TERBITKAN BATCH — satu transaksi, bisa dibatalkan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION publish_batch(p_batch_id UUID)
RETURNS VOID AS $$
DECLARE v_periode DATE; v_tipe TEXT;
BEGIN
  SELECT periode, tipe INTO v_periode, v_tipe FROM import_batch WHERE id = p_batch_id;

  UPDATE import_batch
     SET status = 'superseded'
   WHERE periode = v_periode AND tipe = v_tipe AND status = 'published';

  UPDATE import_batch
     SET status = 'published', diterbitkan_pada = now()
   WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql;
