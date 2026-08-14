import { q } from "./db";

export type Indikator = {
  produk: string | null; indikator: string;
  saldo_awal: number | null; pencapaian: number | null; rasio: number | null;
  skor_kpi: number | null; skor_terbobot: number | null;
  target_kpi3: number | null; target_kpi4: number | null; target_kpi5: number | null;
  catatan: string | null;
};

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

/** Periode yang sudah diterbitkan, terbaru dulu. */
export async function periodeTersedia() {
  return q<{ periode: string; diterbitkan_pada: string; nama_file: string; total: number }>(
    `SELECT b.periode, b.diterbitkan_pada, b.nama_file, b.baris_valid AS total
       FROM import_batch b
      WHERE b.tipe = 'kpi' AND b.status = 'published'
      ORDER BY b.periode DESC LIMIT 12`);
}

export async function indikatorKaryawan(nik: string, periode: string): Promise<Indikator[]> {
  const rows = await q<any>(
    `SELECT produk, indikator, saldo_awal, pencapaian, rasio, skor_kpi, skor_terbobot,
            target_kpi3, target_kpi4, target_kpi5, catatan
       FROM v_kpi_aktif
      WHERE nik = $1 AND periode = $2
      ORDER BY indikator`, [nik, periode]);

  return rows.map((r) => ({
    ...r,
    saldo_awal: num(r.saldo_awal), pencapaian: num(r.pencapaian), rasio: num(r.rasio),
    skor_kpi: num(r.skor_kpi), skor_terbobot: num(r.skor_terbobot),
    target_kpi3: num(r.target_kpi3), target_kpi4: num(r.target_kpi4), target_kpi5: num(r.target_kpi5),
  }));
}

export async function insentifKaryawan(nik: string, periode: string) {
  const rows = await q<any>(
    `SELECT kategori, saldo_awal, pencapaian, rasio, SUM(nominal) AS nominal
       FROM v_insentif_aktif
      WHERE nik = $1 AND periode = $2
      GROUP BY kategori, saldo_awal, pencapaian, rasio
      ORDER BY SUM(nominal) DESC`, [nik, periode]);
  return rows.map((r) => ({
    kategori: r.kategori, saldo_awal: num(r.saldo_awal), pencapaian: num(r.pencapaian),
    rasio: num(r.rasio), nominal: Number(r.nominal ?? 0),
  }));
}

/** Skor total dan insentif, termasuk perbandingan dengan periode sebelumnya. */
export async function ringkasan(nik: string, periode: string) {
  const [skor] = await q<any>(
    `SELECT COALESCE(SUM(skor_terbobot),0) AS skor FROM v_kpi_aktif WHERE nik=$1 AND periode=$2`,
    [nik, periode]);
  const [ins] = await q<any>(
    `SELECT COALESCE(SUM(nominal),0) AS total FROM v_insentif_aktif WHERE nik=$1 AND periode=$2`,
    [nik, periode]);

  const [lalu] = await q<any>(
    `SELECT COALESCE(SUM(k.skor_terbobot),0) AS skor,
            (SELECT COALESCE(SUM(nominal),0) FROM v_insentif_aktif
              WHERE nik=$1 AND periode = (SELECT MAX(periode) FROM v_kpi_aktif WHERE nik=$1 AND periode<$2)) AS insentif
       FROM v_kpi_aktif k
      WHERE k.nik=$1 AND k.periode = (SELECT MAX(periode) FROM v_kpi_aktif WHERE nik=$1 AND periode<$2)`,
    [nik, periode]);

  return {
    skor: Number(skor?.skor ?? 0),
    insentif: Number(ins?.total ?? 0),
    skorLalu: lalu ? Number(lalu.skor) : null,
    insentifLalu: lalu ? Number(lalu.insentif ?? 0) : null,
  };
}

export async function trenKpi(nik: string) {
  const rows = await q<any>(
    `SELECT periode, SUM(skor_terbobot) AS skor
       FROM v_kpi_aktif WHERE nik = $1
      GROUP BY periode ORDER BY periode DESC LIMIT 6`, [nik]);
  return rows.reverse().map((r) => ({ periode: r.periode, skor: Number(r.skor ?? 0) }));
}

/** Untuk atasan: anggota tim di cabang atau area yang sama. */
export async function timSaya(atasanNik: string, periode: string) {
  const [me] = await q<{ cabang: string; area: string; peran: string }>(
    `SELECT cabang, area, peran FROM app_user WHERE nik = $1`, [atasanNik]);
  if (!me) return { lingkup: "—", anggota: [] as any[] };

  const manajerArea = me.peran === "atasan" && !!me.area;
  const rows = await q<any>(
    `WITH skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k WHERE k.periode = $2 GROUP BY k.nik),
     ins AS (
       SELECT nik, SUM(nominal) AS insentif FROM v_insentif_aktif WHERE periode = $2 GROUP BY nik),
     lemah AS (
       SELECT DISTINCT ON (nik) nik, indikator
         FROM v_kpi_aktif WHERE periode = $2 ORDER BY nik, skor_kpi ASC NULLS LAST)
     SELECT u.nik, u.nama, u.jabatan, u.cabang,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif, l.indikator AS terlemah
       FROM app_user u
       LEFT JOIN skor s ON s.nik = u.nik
       LEFT JOIN ins  i ON i.nik = u.nik
       LEFT JOIN lemah l ON l.nik = u.nik
      WHERE u.aktif AND u.nik <> $1
        AND ${manajerArea ? "u.area = $3" : "u.cabang = $3"}
      ORDER BY COALESCE(s.skor,0) ASC`,
    [atasanNik, periode, manajerArea ? me.area : me.cabang]);

  return {
    lingkup: manajerArea ? `Area ${me.area}` : `Cabang ${me.cabang}`,
    anggota: rows.map((r) => ({
      ...r, skor: Number(r.skor), insentif: Number(r.insentif),
    })),
  };
}

/* ============================================================
 * FUNGSI UNTUK ADMIN — melihat KPI lintas cabang
 * ============================================================ */

/** Daftar cabang yang punya data pada satu periode, + ringkasannya. */
export async function cabangPeriode(periode: string) {
  const rows = await q<any>(
    `SELECT COALESCE(cabang,'(Tanpa cabang)') AS cabang,
            COUNT(DISTINCT nik)::int AS karyawan,
            ROUND(AVG(skor_bykaryawan),2) AS skor_rata
       FROM (
         SELECT cabang, nik, SUM(skor_terbobot) AS skor_bykaryawan
           FROM v_kpi_aktif WHERE periode = $1
          GROUP BY cabang, nik
       ) t
      GROUP BY cabang
      ORDER BY skor_rata ASC NULLS LAST`, [periode]);
  return rows.map((r) => ({
    cabang: r.cabang, karyawan: r.karyawan,
    skorRata: r.skor_rata === null ? null : Number(r.skor_rata),
  }));
}

/** Daftar karyawan pada satu cabang + skor & insentifnya (untuk admin). */
export async function karyawanCabang(periode: string, cabang: string) {
  const rows = await q<any>(
    `WITH skor AS (
       SELECT nik, SUM(skor_terbobot) AS skor FROM v_kpi_aktif
        WHERE periode = $1 AND COALESCE(cabang,'(Tanpa cabang)') = $2 GROUP BY nik),
     ins AS (
       SELECT nik, SUM(nominal) AS insentif FROM v_insentif_aktif
        WHERE periode = $1 GROUP BY nik),
     lemah AS (
       SELECT DISTINCT ON (nik) nik, indikator FROM v_kpi_aktif
        WHERE periode = $1 AND COALESCE(cabang,'(Tanpa cabang)') = $2
        ORDER BY nik, skor_kpi ASC NULLS LAST)
     SELECT k.nik, u.nama, u.jabatan,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif, l.indikator AS terlemah
       FROM (SELECT DISTINCT nik FROM v_kpi_aktif
              WHERE periode=$1 AND COALESCE(cabang,'(Tanpa cabang)')=$2) k
       LEFT JOIN app_user u ON u.nik = k.nik
       LEFT JOIN skor s ON s.nik = k.nik
       LEFT JOIN ins  i ON i.nik = k.nik
       LEFT JOIN lemah l ON l.nik = k.nik
      ORDER BY COALESCE(s.skor,0) ASC`, [periode, cabang]);
  return rows.map((r) => ({
    nik: r.nik, nama: r.nama ?? r.nik, jabatan: r.jabatan,
    skor: Number(r.skor), insentif: Number(r.insentif), terlemah: r.terlemah,
  }));
}

/** Indikator satu karyawan (dipakai admin untuk menelisik detail). */
export async function indikatorNik(nik: string, periode: string) {
  return indikatorKaryawan(nik, periode);
}
