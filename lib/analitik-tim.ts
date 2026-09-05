import { q } from "./db";
import { SQL_TIM_TERLIHAT } from "./hierarki";

/**
 * Analitik untuk atasan, dibatasi pada tim yang boleh dilihatnya.
 *
 * Semua kueri di sini bersandar pada SQL_TIM_TERLIHAT — aturan visibilitas
 * yang sama dengan halaman Tim Saya. Ini disengaja: kalau dasbor memakai
 * aturan sendiri, cepat atau lambat keduanya akan berbeda, dan atasan akan
 * melihat angka rata-rata yang memuat orang yang tidak boleh ia buka
 * satu-satu. Satu sumber kebenaran mencegah selisih itu muncul.
 */

/** Sub-kueri anggota tim yang terlihat oleh satu atasan. */
const TIM = `(${SQL_TIM_TERLIHAT})`;

export async function ringkasTim(atasanNik: string, periode: string) {
  const [r] = await q<any>(
    `WITH tim AS (SELECT nik FROM ${TIM}),
     skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 GROUP BY k.nik)
     SELECT (SELECT COUNT(*)::int FROM tim)                          AS anggota,
            (SELECT COUNT(*)::int FROM skor)                         AS dinilai,
            (SELECT ROUND(AVG(skor),2) FROM skor)                    AS skor_rata,
            (SELECT COUNT(*)::int FROM skor WHERE skor < 3)          AS bawah,
            (SELECT COUNT(*)::int FROM skor WHERE skor >= 4)         AS baik,
            (SELECT COALESCE(SUM(i.nominal),0) FROM v_insentif_aktif i
              JOIN tim t ON t.nik = i.nik WHERE i.periode = $2)      AS insentif`,
    [atasanNik, periode]);

  return {
    anggota: Number(r?.anggota ?? 0),
    dinilai: Number(r?.dinilai ?? 0),
    skorRata: r?.skor_rata === null || r?.skor_rata === undefined ? null : Number(r.skor_rata),
    bawah: Number(r?.bawah ?? 0),
    baik: Number(r?.baik ?? 0),
    insentif: Number(r?.insentif ?? 0),
  };
}

/** Skor rata-rata tiap cabang di dalam tim — untuk grafik batang. */
export async function cabangTim(atasanNik: string, periode: string) {
  const rows = await q<any>(
    `WITH tim AS (SELECT nik, cabang FROM ${TIM}),
     skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 GROUP BY k.nik)
     SELECT COALESCE(NULLIF(BTRIM(t.cabang),''),'(TANPA CABANG)') AS cabang,
            COUNT(DISTINCT t.nik)::int AS orang,
            ROUND(AVG(s.skor),2)       AS skor,
            COUNT(*) FILTER (WHERE s.skor < 3)::int AS bawah
       FROM tim t LEFT JOIN skor s ON s.nik = t.nik
      GROUP BY 1 HAVING COUNT(s.nik) > 0
      ORDER BY 3 DESC NULLS LAST`,
    [atasanNik, periode]);

  return rows.map((r) => ({
    cabang: r.cabang, orang: Number(r.orang),
    skor: r.skor === null ? null : Number(r.skor),
    bawah: Number(r.bawah),
  }));
}

/** Sebaran skor anggota tim per pita 0,5 — untuk grafik kolom. */
export async function sebaranTim(atasanNik: string, periode: string) {
  const rows = await q<any>(
    `WITH tim AS (SELECT nik, cabang FROM ${TIM}),
     skor AS (
       SELECT k.nik, MAX(t.cabang) AS cabang, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 GROUP BY k.nik)
     SELECT FLOOR(LEAST(skor,5)*2)/2 AS pita,
            COUNT(*)::int            AS orang,
            string_agg(DISTINCT COALESCE(NULLIF(BTRIM(cabang),''),'(TANPA CABANG)'), ', ')
              AS cabang
       FROM skor GROUP BY 1 ORDER BY 1`,
    [atasanNik, periode]);

  return rows.map((r) => ({
    pita: Number(r.pita), orang: Number(r.orang), cabang: r.cabang as string,
  }));
}

/** Indikator terlemah di dalam tim — yang paling banyak menahan skor. */
export async function indikatorTim(atasanNik: string, periode: string, n = 10) {
  const rows = await q<any>(
    `WITH tim AS (SELECT nik FROM ${TIM})
     SELECT k.indikator,
            ROUND(AVG(k.skor_kpi),2) AS skor,
            COUNT(*)::int            AS orang,
            COUNT(*) FILTER (WHERE k.skor_kpi < 3)::int AS bawah
       FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
      WHERE k.periode = $2 AND k.skor_kpi IS NOT NULL
      GROUP BY k.indikator
      ORDER BY 2 ASC
      LIMIT ${Number(n) || 10}`,
    [atasanNik, periode]);

  return rows.map((r) => ({
    indikator: r.indikator,
    skor: r.skor === null ? null : Number(r.skor),
    orang: Number(r.orang), bawah: Number(r.bawah),
  }));
}

/** Tren skor rata-rata tim beberapa periode terakhir. */
export async function trenTim(atasanNik: string, batas = 6) {
  const rows = await q<any>(
    `WITH tim AS (SELECT nik FROM ${TIM}),
     per_periode AS (
       SELECT k.periode, k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        GROUP BY k.periode, k.nik)
     SELECT periode, ROUND(AVG(skor),2) AS skor, COUNT(*)::int AS orang
       FROM per_periode GROUP BY periode
      ORDER BY periode DESC LIMIT ${Number(batas) || 6}`,
    [atasanNik]);

  return rows
    .map((r) => ({
      periode: r.periode, skor: r.skor === null ? null : Number(r.skor),
      orang: Number(r.orang),
    }))
    .reverse();
}
