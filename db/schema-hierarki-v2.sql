-- ================================================================
-- PENYEDERHANAAN MASTER HIERARKI (v2)
-- Jalankan SETELAH db/schema-hierarki.sql. Aman dijalankan ulang.
--
-- Alasan perubahan
-- ----------------
-- Varian produk (R2 / R4 / MIX) tidak mempengaruhi siapa atasan
-- seseorang: FC TT R2 dan FC TT R4 punya rantai atasan yang persis sama.
-- Memisahkannya di master hanya membuat daftar panjang tanpa menambah
-- ketelitian aturan visibilitas.
--
-- Karena itu master kini menyimpan jabatan pokok saja, dan setiap varian
-- didaftarkan sebagai alias. Data pegawai TIDAK perlu diubah — kolom
-- jabatan boleh tetap tertulis "FC TT R2", alias yang menerjemahkannya.
--
-- Yang digabung:
--   FC TT   <- FC TT R2, FC TT R4
--   FC F    <- FC F R2, FC F R4
--   FC SA   <- FC SA MIX, FC SA R2
--   FAR     <- FAR MIX, FAR R2, FAR R4
--   RE      <- RE MIX, RE R2
--   EBS     <- EBS MIX
--   MBS     <- MBS MIX
--   MEBS    <- MEBS MIX
--
-- EBS / MBS / MEBS tetap berdiri sendiri karena rantai atasannya berbeda
-- satu sama lain, hanya namanya yang dirapikan.
-- ================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. JABATAN POKOK
-- ---------------------------------------------------------------------
INSERT INTO jabatan_level (jabatan, level, urutan) VALUES
  ('FC TT', 'staff', 10),
  ('FC F',  'staff', 10),
  ('FC SA', 'staff', 10),
  ('FAR',   'staff', 10),
  ('RE',    'staff', 10),
  ('EBS',   'staff', 10),
  ('MBS',   'staff', 10),
  ('MEBS',  'staff', 10)
ON CONFLICT (jabatan) DO UPDATE SET level = EXCLUDED.level, updated_at = now();

-- ---------------------------------------------------------------------
-- 2. RANTAI ATASAN JABATAN POKOK
--    Disalin apa adanya dari dokumen hierarki, tanpa perubahan makna.
-- ---------------------------------------------------------------------
DELETE FROM jabatan_atasan
 WHERE jabatan IN ('FC TT','FC F','FC SA','FAR','RE','EBS','MBS','MEBS');

INSERT INTO jabatan_atasan (jabatan, tingkat, atasan) VALUES
  -- FC TT → BCS TT → BCH F → BCH FE → ACH → BM → AM
  ('FC TT', 1, 'BCS TT'), ('FC TT', 2, 'BCH F'), ('FC TT', 3, 'BCH FE'),
  ('FC TT', 4, 'ACH'),    ('FC TT', 5, 'BM'),    ('FC TT', 6, 'AM'),
  -- FC F → BCS TT → BCH F → ACH → BM → AM
  ('FC F',  1, 'BCS TT'), ('FC F',  2, 'BCH F'), ('FC F',  3, 'ACH'),
  ('FC F',  4, 'BM'),     ('FC F',  5, 'AM'),
  -- FC SA / FAR / RE → BCH F → BCH FE → ACH → BM → AM
  ('FC SA', 1, 'BCH F'),  ('FC SA', 2, 'BCH FE'), ('FC SA', 3, 'ACH'),
  ('FC SA', 4, 'BM'),     ('FC SA', 5, 'AM'),
  ('FAR',   1, 'BCH F'),  ('FAR',   2, 'BCH FE'), ('FAR',   3, 'ACH'),
  ('FAR',   4, 'BM'),     ('FAR',   5, 'AM'),
  ('RE',    1, 'BCH F'),  ('RE',    2, 'BCH FE'), ('RE',    3, 'ACH'),
  ('RE',    4, 'BM'),     ('RE',    5, 'AM'),
  -- EBS / MBS → BCH ME → ACH → BM → AM
  ('EBS',   1, 'BCH ME'), ('EBS',   2, 'ACH'), ('EBS',   3, 'BM'), ('EBS', 4, 'AM'),
  ('MBS',   1, 'BCH ME'), ('MBS',   2, 'ACH'), ('MBS',   3, 'BM'), ('MBS', 4, 'AM'),
  -- MEBS → BCH FE → BCH ME → ACH → BM
  ('MEBS',  1, 'BCH FE'), ('MEBS',  2, 'BCH ME'), ('MEBS', 3, 'ACH'), ('MEBS', 4, 'BM');

-- ---------------------------------------------------------------------
-- 3. VARIAN LAMA JADI ALIAS
--    Ditulis sebelum baris lamanya dihapus, supaya pegawai yang jabatannya
--    masih "FC TT R2" tidak pernah kehilangan pemetaan walau sesaat.
-- ---------------------------------------------------------------------
INSERT INTO jabatan_alias (alias, jabatan) VALUES
  ('FC TT R2',  'FC TT'),  ('FC TT R4',  'FC TT'),
  ('FC F R2',   'FC F'),   ('FC F R4',   'FC F'),
  ('FC SA MIX', 'FC SA'),  ('FC SA R2',  'FC SA'),
  ('FAR MIX',   'FAR'),    ('FAR R2',    'FAR'),   ('FAR R4', 'FAR'),
  ('RE MIX',    'RE'),     ('RE R2',     'RE'),
  ('EBS MIX',   'EBS'),
  ('MBS MIX',   'MBS'),
  ('MEBS MIX',  'MEBS')
ON CONFLICT (alias) DO UPDATE SET jabatan = EXCLUDED.jabatan;

-- ---------------------------------------------------------------------
-- 4. HAPUS BARIS JABATAN VARIAN DARI MASTER
-- ---------------------------------------------------------------------
DELETE FROM jabatan_atasan WHERE jabatan IN (
  'FC TT R2','FC TT R4','FC F R2','FC F R4','FC SA MIX','FC SA R2',
  'FAR MIX','FAR R2','FAR R4','RE MIX','RE R2','EBS MIX','MBS MIX','MEBS MIX');

DELETE FROM jabatan_level WHERE jabatan IN (
  'FC TT R2','FC TT R4','FC F R2','FC F R4','FC SA MIX','FC SA R2',
  'FAR MIX','FAR R2','FAR R4','RE MIX','RE R2','EBS MIX','MBS MIX','MEBS MIX');

-- ---------------------------------------------------------------------
-- 5. JABATAN YANG SEBELUMNYA BELUM DIKENAL MASTER
--
--    PJS = pejabat sementara. Wewenangnya sama dengan jabatan yang
--    dirangkap, jadi cukup dijadikan alias — bukan jabatan tersendiri.
-- ---------------------------------------------------------------------
INSERT INTO jabatan_alias (alias, jabatan) VALUES
  ('PJS BM',  'BM'),
  ('PJS DBM', 'DBM')
ON CONFLICT (alias) DO UPDATE SET jabatan = EXCLUDED.jabatan;

-- ADMIN: pemegang akun admin data. Tidak ikut rantai KPI mana pun.
-- KKP: didaftarkan agar tidak lagi muncul sebagai jabatan tak dikenal.
--      Rantai atasannya SENGAJA dikosongkan — silakan diisi lewat menu
--      Master Hierarki begitu strukturnya dipastikan.
INSERT INTO jabatan_level (jabatan, level, urutan) VALUES
  ('ADMIN', 'admin', 99),
  ('KKP',   'staff', 10)
ON CONFLICT (jabatan) DO NOTHING;

-- "Super User" adalah penulisan lain untuk akun admin data.
INSERT INTO jabatan_alias (alias, jabatan) VALUES
  ('SUPER USER', 'ADMIN')
ON CONFLICT (alias) DO UPDATE SET jabatan = EXCLUDED.jabatan;

COMMIT;

-- ---------------------------------------------------------------------
-- PEMERIKSAAN — jalankan terpisah untuk melihat hasilnya
-- ---------------------------------------------------------------------
-- Daftar master setelah penyederhanaan:
--   SELECT jl.jabatan, jl.level,
--          (SELECT string_agg(atasan, ' → ' ORDER BY tingkat)
--             FROM jabatan_atasan ja WHERE ja.jabatan = jl.jabatan) AS rantai
--     FROM jabatan_level jl ORDER BY jl.urutan DESC, jl.jabatan;
--
-- Pastikan tidak ada pegawai aktif yang jabatannya tak dikenal:
--   SELECT norm_jabatan(u.jabatan) AS jabatan, COUNT(*)
--     FROM app_user u
--     LEFT JOIN jabatan_alias a  ON a.alias    = norm_jabatan(u.jabatan)
--     LEFT JOIN jabatan_level jl ON jl.jabatan = COALESCE(a.jabatan, norm_jabatan(u.jabatan))
--    WHERE u.aktif AND u.jabatan IS NOT NULL AND jl.jabatan IS NULL
--    GROUP BY 1;
