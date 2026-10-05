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
export async function duplikasiPeriode(
  dari: string, ke: string, timpa: boolean, indikatorIds: string[] | null = null,
) {
  if (dari === ke) throw new Error("Periode asal dan tujuan sama.");
  // null = semua indikator; daftar = hanya indikator yang dipilih.
  const pilih = indikatorIds && indikatorIds.length ? indikatorIds : null;
  if (indikatorIds && !indikatorIds.length) throw new Error("Pilih minimal satu indikator.");

  const [{ n: nAsal }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM indikator_target
      WHERE periode = $1::date AND ($2::uuid[] IS NULL OR indikator_id = ANY($2::uuid[]))`,
    [dari, pilih]);
  if (!nAsal) throw new Error("Periode asal belum punya pendaftaran untuk indikator yang dipilih.");

  // Bentrok hanya dihitung pada indikator yang akan disalin; indikator lain
  // di bulan tujuan tidak disentuh.
  const [{ n: nTujuan }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM indikator_target t
      WHERE t.periode = $2::date
        AND t.indikator_id IN (SELECT indikator_id FROM indikator_target
                                WHERE periode = $1::date
                                  AND ($3::uuid[] IS NULL OR indikator_id = ANY($3::uuid[])))`,
    [dari, ke, pilih]);
  if (nTujuan && !timpa) {
    throw new Error("Bulan tujuan sudah punya pendaftaran untuk indikator yang dipilih. Centang menimpa bila memang ingin diganti.");
  }
  if (nTujuan) {
    await q(
      `DELETE FROM indikator_target
        WHERE periode = $2::date
          AND indikator_id IN (SELECT indikator_id FROM indikator_target
                                WHERE periode = $1::date
                                  AND ($3::uuid[] IS NULL OR indikator_id = ANY($3::uuid[])))`,
      [dari, ke, pilih]);
  }

  await q(
    `INSERT INTO indikator_target
       (indikator_id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
        bobot_kpi, bobot_insentif, faktor_pengakuan,
        target_kpi3, target_kpi4, target_kpi5, aktif, periode)
     SELECT indikator_id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
            bobot_kpi, bobot_insentif, faktor_pengakuan,
            target_kpi3, target_kpi4, target_kpi5, aktif, $2::date
       FROM indikator_target
      WHERE periode = $1::date AND ($3::uuid[] IS NULL OR indikator_id = ANY($3::uuid[]))`,
    [dari, ke, pilih]);

  // Anak-anaknya dipetakan lewat kunci (indikator, jabatan, produk).
  const peta = `FROM indikator_target s
       JOIN indikator_target n
         ON n.indikator_id = s.indikator_id AND n.alias = s.alias
        AND n.produk = s.produk AND n.periode = $2::date
      WHERE s.periode = $1::date AND ($3::uuid[] IS NULL OR s.indikator_id = ANY($3::uuid[]))`;
  await q(
    `INSERT INTO indikator_pita (target_id, urutan, nilai_min, nilai_max, poin_min, poin_max)
     SELECT n.id, p.urutan, p.nilai_min, p.nilai_max, p.poin_min, p.poin_max
       ${peta.replace("WHERE", "JOIN indikator_pita p ON p.target_id = s.id WHERE")}`, [dari, ke, pilih]);
  await q(
    `INSERT INTO indikator_nominal (target_id, urutan, nilai_min, nilai_max, nominal)
     SELECT n.id, p.urutan, p.nilai_min, p.nilai_max, p.nominal
       ${peta.replace("WHERE", "JOIN indikator_nominal p ON p.target_id = s.id WHERE")}`, [dari, ke, pilih]);
  await q(
    `INSERT INTO indikator_gerbang (target_id, urutan, label, sumber_id, operator, nilai)
     SELECT n.id, p.urutan, p.label, p.sumber_id, p.operator, p.nilai
       ${peta.replace("WHERE", "JOIN indikator_gerbang p ON p.target_id = s.id WHERE")}`, [dari, ke, pilih]);

  // Peringatan: gerbang/pemilih yang menunjuk indikator yang belum punya
  // pendaftaran di bulan tujuan (mis. tidak ikut dipilih).
  const rujukan = await q<{ nama: string; rujuk: string }>(
    `SELECT DISTINCT d.nama, r.nama AS rujuk
       FROM indikator_target t
       JOIN indikator_def d ON d.id = t.indikator_id
       LEFT JOIN indikator_gerbang g ON g.target_id = t.id
       JOIN indikator_def r ON r.id IN (g.sumber_id, t.pemilih_id)
      WHERE t.periode = $1::date
        AND NOT EXISTS (SELECT 1 FROM indikator_target x
                         WHERE x.periode = $1::date AND x.indikator_id = r.id)`,
    [ke]);

  return { disalin: nAsal, menimpa: nTujuan, peringatan: rujukan };
}
