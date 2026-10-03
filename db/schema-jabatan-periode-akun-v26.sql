-- v26 — Jabatan per periode (arsip) + akun otomatis dari API tanpa login
-- Jalankan di Neon SEKALI. Aman diulang (IF NOT EXISTS).

-- A. Arsip menyimpan teks PIC ("NIK - NAMA (JABATAN)") agar jabatan
--    periode lampau tidak ikut berubah saat jabatan di app_user berubah.
ALTER TABLE arsip_mentah_baris
  ADD COLUMN IF NOT EXISTS staff_pic TEXT,
  ADD COLUMN IF NOT EXISTS spv_pic   TEXT,
  ADD COLUMN IF NOT EXISTS bch_pic   TEXT;

-- B. Akun otomatis dari API (tanpa login)
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS bisa_login   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sumber_akun  TEXT    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS perlu_ditinjau BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hilang_dari_api BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE app_user ADD CONSTRAINT app_user_sumber_akun_chk
    CHECK (sumber_akun IN ('manual','api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
