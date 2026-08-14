import { unstable_cache } from "next/cache";
import { q } from "./db";

export type Indikator = {
  produk: string | null; indikator: string;
  saldo_awal: number | null; pencapaian: number | null; rasio: number | null;
  skor_kpi: number | null; skor_terbobot: number | null;
  target_kpi3: number | null; target_kpi4: number | null; target_kpi5: number | null;
  catatan: string | null;
};

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

/**
 * Periode yang sudah diterbitkan, terbaru dulu.
 *
 * Dipanggil hampir di setiap halaman hanya untuk mengisi pemilih periode,
 * padahal isinya berubah sebulan sekali saat batch baru terbit. Tanpa cache,
 * setiap kunjungan menambah satu perjalanan bolak-balik ke Neon sebelum
 * halaman bisa dirender. Cache disegarkan lewat tag "batch-kpi" pada saat
 * publish/rollback, jadi data tidak pernah basi.
 */
export const periodeTersedia = unstable_cache(
  async () =>
    q<{ periode: string; diterbitkan_pada: string; nama_file: string; total: number }>(
      `SELECT b.periode, b.diterbitkan_pada, b.nama_file, b.baris_valid AS total
         FROM import_batch b
        WHERE b.tipe = 'kpi' AND b.status = 'published'
        ORDER BY b.periode DESC LIMIT 12`),
  ["periode-tersedia"],
  { revalidate: 3600, tags: ["batch-kpi"] },
);

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
  /**
   * Satu kueri, bukan dua.
   *
   * Sebelumnya: kueri pertama mengambil cabang/area atasan, kueri kedua
   * baru mengambil anggota — dua perjalanan bolak-balik berurutan ke Neon.
   * Lebih berat lagi, ketiga CTE mengagregasi v_kpi_aktif/v_insentif_aktif
   * untuk SELURUH karyawan pada periode itu, padahal yang dipakai hanya
   * satu cabang; penyaringan cabang baru terjadi di akhir.
   *
   * Sekarang CTE `tim` menentukan anggota lebih dulu, dan agregasi skor,
   * insentif, serta indikator terlemah hanya berjalan untuk NIK anggota itu.
   * Logika lingkup (cabang vs area) dipindah ke SQL agar hasilnya identik:
   * area hanya dipakai bila atasan tidak terikat satu cabang.
   */
  const rows = await q<any>(
    `WITH me AS (
       SELECT cabang, area, peran,
              (peran = 'atasan' AND cabang IS NULL AND area IS NOT NULL) AS manajer_area
         FROM app_user WHERE nik = $1),
     tim AS (
       SELECT u.nik, u.nama, u.jabatan, u.cabang
         FROM app_user u CROSS JOIN me
        WHERE u.aktif AND u.nik <> $1
          AND CASE WHEN me.manajer_area THEN u.area = me.area
                   ELSE u.cabang = me.cabang END),
     skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 GROUP BY k.nik),
     ins AS (
       SELECT v.nik, SUM(v.nominal) AS insentif
         FROM v_insentif_aktif v JOIN tim t ON t.nik = v.nik
        WHERE v.periode = $2 GROUP BY v.nik),
     lemah AS (
       SELECT DISTINCT ON (k.nik) k.nik, k.indikator
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 ORDER BY k.nik, k.skor_kpi ASC NULLS LAST)
     SELECT t.nik, t.nama, t.jabatan, t.cabang,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif,
            l.indikator AS terlemah,
            me.manajer_area, me.area AS me_area, me.cabang AS me_cabang
       FROM tim t CROSS JOIN me
       LEFT JOIN skor s ON s.nik = t.nik
       LEFT JOIN ins  i ON i.nik = t.nik
       LEFT JOIN lemah l ON l.nik = t.nik
      ORDER BY COALESCE(s.skor,0) ASC`,
    [atasanNik, periode]);

  // Tidak ada baris bisa berarti atasan tidak ditemukan ATAU timnya kosong.
  // Keduanya ditampilkan sebagai daftar kosong, sama seperti perilaku lama.
  if (!rows.length) {
    const [me] = await q<{ cabang: string; area: string; peran: string }>(
      `SELECT cabang, area, peran FROM app_user WHERE nik = $1`, [atasanNik]);
    if (!me) return { lingkup: "—", anggota: [] as any[] };
    const manajerArea = me.peran === "atasan" && !me.cabang && !!me.area;
    return {
      lingkup: manajerArea ? `Area ${me.area}` : `Cabang ${me.cabang}`,
      anggota: [] as any[],
    };
  }

  const k = rows[0];
  return {
    lingkup: k.manajer_area ? `Area ${k.me_area}` : `Cabang ${k.me_cabang}`,
    anggota: rows.map((r) => ({
      nik: r.nik, nama: r.nama, jabatan: r.jabatan, cabang: r.cabang,
      terlemah: r.terlemah,
      skor: Number(r.skor), insentif: Number(r.insentif),
    })),
  };
}

/* ============================================================
 * FUNGSI UNTUK ADMIN — melihat KPI lintas cabang
 * ============================================================ */

/** Daftar cabang yang punya data pada satu periode, + ringkasannya. */
export async function cabangPeriode(periode: string) {
  const rows = await q<any>(
    `SELECT COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') AS cabang,
            COUNT(DISTINCT nik)::int AS karyawan,
            ROUND(AVG(skor_bykaryawan),2) AS skor_rata
       FROM (
         SELECT UPPER(TRIM(cabang)) AS cabang, nik, SUM(skor_terbobot) AS skor_bykaryawan
           FROM v_kpi_aktif WHERE periode = $1
          GROUP BY UPPER(TRIM(cabang)), nik
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
        WHERE periode = $1 AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') = $2 GROUP BY nik),
     ins AS (
       SELECT nik, SUM(nominal) AS insentif FROM v_insentif_aktif
        WHERE periode = $1 GROUP BY nik),
     lemah AS (
       SELECT DISTINCT ON (nik) nik, indikator FROM v_kpi_aktif
        WHERE periode = $1 AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') = $2
        ORDER BY nik, skor_kpi ASC NULLS LAST)
     SELECT k.nik, u.nama, u.jabatan,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif, l.indikator AS terlemah
       FROM (SELECT DISTINCT nik FROM v_kpi_aktif
              WHERE periode=$1 AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)')=$2) k
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

/** Semua indikator untuk sekumpulan NIK sekaligus (tampilan detail Tim saya). */
export async function indikatorBanyakNik(niks: string[], periode: string) {
  if (!niks.length) return new Map<string, any[]>();
  const rows = await q<any>(
    `SELECT nik, indikator, produk, saldo_awal, pencapaian, rasio,
            skor_kpi, target_kpi3, target_kpi4, target_kpi5
       FROM v_kpi_aktif
      WHERE periode = $1 AND nik = ANY($2)
      ORDER BY nik, skor_kpi ASC NULLS FIRST`, [periode, niks]);
  const peta = new Map<string, any[]>();
  for (const r of rows) {
    const arr = peta.get(r.nik) ?? [];
    arr.push({
      indikator: r.indikator, produk: r.produk,
      saldo_awal: r.saldo_awal === null ? null : Number(r.saldo_awal),
      pencapaian: r.pencapaian === null ? null : Number(r.pencapaian),
      rasio: r.rasio === null ? null : Number(r.rasio),
      skor_kpi: r.skor_kpi === null ? null : Number(r.skor_kpi),
      target_kpi3: r.target_kpi3 === null ? null : Number(r.target_kpi3),
      target_kpi4: r.target_kpi4 === null ? null : Number(r.target_kpi4),
      target_kpi5: r.target_kpi5 === null ? null : Number(r.target_kpi5),
    });
    peta.set(r.nik, arr);
  }
  return peta;
}
