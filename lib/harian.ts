import { q } from "@/lib/db";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { SQL_TIM_TERLIHAT } from "@/lib/hierarki";

/**
 * KPI & insentif harian — progres berjalan, bukan angka final.
 *
 * Tidak ada perhitungan baru di sini. Tiap tarikan API sudah menghitung
 * ulang seluruh indikator ke kpi_row untuk periode berjalan, jadi angka
 * "hari ini" sebenarnya sudah tersimpan; yang kurang selama ini hanyalah
 * cara menyajikannya sebagai sesuatu yang masih bergerak.
 *
 * Perbedaannya dengan halaman Data KPI karena itu bukan sumber datanya,
 * melainkan bingkainya: di sini hanya baris ber-sumber 'api' pada bulan
 * berjalan, selalu disertai kapan terakhir ditarik, dan diberi peringatan
 * bahwa angkanya masih akan berubah. Data mentah di-TRUNCATE tiap tarikan,
 * sehingga yang bisa ditampilkan memang hanya posisi terkini — bukan
 * riwayat per hari.
 */

/** Periode bulan berjalan; semua fungsi di berkas ini memakainya. */
export const periodeHarian = periodeBerjalan;

export type StatusHarian = {
  /** Kapan data mentah terakhir ditarik dari API. */
  ditarik: Date | null;
  /** Tanggal posisi data menurut API (tgl_tarik), bisa beda dari waktu tarik. */
  tglData: Date | null;
  /** Kapan indikator terakhir dihitung ulang. */
  dihitung: Date | null;
  barisMentah: number;
  karyawan: number;
  indikator: number;
};

/** Ringkas keadaan tarikan terakhir, untuk kartu status di atas halaman. */
export async function statusHarian(): Promise<StatusHarian> {
  const periode = periodeHarian();
  const [r] = await q<any>(
    `SELECT
       (SELECT MAX(ditarik_pada) FROM data_mentah)              AS ditarik,
       (SELECT MAX(tgl_tarik)    FROM data_mentah)              AS tgl_data,
       (SELECT COUNT(*)::int     FROM data_mentah)              AS baris_mentah,
       (SELECT MAX(dihitung_pada) FROM kpi_row
         WHERE sumber = 'api' AND periode = $1)                 AS dihitung,
       (SELECT COUNT(DISTINCT nik)::int FROM kpi_row
         WHERE sumber = 'api' AND periode = $1)                 AS karyawan,
       (SELECT COUNT(DISTINCT indikator_id)::int FROM kpi_row
         WHERE sumber = 'api' AND periode = $1)                 AS indikator`,
    [periode]);

  return {
    ditarik: r?.ditarik ? new Date(r.ditarik) : null,
    tglData: r?.tgl_data ? new Date(r.tgl_data) : null,
    dihitung: r?.dihitung ? new Date(r.dihitung) : null,
    barisMentah: r?.baris_mentah ?? 0,
    karyawan: r?.karyawan ?? 0,
    indikator: r?.indikator ?? 0,
  };
}

/**
 * Cabang beserta rata-rata skor berjalan.
 *
 * Dibatasi ke baris 'api' — berbeda dari cabangPeriode() yang membaca
 * v_kpi_aktif. Kalau bulan berjalan kebetulan juga sudah punya unggahan
 * Excel, mencampur keduanya membuat angka harian melompat tanpa sebab
 * yang bisa dijelaskan.
 */
export async function cabangHarian() {
  const periode = periodeHarian();
  const rows = await q<any>(
    `WITH per_karyawan AS (
       SELECT norm_wilayah(cabang) AS cabang, nik, SUM(skor_terbobot) AS skor
         FROM kpi_row
        WHERE sumber = 'api' AND periode = $1
        GROUP BY 1, nik
     ),
     area_cabang AS (
       SELECT DISTINCT ON (norm_wilayah(cabang))
              norm_wilayah(cabang) AS cabang, norm_wilayah(area) AS area
         FROM app_user
        WHERE cabang IS NOT NULL AND area IS NOT NULL
        GROUP BY norm_wilayah(cabang), norm_wilayah(area)
        ORDER BY norm_wilayah(cabang), COUNT(*) DESC
     )
     SELECT COALESCE(p.cabang,'(TANPA CABANG)') AS cabang,
            COALESCE(a.area,'(TANPA AREA)')     AS area,
            COUNT(DISTINCT p.nik)::int          AS karyawan,
            ROUND(AVG(p.skor),2)                AS skor_rata
       FROM per_karyawan p
       LEFT JOIN area_cabang a ON a.cabang = p.cabang
      GROUP BY 1, 2
      ORDER BY 2, 1`, [periode]);

  return rows.map((r) => ({
    cabang: r.cabang, area: r.area, karyawan: r.karyawan,
    skorRata: r.skor_rata === null ? null : Number(r.skor_rata),
  }));
}

/** Karyawan satu cabang beserta progres skor dan proyeksi insentifnya. */
export async function karyawanHarian(cabang: string) {
  const periode = periodeHarian();
  const rows = await q<any>(
    `WITH skor AS (
       SELECT nik, SUM(skor_terbobot) AS skor FROM kpi_row
        WHERE sumber='api' AND periode=$1
          AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') = $2
        GROUP BY nik),
     ins AS (
       SELECT nik, SUM(nominal) AS insentif FROM insentif_row
        WHERE sumber='api' AND periode=$1 GROUP BY nik),
     lemah AS (
       SELECT DISTINCT ON (nik) nik, indikator FROM kpi_row
        WHERE sumber='api' AND periode=$1
          AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') = $2
          AND skor_kpi IS NOT NULL
        ORDER BY nik, skor_kpi ASC),
     -- Syarat nominal bersyarat yang belum lolos, supaya di daftar pun
     -- sudah terlihat siapa yang insentifnya tertahan dan kenapa.
     tertahan AS (
       SELECT nik, string_agg(DISTINCT gerbang_gagal, '; ') AS sebab
         FROM kpi_row
        WHERE sumber='api' AND periode=$1 AND peran='nominal'
          AND gerbang_gagal IS NOT NULL
          AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)') = $2
        GROUP BY nik)
     SELECT k.nik, COALESCE(u.nama, k.nama_file) AS nama,
            COALESCE(u.jabatan, k.jabatan_file) AS jabatan,
            COALESCE(s.skor,0) AS skor, COALESCE(i.insentif,0) AS insentif,
            l.indikator AS terlemah, t.sebab
       FROM (SELECT DISTINCT ON (nik) nik, nama AS nama_file, jabatan AS jabatan_file
               FROM kpi_row
              WHERE sumber='api' AND periode=$1
                AND COALESCE(UPPER(TRIM(cabang)),'(TANPA CABANG)')=$2
              ORDER BY nik) k
       LEFT JOIN app_user u ON u.nik = k.nik
       LEFT JOIN skor s ON s.nik = k.nik
       LEFT JOIN ins  i ON i.nik = k.nik
       LEFT JOIN lemah l ON l.nik = k.nik
       LEFT JOIN tertahan t ON t.nik = k.nik
      ORDER BY COALESCE(s.skor,0) ASC`, [periode, cabang]);

  return rows.map((r) => ({
    nik: r.nik, nama: r.nama ?? r.nik, jabatan: r.jabatan,
    skor: Number(r.skor), insentif: Number(r.insentif),
    terlemah: r.terlemah as string | null,
    sebab: r.sebab as string | null,
  }));
}

/**
 * Progres satu orang: tiap indikator yang terdaftar untuk jabatan+produknya.
 *
 * Perannya ikut dibawa supaya tampilan bisa memisahkan mana yang menilai
 * KPI, mana yang membayar, dan mana yang cuma bahan syarat — tiga hal yang
 * kalau dicampur dalam satu tabel membuat pembacanya salah menyimpulkan
 * indikator mana yang perlu dikejar.
 */
export async function progresNik(nik: string) {
  const periode = periodeHarian();
  const rows = await q<any>(
    `SELECT k.indikator, k.produk, k.satuan, k.pencapaian, k.skor_kpi,
            k.bobot, k.bobot_insentif, k.skor_terbobot, k.skor_terbobot_ins,
            k.target_kpi3, k.target_kpi4, k.target_kpi5,
            k.peran, k.nominal_baris, k.gerbang_gagal, k.catatan
       FROM kpi_row k
      WHERE k.sumber = 'api' AND k.periode = $1 AND k.nik = $2
      ORDER BY
        CASE k.peran WHEN 'nominal' THEN 0 WHEN 'kpi' THEN 1 WHEN 'reguler' THEN 1
                     WHEN 'reward' THEN 2 WHEN 'penalty' THEN 3
                     WHEN 'tier' THEN 4 ELSE 5 END,
        k.skor_kpi ASC NULLS LAST, k.indikator`,
    [periode, nik]);

  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({
    indikator: r.indikator as string,
    produk: r.produk as string | null,
    satuan: r.satuan as string | null,
    pencapaian: num(r.pencapaian),
    skorKpi: num(r.skor_kpi),
    bobot: num(r.bobot),
    bobotInsentif: num(r.bobot_insentif),
    skorTerbobot: num(r.skor_terbobot),
    skorTerbobotIns: num(r.skor_terbobot_ins),
    target3: num(r.target_kpi3),
    target4: num(r.target_kpi4),
    target5: num(r.target_kpi5),
    peran: (r.peran ?? "kpi") as string,
    nominalBaris: num(r.nominal_baris),
    gerbangGagal: r.gerbang_gagal as string | null,
    catatan: r.catatan as string | null,
  }));
}

/** Ringkasan satu orang: skor berjalan dan proyeksi insentifnya. */
export async function ringkasHarian(nik: string) {
  const periode = periodeHarian();
  const [r] = await q<any>(
    `SELECT
       (SELECT SUM(skor_terbobot) FROM kpi_row
         WHERE sumber='api' AND periode=$1 AND nik=$2)              AS skor,
       (SELECT COUNT(*)::int FROM kpi_row
         WHERE sumber='api' AND periode=$1 AND nik=$2
           AND skor_kpi IS NOT NULL AND skor_kpi < 3)               AS bawah,
       (SELECT COUNT(*)::int FROM kpi_row
         WHERE sumber='api' AND periode=$1 AND nik=$2
           AND skor_kpi IS NOT NULL)                                AS dinilai,
       (SELECT COALESCE(SUM(nominal),0) FROM insentif_row
         WHERE sumber='api' AND periode=$1 AND nik=$2)              AS insentif,
       (SELECT COALESCE(SUM(nominal_dasar),0) FROM insentif_row
         WHERE sumber='api' AND periode=$1 AND nik=$2)              AS dasar,
       (SELECT COALESCE(SUM(nominal_reward),0) FROM insentif_row
         WHERE sumber='api' AND periode=$1 AND nik=$2)              AS reward,
       (SELECT COALESCE(SUM(nominal_penalty),0) FROM insentif_row
         WHERE sumber='api' AND periode=$1 AND nik=$2)              AS penalty`,
    [periode, nik]);

  return {
    skor: r?.skor === null || r?.skor === undefined ? null : Number(r.skor),
    bawah: r?.bawah ?? 0,
    dinilai: r?.dinilai ?? 0,
    insentif: Number(r?.insentif ?? 0),
    dasar: Number(r?.dasar ?? 0),
    reward: Number(r?.reward ?? 0),
    penalty: Number(r?.penalty ?? 0),
  };
}

/**
 * Tim seorang atasan, progres berjalan.
 *
 * Lingkup siapa-melihat-siapa memakai SQL_TIM_TERLIHAT yang sama dengan
 * halaman Tim Saya — bukan aturan sendiri. Dua definisi "tim" yang hidup
 * berdampingan pasti akan menyimpang cepat atau lambat, dan menyimpangnya
 * berupa orang yang seharusnya tidak terlihat menjadi terlihat.
 */
export async function timHarian(atasanNik: string) {
  const periode = periodeHarian();
  const rows = await q<any>(
    `WITH tim AS (${SQL_TIM_TERLIHAT})
     , skor AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor
         FROM kpi_row k JOIN tim t ON t.nik = k.nik
        WHERE k.sumber='api' AND k.periode=$2 GROUP BY k.nik)
     , ins AS (
       SELECT v.nik, SUM(v.nominal) AS insentif
         FROM insentif_row v JOIN tim t ON t.nik = v.nik
        WHERE v.sumber='api' AND v.periode=$2 GROUP BY v.nik)
     , lemah AS (
       SELECT DISTINCT ON (k.nik) k.nik, k.indikator
         FROM kpi_row k JOIN tim t ON t.nik = k.nik
        WHERE k.sumber='api' AND k.periode=$2 AND k.skor_kpi IS NOT NULL
        ORDER BY k.nik, k.skor_kpi ASC)
     SELECT t.nik, t.nama, t.jabatan, t.cabang, t.area,
            s.skor, COALESCE(i.insentif,0) AS insentif, l.indikator AS terlemah
       FROM tim t
       LEFT JOIN skor s ON s.nik = t.nik
       LEFT JOIN ins  i ON i.nik = t.nik
       LEFT JOIN lemah l ON l.nik = t.nik
      ORDER BY s.skor ASC NULLS LAST, t.nama`,
    [atasanNik, periode]);

  return rows.map((r) => ({
    nik: r.nik as string, nama: r.nama as string,
    jabatan: r.jabatan as string | null, cabang: r.cabang as string | null,
    area: r.area as string | null,
    skor: r.skor === null ? null : Number(r.skor),
    insentif: Number(r.insentif),
    terlemah: r.terlemah as string | null,
  }));
}
