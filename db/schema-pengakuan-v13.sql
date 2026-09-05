-- ---------------------------------------------------------------------
-- PENGAKUAN v13 — bobot pengakuan per nilai pada satu komponen
--
-- Sebagian indikator tidak mengakui pencapaian secara penuh: satu kontrak
-- yang berpindah ke BTC diakui 50% dari outstanding principal, Lunas 80%,
-- Lunas Pokok 85%, dan seterusnya. Sebelumnya semua baris yang lolos
-- syarat dihitung 100%, sehingga aturan semacam ini tidak bisa dinyatakan
-- sama sekali dan harus diakali dengan memecah indikator per nilai.
--
-- Bentuknya: satu komponen boleh menunjuk SATU kolom penentu (mis. OD
-- Movement), lalu mendaftarkan pasangan nilai → persen sebanyak yang
-- dibutuhkan. Nilai yang tidak terdaftar diakui 0% — keputusan sadar,
-- supaya menambah nilai baru di data sumber tidak diam-diam ikut terhitung
-- penuh tanpa admin pernah memutuskannya.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

-- Kolom penentu disimpan di komponen; daftar bobotnya di tabel terpisah
-- karena jumlahnya tidak dibatasi.
ALTER TABLE indikator_komponen
  ADD COLUMN IF NOT EXISTS pengakuan_kolom TEXT;

CREATE TABLE IF NOT EXISTS indikator_pengakuan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  komponen_id UUID NOT NULL REFERENCES indikator_komponen(id) ON DELETE CASCADE,
  urutan      INTEGER NOT NULL DEFAULT 0,
  nilai       TEXT NOT NULL,
  -- Presisi 8 agar batas atas 1000 pada CHECK di bawah benar-benar muat;
  -- NUMERIC(7,4) berhenti di 999,9999 dan menolak 1000 dengan pesan
  -- overflow yang tidak menjelaskan apa-apa bagi admin.
  persen      NUMERIC(8,4) NOT NULL,
  UNIQUE (komponen_id, nilai)
);

CREATE INDEX IF NOT EXISTS idx_pengakuan_komponen
  ON indikator_pengakuan (komponen_id, urutan);

-- Persen dibatasi 0–1000: cukup longgar untuk pengakuan di atas 100%
-- (jarang tapi ada, mis. insentif berlipat), tapi tetap menangkap salah
-- ketik seperti 5000 yang akan mengacaukan seluruh perhitungan.
ALTER TABLE indikator_pengakuan DROP CONSTRAINT IF EXISTS ck_pengakuan_persen;
ALTER TABLE indikator_pengakuan ADD CONSTRAINT ck_pengakuan_persen
  CHECK (persen >= 0 AND persen <= 1000);
