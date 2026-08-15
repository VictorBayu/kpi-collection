import { unstable_cache } from "next/cache";
import { q } from "./db";
import { SQL_TIM_TERLIHAT, profilHierarki } from "./hierarki";

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

/**
 * Untuk atasan: anggota yang boleh dilihat menurut hierarki jabatan.
 *
 * Bukan lagi "semua orang satu cabang". Syaratnya dua, lihat lib/hierarki.ts:
 * jabatan pengamat harus ada di rantai atasan si target (dan hanya melihat
 * ke bawah), DAN wilayahnya cocok — cabang untuk atasan cabang, area untuk
 * AM/ACH.
 *
 * Anggota dikelompokkan per level supaya atasan bisa membedakan mana
 * stafnya sendiri dan mana atasan di bawahnya.
 */
export async function timSaya(atasanNik: string, periode: string) {
  const rows = await q<any>(
    `WITH tim AS (${SQL_TIM_TERLIHAT})
     , skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 GROUP BY k.nik)
     , ins AS (
       SELECT v.nik, SUM(v.nominal) AS insentif
         FROM v_insentif_aktif v JOIN tim t ON t.nik = v.nik
        WHERE v.periode = $2 GROUP BY v.nik)
     , lemah AS (
       SELECT DISTINCT ON (k.nik) k.nik, k.indikator
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 ORDER BY k.nik, k.skor_kpi ASC NULLS LAST)
     SELECT t.nik, t.nama, t.jabatan, t.jabatan_master, t.cabang, t.area,
            t.level, COALESCE(t.urutan,0) AS urutan,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif,
            l.indikator AS terlemah
       FROM tim t
       LEFT JOIN skor s ON s.nik = t.nik
       LEFT JOIN ins  i ON i.nik = t.nik
       LEFT JOIN lemah l ON l.nik = t.nik
      ORDER BY COALESCE(t.urutan,0) DESC, COALESCE(s.skor,0) ASC`,
    [atasanNik, periode]);

  const profil = await profilHierarki(atasanNik);
  const lingkup = !profil ? "—"
    : profil.lingkup.jenis === "semua" ? "Semua cabang"
    : profil.lingkup.jenis === "area" ? `Area ${profil.lingkup.nilai}`
    : `Cabang ${profil.lingkup.nilai}`;

  return {
    lingkup,
    jabatanSaya: profil?.jabatanMaster ?? null,
    levelSaya: profil?.level ?? null,
    anggota: rows.map((r) => ({
      nik: r.nik, nama: r.nama, jabatan: r.jabatan,
      jabatanMaster: r.jabatan_master, cabang: r.cabang, area: r.area,
      level: r.level, urutan: Number(r.urutan),
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
     SELECT k.nik, COALESCE(u.nama, k.nama_file) AS nama,
            COALESCE(u.jabatan, k.jabatan_file) AS jabatan,
            (u.nik IS NULL) AS tanpa_akun,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif, l.indikator AS terlemah
       FROM (SELECT DISTINCT ON (nik) nik, nama AS nama_file, jabatan AS jabatan_file
               FROM v_kpi_aktif
              WHERE periode=$1 AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)')=$2
              ORDER BY nik) k
       LEFT JOIN app_user u ON u.nik = k.nik
       LEFT JOIN skor s ON s.nik = k.nik
       LEFT JOIN ins  i ON i.nik = k.nik
       LEFT JOIN lemah l ON l.nik = k.nik
      ORDER BY COALESCE(s.skor,0) ASC`, [periode, cabang]);
  return rows.map((r) => ({
    nik: r.nik, nama: r.nama ?? r.nik, jabatan: r.jabatan,
    // Baris dari Excel yang NIK-nya belum punya akun login. Datanya tetap
    // tersimpan dan terlihat admin, ditandai agar mudah ditindaklanjuti.
    tanpaAkun: Boolean(r.tanpa_akun),
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
