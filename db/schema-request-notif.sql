-- ================================================================
-- Penanda "sudah dibaca" untuk notifikasi request.
-- Jalankan SEKALI di SQL Editor Neon. Aman diulang.
-- ================================================================
ALTER TABLE request ADD COLUMN IF NOT EXISTS dilihat_user_at  TIMESTAMPTZ;
ALTER TABLE request ADD COLUMN IF NOT EXISTS dilihat_admin_at TIMESTAMPTZ;

-- Tiket lama dianggap sudah terbaca sampai ada aktivitas baru
UPDATE request SET dilihat_user_at  = updated_at WHERE dilihat_user_at  IS NULL;
UPDATE request SET dilihat_admin_at = updated_at WHERE dilihat_admin_at IS NULL;
