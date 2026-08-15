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
  /**
   * Satu kueri, bukan tiga yang berurutan.
   *
   * Ketiga angka (skor bulan ini, insentif bulan ini, dan pembanding bulan
   * lalu) tidak saling bergantung, tapi sebelumnya dijalankan satu per satu
   * — tiap perjalanan ke Neon menambah waktu tunggu sebelum halaman bisa
   * dirender. Digabung dengan sub-kueri, semuanya selesai dalam sekali
   * perjalanan.
   */
  const [r] = await q<any>(
    `WITH lalu_periode AS (
       SELECT MAX(periode) AS periode FROM v_kpi_aktif WHERE nik=$1 AND periode<$2
     )
     SELECT
       (SELECT COALESCE(SUM(skor_terbobot),0) FROM v_kpi_aktif
         WHERE nik=$1 AND periode=$2) AS skor,
       (SELECT COALESCE(SUM(nominal),0) FROM v_insentif_aktif
         WHERE nik=$1 AND periode=$2) AS insentif,
       (SELECT periode FROM lalu_periode) AS periode_lalu,
       (SELECT COALESCE(SUM(skor_terbobot),0) FROM v_kpi_aktif
         WHERE nik=$1 AND periode=(SELECT periode FROM lalu_periode)) AS skor_lalu,
       (SELECT COALESCE(SUM(nominal),0) FROM v_insentif_aktif
         WHERE nik=$1 AND periode=(SELECT periode FROM lalu_periode)) AS insentif_lalu`,
    [nik, periode]);

  // periode_lalu NULL berarti belum ada bulan pembanding sama sekali.
  const adaPembanding = r?.periode_lalu != null;

  return {
    skor: Number(r?.skor ?? 0),
    insentif: Number(r?.insentif ?? 0),
    skorLalu: adaPembanding ? Number(r.skor_lalu ?? 0) : null,
    insentifLalu: adaPembanding ? Number(r.insentif_lalu ?? 0) : null,
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
    // Pengamat yang membawahi banyak cabang (AM/ACH) butuh tampilan yang
    // dikelompokkan; yang hanya satu cabang tidak perlu.
    seArea: profil?.lingkup.jenis === "area" || profil?.lingkup.jenis === "semua",
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

/**
 * Ringkasan kinerja unit untuk atasan.
 *
 * Dipakai di Dasbor Saya milik BM/DBM/ACH/AM yang tidak punya KPI pribadi:
 * yang relevan bagi mereka bukan skor sendiri, melainkan kondisi unit yang
 * dipimpin. Semua angka diambil dalam SATU kueri — bila dipecah menjadi
 * beberapa (rata-rata, sebaran, terlemah, per cabang), tiap bagian menambah
 * perjalanan bolak-balik ke Neon dan halaman jadi lambat.
 */
export async function ringkasanUnit(atasanNik: string, periode: string) {
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
     , periode_lalu AS (
       SELECT MAX(k.periode) AS periode
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode < $2)
     , skor_lalu AS (
       SELECT AVG(s) AS rata FROM (
         SELECT SUM(k.skor_terbobot) AS s
           FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
          WHERE k.periode = (SELECT periode FROM periode_lalu)
          GROUP BY k.nik) x)
     -- indikator yang paling sering gagal di unit ini
     , lemah_unit AS (
       SELECT k.indikator, COUNT(*)::int AS jumlah
         FROM v_kpi_aktif k JOIN tim t ON t.nik = k.nik
        WHERE k.periode = $2 AND k.skor_kpi IS NOT NULL AND k.skor_kpi < 3
        GROUP BY k.indikator ORDER BY 2 DESC LIMIT 5)
     , per_cabang AS (
       SELECT COALESCE(t.cabang,'(TANPA CABANG)') AS cabang,
              COUNT(DISTINCT t.nik)::int AS orang,
              AVG(COALESCE(s.skor,0)) AS rata,
              COUNT(*) FILTER (WHERE COALESCE(s.skor,0) < 3)::int AS dibawah
         FROM tim t LEFT JOIN skor s ON s.nik = t.nik
        GROUP BY 1 ORDER BY 3 ASC)
     SELECT
       (SELECT COUNT(*) FROM tim)::int AS orang,
       (SELECT COALESCE(AVG(COALESCE(s.skor,0)),0)
          FROM tim t LEFT JOIN skor s ON s.nik = t.nik) AS rata,
       (SELECT rata FROM skor_lalu) AS rata_lalu,
       (SELECT COALESCE(SUM(i.insentif),0) FROM ins i) AS insentif,
       (SELECT COUNT(*) FROM tim t LEFT JOIN skor s ON s.nik = t.nik
         WHERE COALESCE(s.skor,0) < 3)::int AS dibawah3,
       (SELECT COUNT(*) FROM tim t LEFT JOIN skor s ON s.nik = t.nik
         WHERE COALESCE(s.skor,0) >= 3 AND COALESCE(s.skor,0) < 4)::int AS di3,
       (SELECT COUNT(*) FROM tim t LEFT JOIN skor s ON s.nik = t.nik
         WHERE COALESCE(s.skor,0) >= 4 AND COALESCE(s.skor,0) < 5)::int AS di4,
       (SELECT COUNT(*) FROM tim t LEFT JOIN skor s ON s.nik = t.nik
         WHERE COALESCE(s.skor,0) >= 5)::int AS di5,
       (SELECT COALESCE(json_agg(json_build_object(
                 'nik', y.nik, 'nama', y.nama, 'jabatan', y.jabatan,
                 'cabang', y.cabang, 'skor', y.skor)), '[]'::json)
          FROM (SELECT t.nik, t.nama, t.jabatan, t.cabang, COALESCE(s.skor,0) AS skor
                  FROM tim t LEFT JOIN skor s ON s.nik = t.nik
                 ORDER BY COALESCE(s.skor,0) ASC LIMIT 5) y) AS terendah,
       (SELECT COALESCE(json_agg(json_build_object(
                 'indikator', l.indikator, 'jumlah', l.jumlah)), '[]'::json)
          FROM lemah_unit l) AS indikator_lemah,
       (SELECT COALESCE(json_agg(json_build_object(
                 'cabang', c.cabang, 'orang', c.orang,
                 'rata', c.rata, 'dibawah', c.dibawah)), '[]'::json)
          FROM per_cabang c) AS cabang`,
    [atasanNik, periode]);

  const r = rows[0] ?? {};
  const profil = await profilHierarki(atasanNik);

  return {
    lingkup: !profil ? "—"
      : profil.lingkup.jenis === "semua" ? "Semua cabang"
      : profil.lingkup.jenis === "area" ? `Area ${profil.lingkup.nilai}`
      : `Cabang ${profil.lingkup.nilai}`,
    seArea: profil?.lingkup.jenis === "area",
    orang: Number(r.orang ?? 0),
    rata: Number(r.rata ?? 0),
    rataLalu: r.rata_lalu == null ? null : Number(r.rata_lalu),
    insentif: Number(r.insentif ?? 0),
    sebaran: {
      dibawah3: Number(r.dibawah3 ?? 0), di3: Number(r.di3 ?? 0),
      di4: Number(r.di4 ?? 0), di5: Number(r.di5 ?? 0),
    },
    terendah: (r.terendah ?? []).map((x: any) => ({ ...x, skor: Number(x.skor) })),
    indikatorLemah: (r.indikator_lemah ?? []) as { indikator: string; jumlah: number }[],
    cabang: (r.cabang ?? []).map((x: any) => ({
      cabang: x.cabang, orang: Number(x.orang),
      rata: Number(x.rata ?? 0), dibawah: Number(x.dibawah),
    })),
  };
}

/* ============================================================
 * FUNGSI UNTUK ADMIN — melihat KPI lintas cabang
 * ============================================================ */

/** Daftar cabang yang punya data pada satu periode, + ringkasannya. */
export async function cabangPeriode(periode: string) {
  /**
   * Cabang beserta areanya.
   *
   * Area diambil dari data pegawai (app_user), bukan dari berkas KPI, karena
   * berkas impor tidak memuat kolom area. Cabang yang tidak punya satu pun
   * pegawai terdaftar tetap ditampilkan di kelompok "(TANPA AREA)" supaya
   * datanya tidak hilang diam-diam dari layar admin.
   */
  const rows = await q<any>(
    `WITH per_karyawan AS (
       SELECT norm_wilayah(cabang) AS cabang, nik, SUM(skor_terbobot) AS skor
         FROM v_kpi_aktif WHERE periode = $1
        GROUP BY norm_wilayah(cabang), nik
     ),
     area_cabang AS (
       -- Area yang paling banyak dipakai pegawai di cabang itu
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
