import { q } from "./db";
import { susunRumus, bacaRumus, RumusSalah, type Komponen, type Syarat } from "./rumus";

/**
 * Mesin hitung indikator.
 *
 * Mengubah data mentah dari API menjadi baris KPI, mengikuti definisi rumus
 * yang dirakit admin. Menggantikan peran unggahan Excel untuk periode
 * berjalan; periode lampau tetap dari Excel dan tidak disentuh berkas ini.
 *
 * Penghitungan dilakukan per pasangan indikator-dan-produk, bukan per
 * indikator saja. Pemegang jabatan MIX menangani dua produk, dan angka
 * pencapaiannya untuk R2 tidak boleh tercampur dengan R4 walau orangnya
 * sama — keduanya baris terpisah dengan target masing-masing.
 */

export type HasilHitung = {
  indikator: number;
  baris: number;
  /** Baris insentif yang terbentuk dari gabungan skor indikator. */
  insentif: number;
  periode: string;
  gagal: { indikator: string; pesan: string }[];
};

type DefIndikator = {
  id: string;
  nama: string;
  satuan: string;
  kali_seratus: boolean;
  peran_pic: "staff" | "spv" | "bch";
  komponen: Komponen[];
};

/** Kolom NIK yang dipakai mengelompokkan, sesuai peran pemegang indikator. */
const KOLOM_PIC: Record<string, string> = {
  staff: "nik_staff",
  spv: "nik_spv",
  bch: "nik_bch",
};

/** Periode berjalan: tanggal 1 bulan ini, waktu Jakarta. */
export function periodeBerjalan(): string {
  const jkt = new Date(Date.now() + 7 * 3600 * 1000);
  return `${jkt.getUTCFullYear()}-${String(jkt.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Katalog kolom yang boleh dipakai rumus.
 *
 * Dibaca dari database, bukan ditulis di kode, supaya penambahan kolom
 * cukup lewat satu baris INSERT. Yang penting: pencocokannya tetap ketat —
 * kolom di luar katalog ditolak sebelum menyentuh SQL.
 */
async function muatKatalog() {
  const rows = await q<{ kolom: string; label: string; jenis: string }>(
    `SELECT kolom, label, jenis FROM mentah_kolom`);

  const sah = new Set(rows.map((r) => r.kolom));
  const label = new Map(rows.map((r) => [r.kolom, r.label]));

  return {
    /** Mengembalikan nama kolom yang aman ditempel ke SQL, atau melempar. */
    kolomSah(kode: string): string {
      if (!sah.has(kode)) {
        throw new RumusSalah(`Kolom "${kode}" tidak ada di katalog data mentah.`);
      }
      return `dm.${kode}`;
    },
    labelKolom: (k: string) => label.get(k) ?? k,
  };
}

/** Seluruh definisi indikator aktif beserta komponen dan syaratnya. */
async function muatIndikator(): Promise<DefIndikator[]> {
  const def = await q<any>(
    `SELECT id, nama, satuan, kali_seratus, peran_pic
       FROM indikator_def WHERE aktif ORDER BY nama`);
  if (!def.length) return [];

  const ids = def.map((d) => d.id);

  const komponen = await q<any>(
    `SELECT id, indikator_id, urutan, agregat, kolom, operator_sebelum, gabung_syarat
       FROM indikator_komponen WHERE indikator_id = ANY($1::uuid[])
      ORDER BY indikator_id, urutan`, [ids]);

  const syarat = komponen.length
    ? await q<any>(
        `SELECT komponen_id, kolom, operator, nilai
           FROM indikator_syarat WHERE komponen_id = ANY($1::uuid[])
          ORDER BY komponen_id, urutan`,
        [komponen.map((k) => k.id)])
    : [];

  const perKomponen = new Map<string, Syarat[]>();
  for (const s of syarat) {
    const arr = perKomponen.get(s.komponen_id) ?? [];
    arr.push({ kolom: s.kolom, operator: s.operator, nilai: s.nilai ?? [] });
    perKomponen.set(s.komponen_id, arr);
  }

  const perIndikator = new Map<string, Komponen[]>();
  for (const k of komponen) {
    const arr = perIndikator.get(k.indikator_id) ?? [];
    arr.push({
      agregat: k.agregat,
      kolom: k.kolom,
      operator_sebelum: k.operator_sebelum,
      gabung_syarat: k.gabung_syarat,
      syarat: perKomponen.get(k.id) ?? [],
    });
    perIndikator.set(k.indikator_id, arr);
  }

  return def.map((d) => ({ ...d, komponen: perIndikator.get(d.id) ?? [] }));
}

/**
 * Menghitung satu indikator untuk satu produk, lalu menyimpan hasilnya.
 *
 * Baris data mentah disaring dua kali sebelum diagregasi: hanya baris
 * berproduk yang sedang dihitung, dan hanya milik orang yang jabatannya
 * benar-benar terdaftar untuk pasangan indikator-produk ini. Penyaringan
 * kedua penting supaya staf yang kebetulan memegang kontrak R4 tapi tidak
 * pernah didaftarkan ke indikator R4 tidak tiba-tiba muncul dinilai.
 */
async function hitungSatu(
  d: DefIndikator,
  produk: string,
  periode: string,
  kat: Awaited<ReturnType<typeof muatKatalog>>,
): Promise<number> {
  const params: any[] = [];
  const ekspresi = susunRumus(
    { komponen: d.komponen, kali_seratus: d.kali_seratus },
    kat.kolomSah, params,
  );

  const kolomNik = KOLOM_PIC[d.peran_pic] ?? "nik_staff";
  const catatan = bacaRumus(
    { komponen: d.komponen, kali_seratus: d.kali_seratus }, kat.labelKolom);

  // Parameter tambahan diberi nomor lanjutan dari yang sudah dipakai rumus.
  const pIndikator = `$${params.push(d.id)}`;
  const pProduk    = `$${params.push(produk)}`;
  const pPeriode   = `$${params.push(periode)}`;
  const pNama      = `$${params.push(d.nama)}`;
  const pSatuan    = `$${params.push(d.satuan)}`;
  const pCatatan   = `$${params.push(catatan)}`;

  /**
   * Skor dari pencapaian.
   *
   * Kalau target ini punya pita (indikator_pita), pakai interpolasi pita —
   * ini bentuk umum yang menggantikan tiga ambang tetap, dan mendukung
   * berapa pun banyaknya tingkat, termasuk target yang dipakai indikator
   * berperan 'tier' (di sana poin pita adalah nomor tier itu sendiri).
   *
   * Kalau tidak ada pita terdaftar, jatuh balik ke tiga ambang KPI3/4/5
   * lama dengan interpolasi lurus, supaya indikator yang belum dipindah
   * ke pita tetap jalan seperti sebelumnya.
   */
  const skorPita = `poin_dari_pita(t.target_id, h.nilai)`;
  const skorLama = `
    CASE
      WHEN h.nilai IS NULL OR t.target_kpi3 IS NULL THEN NULL
      WHEN t.target_kpi5 IS NOT NULL AND h.nilai >= t.target_kpi5 THEN 5
      WHEN t.target_kpi5 IS NOT NULL AND t.target_kpi4 IS NOT NULL
           AND h.nilai >= t.target_kpi4 AND t.target_kpi5 <> t.target_kpi4
        THEN 4 + (h.nilai - t.target_kpi4) / (t.target_kpi5 - t.target_kpi4)
      WHEN t.target_kpi4 IS NOT NULL AND h.nilai >= t.target_kpi3
           AND t.target_kpi4 <> t.target_kpi3
        THEN 3 + (h.nilai - t.target_kpi3) / (t.target_kpi4 - t.target_kpi3)
      WHEN h.nilai >= t.target_kpi3 THEN 3
      WHEN t.target_kpi3 = 0 THEN 0
      ELSE GREATEST(0, 3 * h.nilai / NULLIF(t.target_kpi3, 0))
    END`;
  const skor = `
    CASE
      WHEN h.nilai IS NULL THEN NULL
      WHEN t.ada_pita THEN ${skorPita}
      ELSE (${skorLama})
    END`;

  const sql = `
    WITH terdaftar AS (
      SELECT u.nik, u.nama, u.jabatan, u.cabang,
             t.id AS target_id, t.peran, t.jenis_nilai, t.nilai_efek,
             t.bobot_kpi, t.bobot_insentif,
             t.target_kpi3, t.target_kpi4, t.target_kpi5,
             EXISTS (SELECT 1 FROM indikator_pita p WHERE p.target_id = t.id) AS ada_pita
        FROM indikator_target t
        JOIN jabatan_produk jp ON jp.alias = t.alias AND jp.produk = t.produk
        JOIN app_user u ON norm_jabatan(u.jabatan) = t.alias AND u.aktif
       WHERE t.indikator_id = ${pIndikator} AND t.produk = ${pProduk} AND t.aktif
    ),
    hitung AS (
      SELECT dm.${kolomNik} AS nik, (${ekspresi}) AS nilai
        FROM data_mentah dm
       WHERE dm.${kolomNik} IS NOT NULL
         AND upper(btrim(COALESCE(dm.product, ''))) = upper(${pProduk})
       GROUP BY dm.${kolomNik}
    )
    INSERT INTO kpi_row
      (periode, nik, nama, jabatan, cabang, produk, indikator, indikator_id,
       bobot, bobot_insentif, pencapaian, skor_kpi, skor_terbobot, skor_terbobot_ins,
       target_kpi3, target_kpi4, target_kpi5, satuan, catatan,
       peran, jenis_nilai, nilai_efek,
       sumber, batch_id, dihitung_pada)
    SELECT ${pPeriode}::date, t.nik, t.nama, t.jabatan, t.cabang, ${pProduk},
           ${pNama}, ${pIndikator}::uuid,
           t.bobot_kpi, t.bobot_insentif, h.nilai,
           ROUND((${skor})::numeric, 2),
           -- Bobot kosong berarti indikator ini memang tidak ikut skema
           -- tersebut, jadi hasilnya NULL — bukan nol. Nol akan terbaca
           -- sebagai "ikut dinilai tapi tidak dapat apa-apa", padahal
           -- yang benar adalah "tidak ikut dinilai sama sekali". Peran di
           -- luar kpi/reguler (reward, penalty, tier) juga dipaksa NULL di
           -- sini walau bobotnya terisi, supaya baris semacam itu tidak
           -- pernah ikut menyumbang skor KPI atau skor insentif reguler
           -- secara tidak sengaja — sumbangannya ke nominal dihitung
           -- terpisah, bukan lewat jalur bobot ini.
           CASE WHEN t.peran NOT IN ('kpi','reguler') OR t.bobot_kpi IS NULL THEN NULL
                ELSE ROUND((${skor})::numeric * t.bobot_kpi / 100, 2) END,
           CASE WHEN t.peran NOT IN ('kpi','reguler') OR t.bobot_insentif IS NULL THEN NULL
                ELSE ROUND((${skor})::numeric * t.bobot_insentif / 100, 2) END,
           t.target_kpi3, t.target_kpi4, t.target_kpi5,
           ${pSatuan}, ${pCatatan},
           t.peran, t.jenis_nilai, t.nilai_efek,
           'api', NULL, now()
      FROM terdaftar t
      LEFT JOIN hitung h ON h.nik = t.nik
    ON CONFLICT (nik, periode, indikator_id, produk) WHERE sumber = 'api'
    DO UPDATE SET
      pencapaian        = EXCLUDED.pencapaian,
      skor_kpi          = EXCLUDED.skor_kpi,
      skor_terbobot     = EXCLUDED.skor_terbobot,
      skor_terbobot_ins = EXCLUDED.skor_terbobot_ins,
      bobot             = EXCLUDED.bobot,
      bobot_insentif    = EXCLUDED.bobot_insentif,
      target_kpi3   = EXCLUDED.target_kpi3,
      target_kpi4   = EXCLUDED.target_kpi4,
      target_kpi5   = EXCLUDED.target_kpi5,
      satuan        = EXCLUDED.satuan,
      catatan       = EXCLUDED.catatan,
      peran         = EXCLUDED.peran,
      jenis_nilai   = EXCLUDED.jenis_nilai,
      nilai_efek    = EXCLUDED.nilai_efek,
      nama          = EXCLUDED.nama,
      jabatan       = EXCLUDED.jabatan,
      cabang        = EXCLUDED.cabang,
      dihitung_pada = now()`;

  const hasil = await q<any>(sql, params);
  return Array.isArray(hasil) ? hasil.length : 0;
}

/**
 * Mengubah skor dan efek indikator menjadi nominal insentif akhir.
 *
 * Dijalankan sekali setelah SELURUH indikator selesai dihitung, bukan per
 * indikator, karena nominal berasal dari gabungan beberapa indikator
 * berperan berbeda sekaligus (skor reguler, tier, reward, penalty).
 * Menghitungnya sebelum semua terkumpul akan menghasilkan angka setengah
 * jadi yang sempat tersimpan.
 *
 * Nominal dasar berasal dari salah satu dari dua mekanisme, dipilih per
 * jabatan+produk lewat insentif_pagu.mekanisme — keduanya hidup
 * berdampingan karena tidak semua jabatan memakai tier:
 *
 *  - pagu : (jumlah skor terbobot insentif ÷ pembagi) × pagu jabatan,
 *           nol bila skor di bawah ambang minimal.
 *  - tier : dicari langsung dari tabel insentif_tier memakai tier (dari
 *           indikator berperan 'tier') disilang kelas cabang periode ini.
 *
 * Reward dan penalty lalu menambah/mengurangi nominal dasar itu. Efeknya
 * mengikuti hasil hitungan indikator masing-masing (bukan nilai tetap):
 * nilai_efek × pencapaian. Untuk jenis nominal, hasilnya rupiah langsung;
 * untuk jenis persen, hasilnya persentase yang baru diterapkan ke nominal
 * dasar pada langkah terakhir — karena itu reward/penalty dihitung
 * SETELAH nominal dasar diketahui, bukan sebelumnya.
 *
 * Baris tetap ditulis walau nominalnya nol. Orang yang tidak mencapai
 * ambang perlu melihat bahwa dirinya dinilai dan hasilnya nol, bukan
 * sekadar tidak muncul sama sekali.
 */
async function hitungInsentif(periode: string): Promise<number> {
  const hasil = await q<any>(
    `WITH dasar AS (
       SELECT k.nik, MAX(k.nama) AS nama, MAX(k.jabatan) AS jabatan,
              MAX(k.cabang) AS cabang, k.produk,
              SUM(k.skor_terbobot_ins) AS total_skor,
              MAX(ROUND(k.skor_kpi)) FILTER (WHERE k.peran = 'tier') AS tier,
              COALESCE(SUM(k.nilai_efek * k.pencapaian)
                FILTER (WHERE k.peran = 'reward'  AND k.jenis_nilai = 'nominal'), 0) AS reward_nominal,
              COALESCE(SUM(k.nilai_efek * k.pencapaian)
                FILTER (WHERE k.peran = 'reward'  AND k.jenis_nilai = 'persen'),  0) AS reward_persen,
              COALESCE(SUM(k.nilai_efek * k.pencapaian)
                FILTER (WHERE k.peran = 'penalty' AND k.jenis_nilai = 'nominal'), 0) AS penalty_nominal,
              COALESCE(SUM(k.nilai_efek * k.pencapaian)
                FILTER (WHERE k.peran = 'penalty' AND k.jenis_nilai = 'persen'),  0) AS penalty_persen
         FROM kpi_row k
        WHERE k.sumber = 'api' AND k.periode = $1
        GROUP BY k.nik, k.produk
     ),
     lengkap AS (
       SELECT d.*, kelas_cabang(d.cabang, $1::date) AS kelas
         FROM dasar d
     ),
     pokok AS (
       SELECT l.*, g.alias, g.mekanisme,
              g.nominal AS pagu_nominal, g.skor_minimal, g.pembagi,
              CASE
                WHEN g.mekanisme = 'tier' THEN
                  COALESCE((SELECT it.nominal FROM insentif_tier it
                             WHERE it.alias = g.alias AND it.produk = g.produk
                               AND it.tier = l.tier AND it.kelas = l.kelas), 0)
                WHEN l.total_skor IS NULL OR l.total_skor < g.skor_minimal THEN 0
                ELSE ROUND(l.total_skor / NULLIF(g.pembagi, 0) * g.nominal, 0)
              END AS nominal_dasar
         FROM lengkap l
         JOIN insentif_pagu g
           ON g.alias = norm_jabatan(l.jabatan) AND g.produk = l.produk AND g.aktif
     )
     INSERT INTO insentif_row
       (periode, nik, kategori, produk, jabatan, cabang,
        skor_insentif, tier, kelas_cabang,
        nominal_dasar, nominal_reward, nominal_penalty, nominal,
        sumber, batch_id, keterangan, dihitung_pada)
     SELECT $1::date, p.nik, 'Insentif ' || p.produk, p.produk, p.jabatan, p.cabang,
            ROUND(p.total_skor, 2), p.tier, p.kelas,
            p.nominal_dasar,
            ROUND(p.reward_nominal + (p.reward_persen / 100) * p.nominal_dasar, 0),
            ROUND(p.penalty_nominal + (p.penalty_persen / 100) * p.nominal_dasar, 0),
            GREATEST(0, ROUND(
              p.nominal_dasar
              + p.reward_nominal + (p.reward_persen / 100) * p.nominal_dasar
              - p.penalty_nominal - (p.penalty_persen / 100) * p.nominal_dasar
            , 0)),
            'api', NULL,
            CASE
              WHEN p.mekanisme = 'tier' THEN
                'Tier ' || COALESCE(p.tier::text, '-') ||
                ' x kelas ' || COALESCE(p.kelas, '-') ||
                CASE WHEN p.kelas IS NULL OR p.tier IS NULL
                       OR p.nominal_dasar = 0 AND p.tier IS NOT NULL AND p.kelas IS NOT NULL
                     THEN ' (cek: tier/kelas belum lengkap atau tidak ada di tabel)'
                     ELSE '' END
              WHEN p.total_skor IS NULL OR p.total_skor < p.skor_minimal
                THEN 'Skor ' || COALESCE(ROUND(p.total_skor, 2)::text, '-') ||
                     ' di bawah minimal ' || p.skor_minimal
              ELSE ROUND(p.total_skor, 2) || ' / ' || p.pembagi ||
                   ' x pagu ' || p.pagu_nominal
            END,
            now()
       FROM pokok p
     ON CONFLICT (nik, periode, produk) WHERE sumber = 'api'
     DO UPDATE SET
       skor_insentif   = EXCLUDED.skor_insentif,
       tier            = EXCLUDED.tier,
       kelas_cabang    = EXCLUDED.kelas_cabang,
       nominal_dasar   = EXCLUDED.nominal_dasar,
       nominal_reward  = EXCLUDED.nominal_reward,
       nominal_penalty = EXCLUDED.nominal_penalty,
       nominal         = EXCLUDED.nominal,
       keterangan      = EXCLUDED.keterangan,
       jabatan         = EXCLUDED.jabatan,
       cabang          = EXCLUDED.cabang,
       dihitung_pada   = now()`,
    [periode]);

  return Array.isArray(hasil) ? hasil.length : 0;
}

/**
 * Menghitung seluruh indikator aktif untuk periode berjalan.
 *
 * Satu indikator yang rumusnya bermasalah tidak menggagalkan yang lain —
 * kesalahannya dicatat dan dikembalikan, sisanya tetap dihitung. Kalau
 * semuanya dibatalkan bersama, satu rumus setengah jadi milik admin akan
 * membekukan angka seluruh perusahaan.
 */
export async function hitungSemuaIndikator(periode?: string): Promise<HasilHitung> {
  const p = periode ?? periodeBerjalan();
  const kat = await muatKatalog();
  const daftar = await muatIndikator();
  const gagal: { indikator: string; pesan: string }[] = [];

  // Pasangan indikator-produk yang benar-benar terdaftar; yang belum
  // didaftarkan ke jabatan mana pun tidak perlu dihitung.
  const pasangan = await q<{ indikator_id: string; produk: string }>(
    `SELECT DISTINCT indikator_id, produk FROM indikator_target WHERE aktif`);

  const perIndikator = new Map<string, string[]>();
  for (const x of pasangan) {
    const arr = perIndikator.get(x.indikator_id) ?? [];
    arr.push(x.produk);
    perIndikator.set(x.indikator_id, arr);
  }

  let baris = 0;
  let terhitung = 0;

  for (const d of daftar) {
    const produkList = perIndikator.get(d.id) ?? [];
    if (!produkList.length) continue;

    let adaYangJalan = false;
    for (const produk of produkList) {
      try {
        baris += await hitungSatu(d, produk, p, kat);
        adaYangJalan = true;
      } catch (e) {
        gagal.push({
          indikator: `${d.nama} (${produk})`,
          pesan: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (adaYangJalan) terhitung++;
  }

  // Nominal insentif dihitung terakhir, setelah seluruh skor terkumpul.
  let insentif = 0;
  try {
    insentif = await hitungInsentif(p);
  } catch (e) {
    gagal.push({
      indikator: "Nominal insentif",
      pesan: e instanceof Error ? e.message : String(e),
    });
  }

  return { indikator: terhitung, baris, insentif, periode: p, gagal };
}

/**
 * Uji rumus tanpa menyimpan apa pun.
 *
 * Dipakai tombol "Uji rumus" di pembangun indikator. Admin butuh melihat
 * angka sungguhan dari beberapa orang sebelum mendaftarkan rumusnya ke
 * puluhan jabatan — memeriksa rumus lewat hasil akhir yang sudah tersimpan
 * berarti kesalahan baru ketahuan setelah semua orang melihatnya.
 */
export async function ujiRumus(
  komponen: Komponen[],
  kali_seratus: boolean,
  peran_pic: "staff" | "spv" | "bch",
  produk: string | null,
  batas = 10,
) {
  const kat = await muatKatalog();
  const params: any[] = [];
  const ekspresi = susunRumus({ komponen, kali_seratus }, kat.kolomSah, params);
  const kolomNik = KOLOM_PIC[peran_pic] ?? "nik_staff";

  const syaratProduk = produk
    ? ` AND upper(btrim(COALESCE(dm.product,''))) = upper($${params.push(produk)})`
    : "";
  const pBatas = `$${params.push(batas)}`;

  const rows = await q<any>(
    `SELECT dm.${kolomNik} AS nik,
            MAX(u.nama)   AS nama,
            MAX(u.cabang) AS cabang,
            COUNT(*)      AS baris,
            (${ekspresi})  AS nilai
       FROM data_mentah dm
       LEFT JOIN app_user u ON u.nik = dm.${kolomNik}
      WHERE dm.${kolomNik} IS NOT NULL${syaratProduk}
      GROUP BY dm.${kolomNik}
      ORDER BY 5 DESC NULLS LAST
      LIMIT ${pBatas}`, params);

  return {
    rumus: bacaRumus({ komponen, kali_seratus }, kat.labelKolom),
    contoh: rows.map((r) => ({
      nik: r.nik,
      nama: r.nama ?? "(tidak ada di daftar pengguna)",
      cabang: r.cabang,
      baris: Number(r.baris),
      nilai: r.nilai === null ? null : Number(r.nilai),
    })),
  };
}
