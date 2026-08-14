-- Tambahan untuk pipeline impor. Jalankan setelah schema.sql.
--
-- Baris mentah dari Excel disimpan dulu di sini supaya pemeriksaan bisa
-- dijalankan bertahap tanpa mengunduh ulang file besar pada tiap potongan.

CREATE TABLE IF NOT EXISTS import_staging_row (
  batch_id UUID    NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
  row_no   INTEGER NOT NULL,          -- nomor baris asli di file Excel
  data     JSONB   NOT NULL,          -- { "NIK": "...", "PENCAPAIAN": 892000000, ... }
  PRIMARY KEY (batch_id, row_no)
);

-- Pemetaan kolom terakhir yang dipakai, agar bulan depan terisi otomatis
CREATE TABLE IF NOT EXISTS import_preset (
  tipe        TEXT PRIMARY KEY,
  sheet_name  TEXT,
  mapping     JSONB NOT NULL,
  updated_by  UUID REFERENCES app_user(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_batch ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE import_batch ADD COLUMN IF NOT EXISTS mapping JSONB;
