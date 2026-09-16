-- =====================================================================
-- v22 — MENU TRACING KPI
--
-- Berkas ini tidak membuat tabel apa pun. Layar Tracing KPI hanya
-- MEMBACA: ia merangkai ulang jejak perhitungan satu NIK dari tabel yang
-- sudah ada (kpi_row, insentif_row, indikator_target, pita, gerbang,
-- pagu, tier). Itu memang disengaja — alat pemeriksa yang menyimpan
-- salinan angkanya sendiri lama-lama memeriksa salinannya, bukan angka
-- yang betul-betul dipakai membayar orang.
--
-- Jadi yang perlu dimigrasikan hanya satu hal: hak akses menunya. Daftar
-- menu sendiri hidup di lib/menu.ts (lihat komentar di sana); database
-- hanya menyimpan peran mana boleh membukanya.
--
-- Aman dijalankan berulang.
-- =====================================================================

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_tracing'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;

-- Indeks pendukung penelusuran.
--
-- Tracing selalu bertanya "satu NIK, satu periode" ke insentif_row —
-- pola yang sama seperti kpi_row yang sudah punya idx_kpi_lookup sejak
-- awal, tapi insentif_row belum. Tanpa ini, tiap penelusuran memindai
-- seluruh tabel insentif hanya untuk mengambil satu-dua baris.
CREATE INDEX IF NOT EXISTS idx_insentif_lookup ON insentif_row (nik, periode);

-- Gerbang dan pita dibaca per target_id dalam jumlah kecil tapi sering.
-- Keduanya sudah berindeks dari v9/v11; ditulis ulang di sini hanya
-- sebagai jaring pengaman untuk pemasangan yang melewatkan berkas itu.
CREATE INDEX IF NOT EXISTS idx_pita_target    ON indikator_pita    (target_id, urutan);
CREATE INDEX IF NOT EXISTS idx_nominal_target ON indikator_nominal (target_id, urutan);
CREATE INDEX IF NOT EXISTS idx_gerbang_target ON indikator_gerbang (target_id, urutan);
