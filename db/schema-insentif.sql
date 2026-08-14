-- ================================================================
-- Kolom tambahan untuk impor INSENTIF (struktur berkas asli)
-- Jalankan SEKALI di SQL Editor Neon. Aman diulang.
-- ================================================================
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS jabatan  TEXT;
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS cabang   TEXT;
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS bobot    TEXT;
ALTER TABLE insentif_row ADD COLUMN IF NOT EXISTS skor_kpi NUMERIC(6,2);

-- nominal boleh kosong (berkas memakai "-" untuk baris tanpa insentif)
ALTER TABLE insentif_row ALTER COLUMN nominal DROP NOT NULL;
ALTER TABLE insentif_row ALTER COLUMN nominal SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_insentif_cabang ON insentif_row (periode, cabang);
