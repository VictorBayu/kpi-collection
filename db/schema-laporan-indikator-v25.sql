-- =====================================================================
-- v25 — MENU LAPORAN INDIKATOR
-- Hanya menambah hak menu; tidak ada tabel baru (laporan membaca
-- indikator_target + indikator_def yang sudah ada). Aman dijalankan ulang.
-- Peran lain (mis. manajemen_ho) bisa diberi lewat layar Peran & Hak Akses.
-- =====================================================================
INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_laporan_indikator'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;
