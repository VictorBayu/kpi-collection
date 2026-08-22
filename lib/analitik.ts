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
  { batas: 4, label: "KPI 4 ke atas", warna: "#1F8A5B" },
  { batas: 3, label: "KPI 3", warna: "#2C5FE8" },
  { batas: 0, label: "Di bawah KPI 3", warna: "#C2410C" },
];

export function labelPita(skor: number): string {
  return (PITA_SKOR.find((p) => skor >= p.batas) ?? PITA_SKOR[PITA_SKOR.length - 1]).label;
}

/**
 * Data Sankey: jabatan → produk → pita pencapaian.
 *
 * Tiga tingkat, bukan dua, supaya alirannya bisa ditelusuri: dari jabatan
 * mana orangnya, memegang produk apa, lalu bermuara di pencapaian seperti
 * apa. Dengan dua tingkat saja, jabatan yang tampak buruk tidak ketahuan
 * apakah buruk di semua produk atau hanya di satu.
 */
export async function alirJabatanProduk(periode: string) {
  const rows = await q<any>(
    `WITH per_orang AS (
       SELECT k.nik,
              COALESCE(NULLIF(BTRIM(k.jabatan), ''), '(TANPA JABATAN)') AS jabatan,
              COALESCE(NULLIF(BTRIM(k.produk),  ''), '(TANPA PRODUK)')  AS produk,
              SUM(k.skor_terbobot) AS skor
         FROM v_kpi_aktif k
        WHERE k.periode = $1
        GROUP BY k.nik, 2, 3
     )
     SELECT jabatan, produk,
            CASE WHEN skor >= 4 THEN 'KPI 4 ke atas'
                 WHEN skor >= 3 THEN 'KPI 3'
                 ELSE 'Di bawah KPI 3' END AS pita,
            COUNT(*)::int      AS orang,
            ROUND(AVG(skor),2) AS skor_rata
       FROM per_orang
      GROUP BY jabatan, produk, 3
      ORDER BY jabatan, produk`, [periode]);

  // amCharts Sankey menerima daftar tautan; simpul dibentuk sendiri dari
  // pasangan from-to. Dua lapis tautan dijadikan satu daftar.
  //
  // Pemisah kunci peta memakai karakter kendali, bukan spasi: nama jabatan
  // seperti "FC TT R2" sendirinya sudah mengandung spasi, jadi memecah
  // dengan spasi akan memotongnya di tempat yang salah.
  const PISAH = "\u0001";

  // Simpul produk diberi imbuhan supaya tidak melebur dengan simpul
  // jabatan bila namanya kebetulan sama — amCharts menganggap dua simpul
  // bernama sama sebagai satu simpul, dan alirannya jadi kacau.
  const namaProduk = (p: string) => `Produk ${p}`;

  const tautanJP = new Map<string, { orang: number; skor: number }>();
  const tautanPP = new Map<string, { orang: number; skor: number }>();

  for (const r of rows) {
    const orang = Number(r.orang);
    const skor = Number(r.skor_rata) * orang;

    const kunciJP = `${r.jabatan}${PISAH}${namaProduk(r.produk)}`;
    const a = tautanJP.get(kunciJP) ?? { orang: 0, skor: 0 };
    tautanJP.set(kunciJP, { orang: a.orang + orang, skor: a.skor + skor });

    const kunciPP = `${namaProduk(r.produk)}${PISAH}${r.pita}`;
    const b = tautanPP.get(kunciPP) ?? { orang: 0, skor: 0 };
    tautanPP.set(kunciPP, { orang: b.orang + orang, skor: b.skor + skor });
  }

  const jadikan = (peta: typeof tautanJP) =>
    Array.from(peta, ([kunci, v]) => {
      const [from, to] = kunci.split(PISAH);
      return {
        from, to,
        value: v.orang,
        skorRata: v.orang ? Number((v.skor / v.orang).toFixed(2)) : 0,
      };
    });

  return [...jadikan(tautanJP), ...jadikan(tautanPP)]
    .sort((a, b) => b.value - a.value);
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
