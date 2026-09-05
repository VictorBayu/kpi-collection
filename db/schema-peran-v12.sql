-- ---------------------------------------------------------------------
-- PERAN v12 — peran yang dapat dikelola + hak akses menu
--
-- Sebelumnya peran tertanam sebagai CHECK ('karyawan','atasan','admin'),
-- sehingga menambah peran baru berarti mengubah skema dan menyebar
-- perubahan ke banyak berkas. Sekarang peran menjadi data: bisa
-- ditambah/ubah lewat layar admin, dan menu yang boleh dibuka tiap peran
-- disimpan di tabel tersendiri.
--
-- Kode menu di sini HARUS cocok dengan katalog di lib/menu.ts — itulah
-- satu-satunya sumber kebenaran daftar menu. Tabel ini hanya menyimpan
-- peran mana boleh membuka kode menu yang mana.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS peran (
  kode        TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  keterangan  TEXT,
  -- Peran bawaan tidak boleh dihapus atau diganti kodenya: logika
  -- hierarki, mesin hitung, dan penjagaan admin bersandar padanya.
  -- Menu-nya tetap boleh diatur.
  bawaan      BOOLEAN NOT NULL DEFAULT false,
  urutan      INTEGER NOT NULL DEFAULT 0,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS peran_menu (
  peran_kode TEXT NOT NULL REFERENCES peran(kode) ON DELETE CASCADE ON UPDATE CASCADE,
  menu_kode  TEXT NOT NULL,
  PRIMARY KEY (peran_kode, menu_kode)
);

CREATE INDEX IF NOT EXISTS idx_peran_menu ON peran_menu (peran_kode);

-- ---------------------------------------------------------------------
-- Peran bawaan. ON CONFLICT DO NOTHING supaya penyuntingan nama/urutan
-- oleh admin tidak tertimpa saat skrip dijalankan ulang.
-- ---------------------------------------------------------------------
INSERT INTO peran (kode, nama, keterangan, bawaan, urutan) VALUES
  ('karyawan',     'Karyawan',            'Melihat KPI dan insentif miliknya sendiri.',            true, 10),
  ('atasan',       'Atasan',              'Melihat KPI timnya sesuai rantai hierarki.',            true, 20),
  ('manager',      'Manager',             'Pemantauan lintas cabang: dashboard dan data KPI.',     true, 30),
  ('manajemen_ho', 'Manajemen HO',        'Pemantauan tingkat kantor pusat.',                      true, 40),
  ('admin',        'Admin / Superuser',   'Akses penuh termasuk seluruh pengaturan master.',       true, 50)
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- app_user.peran: lepas CHECK lama, ganti jadi rujukan ke tabel peran.
-- ON UPDATE CASCADE agar mengganti kode peran ikut memperbarui pengguna.
-- ---------------------------------------------------------------------
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'app_user'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%peran%'
  LOOP
    EXECUTE format('ALTER TABLE app_user DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- Pengguna dengan peran di luar daftar (bila ada) dikembalikan ke karyawan
-- supaya foreign key di bawah tidak menolak.
UPDATE app_user SET peran = 'karyawan'
 WHERE peran IS NULL OR peran NOT IN (SELECT kode FROM peran);

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS fk_app_user_peran;
ALTER TABLE app_user ADD CONSTRAINT fk_app_user_peran
  FOREIGN KEY (peran) REFERENCES peran(kode) ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Hak menu bawaan. Hanya diisi bila peran itu belum punya baris sama
-- sekali — sehingga pengaturan yang sudah disunting admin tidak direset
-- saat skrip dijalankan ulang.
-- ---------------------------------------------------------------------
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'karyawan', m FROM unnest(ARRAY[
  'dashboard','harian_saya','request'
]) m
WHERE NOT EXISTS (SELECT 1 FROM peran_menu WHERE peran_kode = 'karyawan');

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'atasan', m FROM unnest(ARRAY[
  'dashboard','harian_saya','tim','request'
]) m
WHERE NOT EXISTS (SELECT 1 FROM peran_menu WHERE peran_kode = 'atasan');

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'manager', m FROM unnest(ARRAY[
  'dashboard','harian_saya','tim','request',
  'admin_analitik','admin_kpi','admin_harian'
]) m
WHERE NOT EXISTS (SELECT 1 FROM peran_menu WHERE peran_kode = 'manager');

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'manajemen_ho', m FROM unnest(ARRAY[
  'dashboard','harian_saya','tim','request',
  'admin_analitik','admin_kpi','admin_harian','admin_riwayat'
]) m
WHERE NOT EXISTS (SELECT 1 FROM peran_menu WHERE peran_kode = 'manajemen_ho');

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', m FROM unnest(ARRAY[
  -- Sengaja tanpa menu sisi karyawan: akun admin data tidak punya KPI
  -- sendiri, jadi Dasbor saya / Progres harian / Tim saya selalu kosong.
  'admin_analitik','admin_kpi','admin_harian','admin_request',
  'admin_indikator','admin_data_api','admin_kolom_api','admin_sampel','admin_riwayat',
  'admin_import','admin_hierarki','admin_produk','admin_pagu','admin_tier',
  'admin_kelas_cabang','admin_cabang','admin_pengguna','admin_peran'
]) m
WHERE NOT EXISTS (SELECT 1 FROM peran_menu WHERE peran_kode = 'admin');
