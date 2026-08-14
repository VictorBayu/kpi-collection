-- ================================================================
-- Tambahan untuk fitur: pelacakan akses & suspend user
-- Jalankan SEKALI setelah schema.sql dan schema-addendum.sql.
-- Aman dijalankan ulang.
-- ================================================================

-- Kolom penghitung pada app_user
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS login_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS access_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS last_access_at    TIMESTAMPTZ;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS suspended_reason  TEXT;

-- Catatan tiap kunjungan halaman (akses web), untuk laporan per hari
CREATE TABLE IF NOT EXISTS access_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  jenis      TEXT NOT NULL DEFAULT 'akses'   -- 'login' | 'akses'
             CHECK (jenis IN ('login','akses')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_user ON access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_time ON access_log (created_at DESC);

-- Ringkasan akses 30 hari terakhir per user (dipakai laporan admin)
CREATE OR REPLACE VIEW v_akses_ringkas AS
SELECT
  u.id, u.nik, u.nama, u.peran, u.cabang, u.area, u.aktif,
  u.login_count, u.access_count, u.last_login_at, u.last_access_at,
  u.suspended_at, u.suspended_reason,
  COALESCE(a30.akses_30h, 0)  AS akses_30h,
  COALESCE(a7.akses_7h, 0)    AS akses_7h
FROM app_user u
LEFT JOIN (
  SELECT user_id, COUNT(*) AS akses_30h FROM access_log
   WHERE created_at > now() - interval '30 days' GROUP BY user_id
) a30 ON a30.user_id = u.id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS akses_7h FROM access_log
   WHERE created_at > now() - interval '7 days' GROUP BY user_id
) a7 ON a7.user_id = u.id;
