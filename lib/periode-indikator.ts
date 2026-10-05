import { q } from "./db";

/** Memastikan nilai berbentuk tanggal 1 (YYYY-MM-01); selain itu null. */
export function periodeSah(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const bln = Number(m[2]);
  if (bln < 1 || bln > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export type PeriodeIndikator = { periode: string; pendaftaran: number; indikator: number };

/** Periode yang sudah punya set pendaftaran, terbaru dulu. */
export async function daftarPeriodeIndikator(): Promise<PeriodeIndikator[]> {
  const rows = await q<any>(
    `SELECT to_char(periode, 'YYYY-MM-DD') AS periode,
            COUNT(*)::int AS pendaftaran,
            COUNT(DISTINCT indikator_id)::int AS indikator
       FROM indikator_target GROUP BY periode ORDER BY periode DESC`);
  return rows;
}

/**
 * Menyalin seluruh pendaftaran (beserta pita, pita nominal, dan gerbang)
 * dari satu periode ke periode lain. Rumus indikator tidak disalin —
 * definisinya satu untuk semua bulan.
 *
 * Bila periode tujuan sudah punya isi, ditolak kecuali `timpa` = true
 * (isinya lalu dihapus dulu).
 */
export async function duplikasiPeriode(dari: string, ke: string, timpa: boolean) {
  if (dari === ke) throw new Error("Periode asal dan tujuan sama.");
  const [{ n: nAsal }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM indikator_target WHERE periode = $1::date`, [dari]);
  if (!nAsal) throw new Error("Periode asal belum punya pendaftaran indikator.");

  const [{ n: nTujuan }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM indikator_target WHERE periode = $1::date`, [ke]);
  if (nTujuan && !timpa) {
    throw new Error("Periode tujuan sudah punya pendaftaran. Pilih menimpa bila memang ingin diganti.");
  }
  if (nTujuan) await q(`DELETE FROM indikator_target WHERE periode = $1::date`, [ke]);

  await q(
    `INSERT INTO indikator_target
       (indikator_id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
        bobot_kpi, bobot_insentif, faktor_pengakuan,
        target_kpi3, target_kpi4, target_kpi5, aktif, periode)
     SELECT indikator_id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
            bobot_kpi, bobot_insentif, faktor_pengakuan,
            target_kpi3, target_kpi4, target_kpi5, aktif, $2::date
       FROM indikator_target WHERE periode = $1::date`, [dari, ke]);

  // Anak-anaknya dipetakan lewat kunci (indikator, jabatan, produk).
  const peta = `FROM indikator_target s
       JOIN indikator_target n
         ON n.indikator_id = s.indikator_id AND n.alias = s.alias
        AND n.produk = s.produk AND n.periode = $2::date
      WHERE s.periode = $1::date`;
  await q(
    `INSERT INTO indikator_pita (target_id, urutan, nilai_min, nilai_max, poin_min, poin_max)
     SELECT n.id, p.urutan, p.nilai_min, p.nilai_max, p.poin_min, p.poin_max
       ${peta.replace("WHERE", "JOIN indikator_pita p ON p.target_id = s.id WHERE")}`, [dari, ke]);
  await q(
    `INSERT INTO indikator_nominal (target_id, urutan, nilai_min, nilai_max, nominal)
     SELECT n.id, p.urutan, p.nilai_min, p.nilai_max, p.nominal
       ${peta.replace("WHERE", "JOIN indikator_nominal p ON p.target_id = s.id WHERE")}`, [dari, ke]);
  await q(
    `INSERT INTO indikator_gerbang (target_id, urutan, label, sumber_id, operator, nilai)
     SELECT n.id, p.urutan, p.label, p.sumber_id, p.operator, p.nilai
       ${peta.replace("WHERE", "JOIN indikator_gerbang p ON p.target_id = s.id WHERE")}`, [dari, ke]);

  return { disalin: nAsal, menimpa: nTujuan };
}
