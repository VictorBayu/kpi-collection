import { q } from "./db";

/**
 * Kueri khusus dasbor analitik.
 *
 * Dipisah dari lib/kpi.ts karena sifatnya berbeda: yang di sana menjawab
 * "berapa angka orang ini", yang di sini menjawab "pola apa yang terlihat
 * kalau seluruh angka dilihat sekaligus". Bentuk hasilnya pun sudah
 * disesuaikan untuk grafik, bukan untuk tabel.
 *
 * Semua agregasi dikerjakan database, bukan di browser. Puluhan ribu baris
 * kpi_row yang dikirim mentah lalu dijumlahkan di sisi klien berarti
 * menunggu lama untuk angka yang ujungnya cuma belasan titik di grafik.
 */

/** Ambang skor jadi label yang sama dipakai di seluruh aplikasi. */
export const PITA_SKOR = [
  { batas: 4, label: "KPI 4 ke atas", warna: "#059669" },
  { batas: 3, label: "KPI 3", warna: "#4F46E5" },
  { batas: 0, label: "Di bawah KPI 3", warna: "#DC2626" },
];

export function labelPita(skor: number): string {
  return (PITA_SKOR.find((p) => skor >= p.batas) ?? PITA_SKOR[PITA_SKOR.length - 1]).label;
}

/**
 * Data Radar: rata-rata skor tiap indikator secara nasional.
 *
 * Dipakai melihat indikator mana yang secara menyeluruh kuat dan mana yang
 * lemah — pertanyaan yang tidak terjawab oleh tabel per cabang, karena di
 * sana satu indikator lemah di banyak cabang terlihat sebagai banyak
 * masalah kecil yang terpisah, bukan satu masalah besar.
 *
 * Jumlah cabang yang menilai ikut dikembalikan: indikator yang hanya
 * dipakai dua cabang tidak layak dibandingkan setara dengan yang dipakai
 * enam puluh cabang, dan itu harus terlihat pembacanya.
 */
export async function radarIndikator(periode: string, jabatan?: string) {
  const params: any[] = [periode];
  const saringJabatan = jabatan
    ? ` AND COALESCE(NULLIF(BTRIM(k.jabatan),''),'(TANPA JABATAN)') = $${params.push(jabatan)}`
    : "";

  const rows = await q<any>(
    `SELECT k.indikator,
            ROUND(AVG(k.skor_kpi), 2)               AS skor_rata,
            COUNT(DISTINCT k.nik)::int              AS orang,
            COUNT(DISTINCT norm_wilayah(k.cabang))::int AS cabang,
            ROUND(MIN(k.skor_kpi), 2)               AS skor_min,
            ROUND(MAX(k.skor_kpi), 2)               AS skor_maks
       FROM v_kpi_aktif k
      WHERE k.periode = $1 AND k.skor_kpi IS NOT NULL${saringJabatan}
      GROUP BY k.indikator
      HAVING COUNT(*) > 0
      ORDER BY 2 ASC`, params);

  return rows.map((r) => ({
    indikator: r.indikator,
    skorRata: Number(r.skor_rata),
    orang: r.orang,
    cabang: r.cabang,
    skorMin: Number(r.skor_min),
    skorMaks: Number(r.skor_maks),
  }));
}

/** Daftar jabatan yang punya data di periode ini, untuk penyaring radar. */
export async function jabatanBerdata(periode: string) {
  const rows = await q<any>(
    `SELECT COALESCE(NULLIF(BTRIM(jabatan),''),'(TANPA JABATAN)') AS jabatan,
            COUNT(DISTINCT nik)::int AS orang
       FROM v_kpi_aktif WHERE periode = $1
      GROUP BY 1 HAVING COUNT(DISTINCT nik) > 0
      ORDER BY 2 DESC, 1`, [periode]);
  return rows.map((r) => ({ jabatan: r.jabatan, orang: r.orang }));
}

/** Angka ringkas untuk kartu di puncak dasbor. */
export async function ringkasNasional(periode: string) {
  const [r] = await q<any>(
    `WITH per_orang AS (
       SELECT nik, SUM(skor_terbobot) AS skor
         FROM v_kpi_aktif WHERE periode = $1 GROUP BY nik
     ),
     ins AS (
       SELECT SUM(nominal) AS total FROM v_insentif_aktif WHERE periode = $1
     )
     SELECT COUNT(*)::int                                      AS karyawan,
            ROUND(AVG(skor), 2)                                AS skor_rata,
            COUNT(*) FILTER (WHERE skor >= 4)::int             AS jumlah_kpi4,
            COUNT(*) FILTER (WHERE skor >= 3 AND skor < 4)::int AS jumlah_kpi3,
            COUNT(*) FILTER (WHERE skor < 3)::int              AS jumlah_bawah,
            (SELECT total FROM ins)                            AS insentif
       FROM per_orang`, [periode]);

  return {
    karyawan: r?.karyawan ?? 0,
    skorRata: r?.skor_rata === null || r?.skor_rata === undefined ? null : Number(r.skor_rata),
    jumlahKpi4: r?.jumlah_kpi4 ?? 0,
    jumlahKpi3: r?.jumlah_kpi3 ?? 0,
    jumlahBawah: r?.jumlah_bawah ?? 0,
    insentif: r?.insentif === null || r?.insentif === undefined ? 0 : Number(r.insentif),
  };
}

/**
 * Sebaran skor rata-rata per area, untuk batang pembanding.
 *
 * Melengkapi radar: radar menjawab "indikator apa yang lemah", ini
 * menjawab "di mana lemahnya".
 */
export async function perArea(periode: string) {
  const rows = await q<any>(
    `WITH per_orang AS (
       SELECT k.nik, SUM(k.skor_terbobot) AS skor,
              norm_wilayah(k.cabang) AS cabang
         FROM v_kpi_aktif k WHERE k.periode = $1
        GROUP BY k.nik, norm_wilayah(k.cabang)
     ),
     area_cabang AS (
       SELECT DISTINCT ON (norm_wilayah(cabang))
              norm_wilayah(cabang) AS cabang, norm_wilayah(area) AS area
         FROM app_user
        WHERE cabang IS NOT NULL AND area IS NOT NULL
        GROUP BY norm_wilayah(cabang), norm_wilayah(area)
        ORDER BY norm_wilayah(cabang), COUNT(*) DESC
     )
     SELECT COALESCE(a.area, '(TANPA AREA)') AS area,
            ROUND(AVG(p.skor), 2)            AS skor_rata,
            COUNT(*)::int                    AS orang,
            COUNT(*) FILTER (WHERE p.skor < 3)::int AS bawah
       FROM per_orang p
       LEFT JOIN area_cabang a ON a.cabang = p.cabang
      GROUP BY 1 ORDER BY 2 ASC`, [periode]);

  return rows.map((r) => ({
    area: r.area,
    skorRata: Number(r.skor_rata),
    orang: r.orang,
    bawah: r.bawah,
  }));
}

/**
 * Rincian insentif: reguler, reward, penalty.
 *
 * Total saja menyembunyikan hal yang justru paling perlu diawasi — apakah
 * angka besar itu datang dari pencapaian pokok, dari bonus tambahan, atau
 * sudah dipotong penalti besar. Tiga angka itu dikelola aturan berbeda dan
 * pantas dilihat terpisah.
 *
 * Baris lama dari Excel tidak punya rincian ini (kolomnya baru ada sejak
 * insentif dihitung dari API), jadi selisih total dengan jumlah ketiganya
 * dikembalikan apa adanya sebagai `tanpaRincian` alih-alih dipaksa masuk
 * salah satu kelompok.
 */
export async function rincianInsentif(periode: string) {
  const [r] = await q<any>(
    `SELECT COALESCE(SUM(nominal), 0)                     AS total,
            COALESCE(SUM(nominal_dasar), 0)               AS dasar,
            COALESCE(SUM(nominal_reward), 0)              AS reward,
            COALESCE(SUM(nominal_penalty), 0)             AS penalty,
            COALESCE(SUM(nominal) FILTER (WHERE nominal_dasar IS NULL), 0) AS tanpa_rincian,
            COUNT(*) FILTER (WHERE nominal > 0)::int      AS penerima
       FROM v_insentif_aktif WHERE periode = $1`, [periode]);

  return {
    total: Number(r?.total ?? 0),
    dasar: Number(r?.dasar ?? 0),
    reward: Number(r?.reward ?? 0),
    penalty: Number(r?.penalty ?? 0),
    tanpaRincian: Number(r?.tanpa_rincian ?? 0),
    penerima: r?.penerima ?? 0,
  };
}

/**
 * Komposisi pencapaian per jabatan+produk.
 *
 * Pengganti Sankey. Sankey menarik saat alirannya sedikit, tapi dengan dua
 * belas jabatan garisnya saling menyilang sampai tidak ada yang bisa
 * ditelusuri — persis kebalikan dari tujuannya. Batang bertumpuk menjawab
 * pertanyaan yang sama ("jabatan mana yang bermasalah, seberapa parah")
 * dalam bentuk yang bisa dibaca sekali lihat dan diurutkan.
 */
export async function komposisiJabatan(periode: string) {
  const rows = await q<any>(
    // Dikelompokkan per jabatan saja, bukan jabatan+produk. Selain
    // memangkas jumlah batang hampir separuh, ini juga lebih tepat:
    // skor KPI seseorang adalah jumlah seluruh indikatornya lintas
    // produk. Memecahnya per produk membuat pemegang jabatan MIX
    // terhitung dua kali dengan skor yang masing-masing tidak utuh, dan
    // angkanya jadi tidak cocok dengan kartu ringkasan di atas.
    `WITH per_orang AS (
       SELECT k.nik,
              COALESCE(NULLIF(BTRIM(k.jabatan), ''), '(TANPA JABATAN)') AS jabatan,
              SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k WHERE k.periode = $1
        GROUP BY k.nik, 2
     )
     SELECT jabatan,
            COUNT(*)::int                                       AS orang,
            COUNT(*) FILTER (WHERE skor >= 4)::int              AS kpi4,
            COUNT(*) FILTER (WHERE skor >= 3 AND skor < 4)::int AS kpi3,
            COUNT(*) FILTER (WHERE skor < 3)::int               AS bawah,
            ROUND(AVG(skor), 2)                                 AS skor_rata
       FROM per_orang
      GROUP BY jabatan
      ORDER BY 6 ASC`, [periode]);

  return rows.map((r) => ({
    label: r.jabatan,
    jabatan: r.jabatan,
    orang: r.orang, kpi4: r.kpi4, kpi3: r.kpi3, bawah: r.bawah,
    skorRata: Number(r.skor_rata),
    persenBawah: r.orang ? Math.round((r.bawah / r.orang) * 100) : 0,
  }));
}

/**
 * Tren skor rata-rata beberapa periode terakhir.
 *
 * Angka satu bulan tidak memberi tahu arah. Direksi hampir selalu menanyakan
 * hal yang sama setelah melihat angka: naik atau turun dari bulan lalu —
 * dan itu tidak terjawab oleh dasbor yang hanya menampilkan satu potret.
 */
export async function trenPeriode(batas = 12) {
  const rows = await q<any>(
    `WITH per_orang AS (
       SELECT periode, nik, SUM(skor_terbobot) AS skor
         FROM v_kpi_aktif GROUP BY periode, nik
     ),
     ins AS (
       SELECT periode, SUM(nominal) AS insentif
         FROM v_insentif_aktif GROUP BY periode
     )
     SELECT p.periode,
            ROUND(AVG(p.skor), 2)                       AS skor_rata,
            COUNT(*)::int                               AS orang,
            COUNT(*) FILTER (WHERE p.skor < 3)::int     AS bawah,
            COALESCE(i.insentif, 0)                     AS insentif
       FROM per_orang p
       LEFT JOIN ins i ON i.periode = p.periode
      GROUP BY p.periode, i.insentif
      ORDER BY p.periode DESC
      LIMIT $1`, [batas]);

  return rows
    .map((r) => ({
      periode: typeof r.periode === "string" ? r.periode : new Date(r.periode).toISOString().slice(0, 10),
      skorRata: Number(r.skor_rata),
      orang: r.orang,
      bawah: r.bawah,
      insentif: Number(r.insentif),
      persenBawah: r.orang ? Math.round((r.bawah / r.orang) * 100) : 0,
    }))
    .reverse();   // grafik dibaca kiri ke kanan: lama → baru
}

/**
 * Sebaran skor per setengah poin.
 *
 * Rata-rata menyembunyikan bentuk. Rata-rata 2,8 bisa berarti hampir semua
 * orang di 2,8 — atau separuh di 1,5 dan separuh di 4,1, yang menuntut
 * tindakan sama sekali berbeda.
 */
export async function sebaranSkor(periode: string) {
  const rows = await q<any>(
    `WITH per_orang AS (
       SELECT k.nik,
              COALESCE(NULLIF(BTRIM(u.area), ''), '(TANPA AREA)')  AS area,
              COALESCE(NULLIF(BTRIM(u.cabang), ''), '(TANPA CABANG)') AS cabang,
              SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k
         LEFT JOIN app_user u ON u.nik = k.nik
        WHERE k.periode = $1
        GROUP BY k.nik, 2, 3
     ),
     berpita AS (
       SELECT FLOOR(LEAST(skor, 5) * 2) / 2 AS pita, area, cabang FROM per_orang
     ),
     -- Rincian per pita dipotong di lima area/cabang teratas: yang menjelaskan
     -- sebuah batang biasanya segelintir tempat, dan daftar penuh 60 cabang
     -- justru membuat tooltip mustahil dibaca.
     ar AS (
       SELECT pita, area AS nama, COUNT(*)::int AS orang,
              ROW_NUMBER() OVER (PARTITION BY pita ORDER BY COUNT(*) DESC, area) AS urut
         FROM berpita GROUP BY pita, area
     ),
     cb AS (
       SELECT pita, cabang AS nama, COUNT(*)::int AS orang,
              ROW_NUMBER() OVER (PARTITION BY pita ORDER BY COUNT(*) DESC, cabang) AS urut
         FROM berpita GROUP BY pita, cabang
     )
     SELECT p.pita, COUNT(*)::int AS orang,
            (SELECT COALESCE(json_agg(json_build_object('nama', nama, 'orang', orang)
                                      ORDER BY urut), '[]'::json)
               FROM ar WHERE ar.pita = p.pita AND ar.urut <= 5) AS area,
            (SELECT COALESCE(json_agg(json_build_object('nama', nama, 'orang', orang)
                                      ORDER BY urut), '[]'::json)
               FROM cb WHERE cb.pita = p.pita AND cb.urut <= 5) AS cabang,
            (SELECT COUNT(*)::int FROM ar WHERE ar.pita = p.pita)  AS jml_area,
            (SELECT COUNT(*)::int FROM cb WHERE cb.pita = p.pita)  AS jml_cabang
       FROM berpita p GROUP BY p.pita ORDER BY p.pita`, [periode]);

  const total = rows.reduce((a, r) => a + r.orang, 0);
  return rows.map((r) => ({
    pita: Number(r.pita),
    label: `${Number(r.pita).toFixed(1)}–${(Number(r.pita) + 0.5).toFixed(1)}`,
    orang: r.orang,
    persen: total ? Math.round((r.orang / total) * 1000) / 10 : 0,
    area: (r.area ?? []) as { nama: string; orang: number }[],
    cabang: (r.cabang ?? []) as { nama: string; orang: number }[],
    jmlArea: r.jml_area,
    jmlCabang: r.jml_cabang,
  }));
}

/**
 * Cabang terbaik dan terburuk.
 *
 * Enam puluh lima cabang terlalu banyak untuk dibandingkan sekaligus; yang
 * dibutuhkan hanya dua ujungnya — mana yang perlu ditolong dan mana yang
 * pantas ditiru.
 */
export async function ujungCabang(periode: string, n = 8) {
  // Peringkat saja tidak cukup untuk memutuskan apa-apa: cabang di urutan
  // buncit yang bulan lalu lebih buncit sedang membaik, dan cabang di
  // urutan atas yang turun tujuh tangga justru layak ditanyai. Karena itu
  // peringkat bulan sebelumnya ikut dihitung dan disandingkan.
  const rows = await q<any>(
    `WITH per_orang AS (
       SELECT periode, norm_wilayah(cabang) AS cabang, nik,
              SUM(skor_terbobot) AS skor
         FROM v_kpi_aktif
        WHERE periode IN ($1::date, ($1::date - INTERVAL '1 month')::date)
        GROUP BY 1, 2, nik
     ),
     per_cabang AS (
       SELECT periode, cabang, ROUND(AVG(skor), 2) AS skor_rata,
              COUNT(*)::int AS orang,
              COUNT(*) FILTER (WHERE skor < 3)::int AS bawah
         FROM per_orang
        WHERE cabang IS NOT NULL
        GROUP BY periode, cabang
       HAVING COUNT(*) >= 3   -- cabang berisi satu-dua orang mudah jadi ujung
     ),
     berperingkat AS (
       SELECT *, RANK() OVER (PARTITION BY periode ORDER BY skor_rata DESC)::int AS peringkat
         FROM per_cabang
     )
     SELECT k.cabang, k.skor_rata, k.orang, k.bawah, k.peringkat,
            l.peringkat AS peringkat_lalu, l.skor_rata AS skor_lalu
       FROM berperingkat k
       LEFT JOIN berperingkat l
              ON l.cabang = k.cabang
             AND l.periode = ($1::date - INTERVAL '1 month')::date
      WHERE k.periode = $1::date
      ORDER BY k.skor_rata DESC`, [periode]);

  const semua = rows.map((r) => {
    const lalu = r.peringkat_lalu === null ? null : Number(r.peringkat_lalu);
    return {
      cabang: r.cabang,
      skorRata: Number(r.skor_rata),
      orang: r.orang,
      bawah: r.bawah,
      peringkat: Number(r.peringkat),
      peringkatLalu: lalu,
      // Positif berarti naik tangga (angka peringkat mengecil).
      geser: lalu === null ? null : lalu - Number(r.peringkat),
      skorLalu: r.skor_lalu === null ? null : Number(r.skor_lalu),
    };
  });

  return {
    terbaik: semua.slice(0, n),
    terburuk: semua.slice(-n).reverse(),
    jumlahCabang: semua.length,
    adaPembanding: semua.some((x) => x.peringkatLalu !== null),
  };
}

/**
 * Insentif per orang dibanding skor, per cabang.
 *
 * Pertanyaan yang hanya bisa dijawab dengan menyandingkan keduanya: apakah
 * yang dibayar mahal memang yang berprestasi. Titik di kanan-bawah — biaya
 * tinggi, skor rendah — adalah yang paling perlu ditanyakan.
 */
export async function biayaVsSkor(periode: string) {
  const rows = await q<any>(
    `WITH skor AS (
       SELECT norm_wilayah(cabang) AS cabang, nik, SUM(skor_terbobot) AS skor
         FROM v_kpi_aktif WHERE periode = $1 GROUP BY 1, nik
     ),
     per_cabang AS (
       SELECT cabang, ROUND(AVG(skor), 2) AS skor_rata, COUNT(*)::int AS orang
         FROM skor WHERE cabang IS NOT NULL GROUP BY cabang
     ),
     -- Insentif dikaitkan lewat NIK, bukan lewat kolom cabang di
     -- insentif_row. Kolom cabang di sana sering kosong (baris API
     -- mengisinya dari data KPI yang bisa saja belum lengkap), dan
     -- menggabung lewat kolom kosong menghasilkan nol yang terlihat
     -- seperti "cabang ini memang tidak dapat insentif".
     ins AS (
       SELECT s.cabang, SUM(i.nominal) AS insentif
         FROM v_insentif_aktif i
         JOIN (SELECT DISTINCT nik, cabang FROM skor) s ON s.nik = i.nik
        WHERE i.periode = $1
        GROUP BY s.cabang
     )
     SELECT c.cabang, c.skor_rata, c.orang,
            COALESCE(n.insentif, 0) AS insentif,
            ROUND(COALESCE(n.insentif, 0) / NULLIF(c.orang, 0)) AS per_orang
       FROM per_cabang c
       LEFT JOIN ins n ON n.cabang = c.cabang
      WHERE c.orang >= 3
      ORDER BY c.cabang`, [periode]);

  return rows.map((r) => ({
    cabang: r.cabang,
    skorRata: Number(r.skor_rata),
    orang: r.orang,
    insentif: Number(r.insentif),
    perOrang: Number(r.per_orang ?? 0),
  }));
}
