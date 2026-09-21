-- =====================================================================
-- v24 — ARSIP DATA MENTAH BULANAN, untuk hitung ulang periode lampau
--
-- `data_mentah` di-TRUNCATE dan ditulis ulang penuh tiap kali data
-- ditarik dari API (lihat lib/tarik-api.ts) -- tabel ini hanya pernah
-- berisi snapshot HARI INI, tidak pernah data bulan lalu. Jadi begitu
-- ada rumus indikator yang perlu diperbaiki dan dihitung ulang untuk
-- periode yang sudah lewat, tidak ada lagi data mentah bulan itu untuk
-- dihitung ulang.
--
-- Solusinya: admin mengunggah manual arsip data akhir bulan (Excel,
-- dari layar "Arsip Data Mentah"), disimpan di sini, dan mesin hitung
-- (lib/hitung-indikator.ts) memakainya sebagai pengganti data_mentah
-- ketika menghitung ulang periode yang sudah punya arsip terbit.
--
-- Rancangan mengikuti pola cabang_kelas/insentif_tier: baris LAMA TIDAK
-- PERNAH DITIMPA. Batch baru untuk periode yang sama menggantikan
-- (superseded) batch lama, bukan mengubahnya -- supaya riwayat apa yang
-- pernah dipakai untuk menghitung tetap bisa ditelusuri.
--
-- `kolom` disimpan sebagai JSONB, bukan kolom fisik satu-satu, karena
-- katalog `mentah_kolom` berubah dari waktu ke waktu (admin bisa
-- menambah/menghapus kolom lewat menu Kolom Turunan/CRUD Kolom API).
-- Skema arsip yang kaku akan butuh ALTER TABLE berisiko pada baris lama
-- setiap kali katalog itu berubah; JSONB menghindarinya sepenuhnya.
--
-- Ukuran diperkirakan aman: ~58 kolom terpakai rumus x ~85 ribu baris
-- berPIC per bulan ~ 47 MB/bulan (diukur dari data produksi saat
-- migrasi ini ditulis: data_mentah 69 MB berisi 88.218 baris, 82 kolom
-- fisik, 58 kolom terdaftar di mentah_kolom).
--
-- Aman dijalankan ulang.
-- =====================================================================

CREATE TABLE IF NOT EXISTS arsip_mentah_batch (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode          DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','validated','published','superseded','failed')),
  nama_file        TEXT NOT NULL,
  blob_url         TEXT,
  file_sha256      CHAR(64),
  total_baris      INTEGER NOT NULL DEFAULT 0,
  baris_valid      INTEGER NOT NULL DEFAULT 0,
  baris_ditolak    INTEGER NOT NULL DEFAULT 0,
  catatan          TEXT,
  diunggah_oleh    UUID REFERENCES app_user(id),
  diunggah_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  diterbitkan_pada TIMESTAMPTZ
);

-- Hanya satu batch boleh "published" per periode -- inilah yang dibaca
-- mesin hitung. Menerbitkan batch baru untuk periode yang sama harus
-- lebih dulu memindahkan batch lama ke status 'superseded' (satu
-- transaksi, lihat app/api/admin/arsip-mentah/publish/route.ts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_arsip_periode_published
  ON arsip_mentah_batch (periode) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_arsip_batch_periode ON arsip_mentah_batch (periode);

CREATE TABLE IF NOT EXISTS arsip_mentah_baris (
  id             BIGSERIAL PRIMARY KEY,
  batch_id       UUID NOT NULL REFERENCES arsip_mentah_batch(id) ON DELETE CASCADE,
  periode        DATE NOT NULL,

  -- Kolom identitas dan pengelompokan ditulis eksplisit (bukan di dalam
  -- JSONB) karena inilah yang dipakai JOIN dan WHERE mesin hitung -- perlu
  -- bisa diindeks. NIK diuraikan sendiri saat mengunggah, meniru pola
  -- kolom generated nik_staff/nik_spv/nik_bch di data_mentah.
  agreement_no   TEXT NOT NULL,
  branch_id      TEXT,
  product        TEXT,
  nik_staff      TEXT,
  nik_spv        TEXT,
  nik_bch        TEXT,

  -- Sisa kolom yang boleh dipakai rumus (katalog mentah_kolom, sumber
  -- 'api', bukan turunan), disimpan apa adanya sebagai JSON per baris.
  kolom          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_arsip_baris_batch  ON arsip_mentah_baris (batch_id);
CREATE INDEX IF NOT EXISTS idx_arsip_baris_periode ON arsip_mentah_baris (periode);
CREATE INDEX IF NOT EXISTS idx_arsip_baris_staff  ON arsip_mentah_baris (batch_id, nik_staff);
CREATE INDEX IF NOT EXISTS idx_arsip_baris_spv    ON arsip_mentah_baris (batch_id, nik_spv);
CREATE INDEX IF NOT EXISTS idx_arsip_baris_bch    ON arsip_mentah_baris (batch_id, nik_bch);

-- Menu baru untuk peran admin, digrupkan bersama menu data & indikator
-- lain di navigasi (lihat lib/menu.ts).
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_arsip_mentah'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;
