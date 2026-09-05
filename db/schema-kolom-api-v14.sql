-- ---------------------------------------------------------------------
-- KOLOM API v14 — katalog kolom yang dapat dikelola dari web
--
-- Sebelumnya daftar kolom data mentah hanya bisa diubah lewat migrasi:
-- menambah satu field dari API berarti menyunting berkas SQL, keNilai(),
-- dan larik KOLOM di lib/tarik-api.ts sekaligus. Sekarang admin bisa
-- menambah kolom sendiri dari layar web.
--
-- Rancangannya sengaja ADITIF, bukan menggantikan:
--
--   - Kolom INTI (bawaan = true) tetap ditangani kode seperti sebelumnya.
--     Penarikan 88 ribu baris per siklus bersandar pada urutan larik yang
--     sudah teruji; menjadikannya dinamis hanya menambah risiko tanpa
--     menambah kemampuan, karena kolom inti memang tidak pernah berubah.
--   - Kolom KUSTOM (bawaan = false) adalah tambahan yang dibaca dari
--     katalog ini saat menarik data, lalu ditulis ke kolom fisik yang
--     dibuat bersamaan saat admin menambahkannya.
--
-- Dengan begitu, kegagalan pada kolom kustom tidak pernah bisa
-- menggagalkan pengambilan kolom inti.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

-- Nama field pada respons API (mis. "OutstandingPrincipal"). Kosong untuk
-- kolom yang tidak berasal dari API — misalnya kolom turunan.
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS field_api TEXT;

-- Kolom inti tidak boleh dihapus dari layar web: mesin hitung, hierarki,
-- dan pemetaan PIC bersandar padanya.
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS bawaan BOOLEAN NOT NULL DEFAULT false;

-- Kolom nonaktif tetap ada di database (datanya tidak dibuang) tapi tidak
-- lagi ditawarkan saat menyusun rumus. Ini jalan keluar yang aman untuk
-- kolom yang tidak dipakai lagi namun sudah dipakai indikator lama.
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS aktif BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE mentah_kolom ADD COLUMN IF NOT EXISTS dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now();

-- Semua kolom yang sudah ada saat migrasi ini dijalankan adalah kolom
-- inti. Yang ditambahkan admin sesudahnya otomatis bawaan = false.
UPDATE mentah_kolom SET bawaan = true WHERE bawaan = false;

-- Nama kolom fisik dibatasi bentuknya sejak di database, bukan hanya di
-- program: kolom ini ditempel ke perintah SQL saat menarik data, jadi
-- bentuk yang tidak sah tidak boleh pernah tersimpan sekalipun ada jalur
-- lain yang melewatkan pemeriksaan di aplikasi.
ALTER TABLE mentah_kolom DROP CONSTRAINT IF EXISTS ck_kolom_nama;
ALTER TABLE mentah_kolom ADD CONSTRAINT ck_kolom_nama
  CHECK (kolom ~ '^[a-z][a-z0-9_]{0,50}$');

-- Menu baru diberikan ke peran admin secara terpisah. Seed di v12 hanya
-- mengisi peran yang belum punya baris sama sekali, jadi pemasangan yang
-- sudah berjalan tidak akan menerimanya dari sana.
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_kolom_api'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;
