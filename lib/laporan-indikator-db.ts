import { q } from "@/lib/db";
import type { BarisLaporan } from "@/lib/laporan-indikator";

const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Seluruh pendaftaran jabatan·produk, dibaca langsung dari tabel yang sama
 * dengan yang ditulis dan ditampilkan layar Create Indicator
 * (indikator_target + indikator_def) -- bukan salinan atau ringkasan
 * terpisah, jadi laporan tidak mungkin berbeda dari isi Create Indicator.
 * Pendaftaran & indikator nonaktif tetap ikut; statusnya ditampilkan.
 */
export async function muatLaporanIndikator(periode: string | null = null): Promise<BarisLaporan[]> {
  const rows = await q<any>(
    `SELECT t.id, to_char(t.periode, 'YYYY-MM-DD') AS periode, d.id AS indikator_id, d.nama AS indikator, d.satuan,
            d.aktif AS aktif_indikator,
            t.alias AS jabatan, t.produk, pm.nama AS produk_nama,
            t.peran, t.jenis_nilai, t.nilai_efek,
            t.bobot_kpi, t.bobot_insentif, t.faktor_pengakuan,
            t.target_kpi3, t.target_kpi4, t.target_kpi5, t.aktif AS aktif_daftar,
            EXISTS (SELECT 1 FROM indikator_pita p WHERE p.target_id = t.id) AS ada_pita
       FROM indikator_target t
       JOIN indikator_def d ON d.id = t.indikator_id
       LEFT JOIN produk_master pm ON pm.kode = t.produk
      WHERE ($1::date IS NULL OR t.periode = $1::date)
      ORDER BY t.periode DESC, t.alias, t.produk, d.nama`, [periode]);

  return rows.map((r) => ({
    id: r.id,
    periode: r.periode,
    indikatorId: r.indikator_id,
    indikator: r.indikator,
    satuan: r.satuan ?? null,
    jabatan: r.jabatan,
    produk: r.produk,
    produkNama: r.produk_nama ?? null,
    peran: r.peran ?? "kpi",
    jenisNilai: r.jenis_nilai ?? null,
    nilaiEfek: angka(r.nilai_efek),
    bobotKpi: angka(r.bobot_kpi),
    bobotInsentif: angka(r.bobot_insentif),
    faktorPengakuan: angka(r.faktor_pengakuan) ?? 100,
    targetKpi3: angka(r.target_kpi3),
    targetKpi4: angka(r.target_kpi4),
    targetKpi5: angka(r.target_kpi5),
    adaPita: !!r.ada_pita,
    aktifIndikator: !!r.aktif_indikator,
    aktifDaftar: !!r.aktif_daftar,
  }));
}
