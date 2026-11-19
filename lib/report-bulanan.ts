import { q } from "@/lib/db";
import { toISODate } from "@/lib/format";

export type RingkasanPeriode = {
  periode: string;
  kpi_baris: number; kpi_nik: number;
  ins_baris: number; ins_nik: number;
  dihitung_pada: string | null;
};

/** Jumlah baris hasil hitung (sumber 'api') per periode, untuk kpi_row dan insentif_row. */
export async function ringkasanPeriode(): Promise<RingkasanPeriode[]> {
  const baris = await q<any>(
    `WITH k AS (
       SELECT periode, COUNT(*)::int AS kpi_baris, COUNT(DISTINCT nik)::int AS kpi_nik,
              MAX(dihitung_pada) AS kpi_hitung
         FROM kpi_row WHERE sumber = 'api' GROUP BY periode
     ), i AS (
       SELECT periode, COUNT(*)::int AS ins_baris, COUNT(DISTINCT nik)::int AS ins_nik,
              MAX(dihitung_pada) AS ins_hitung
         FROM insentif_row WHERE sumber = 'api' GROUP BY periode
     )
     SELECT COALESCE(k.periode, i.periode) AS periode,
            COALESCE(k.kpi_baris, 0) AS kpi_baris, COALESCE(k.kpi_nik, 0) AS kpi_nik,
            COALESCE(i.ins_baris, 0) AS ins_baris, COALESCE(i.ins_nik, 0) AS ins_nik,
            GREATEST(k.kpi_hitung, i.ins_hitung) AS dihitung_pada
       FROM k FULL OUTER JOIN i ON i.periode = k.periode
      ORDER BY 1 DESC`);
  return baris.map((b) => ({
    ...b,
    periode: toISODate(b.periode),
    dihitung_pada: b.dihitung_pada ? new Date(b.dihitung_pada).toISOString() : null,
  }));
}
