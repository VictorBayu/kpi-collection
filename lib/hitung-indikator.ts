import { q } from "./db";
import { susunRumus, bacaRumus, RumusSalah, type Komponen, type Syarat } from "./rumus";
import { hitungSemuaTurunan } from "./turunan";
import { daftarSumber, sumberUtama, penunjukKolom, gabungUntuk } from "./sumber";
import { sumberUntukPeriode, type SumberMentah } from "./arsip-mentah";

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
  /** true bila dihitung dari arsip data mentah (bukan data_mentah langsung). */
  dariArsip: boolean;
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
  const [rows, daftar] = await Promise.all([
    q<{ kolom: string; label: string; jenis: string; sumber: string }>(
      `SELECT kolom, label, jenis, COALESCE(sumber,'api') AS sumber FROM mentah_kolom`),
    daftarSumber(),
  ]);

  const sah = new Set(rows.map((r) => r.kolom));
  const label = new Map(rows.map((r) => [r.kolom, r.label]));
  const sumberKolom = new Map(rows.map((r) => [r.kolom, r.sumber]));

  const peta = new Map(daftar.map((s) => [s.kode, s]));
  const utama = sumberUtama(daftar);

  /**
   * Sumber yang tersentuh selama satu rumus dirakit.
   *
   * Dicatat sambil jalan, bukan ditebak di muka: hanya sumber yang benar-
   * benar dipakai rumusnya yang perlu digabung, dan penggabungan yang
   * tidak perlu membuat setiap perhitungan membayar ongkos join tanpa
   * alasan.
   */
  const dipakai = new Set<string>();

  return {
    /** Mengembalikan nama kolom yang aman ditempel ke SQL, atau melempar. */
    kolomSah(kode: string): string {
      if (!sah.has(kode)) {
        throw new RumusSalah(`Kolom "${kode}" tidak ada di katalog data mentah.`);
      }
      const s = sumberKolom.get(kode) ?? utama.kode;
      dipakai.add(s);
      return penunjukKolom(kode, s, utama.kode);
    },
    labelKolom: (k: string) => label.get(k) ?? k,
    /**
     * Klausa gabung untuk seluruh sumber tambahan yang tersentuh rumus
     * terakhir. Kosong bila rumusnya hanya memakai data utama.
     */
    gabungDipakai: () => gabungUntuk(dipakai, peta, utama),
    /** Dikosongkan sebelum merakit rumus berikutnya. */
    resetPakai: () => dipakai.clear(),
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
    `SELECT id, indikator_id, urutan, agregat, kolom, operator_sebelum,
            gabung_syarat, pengakuan_kolom
       FROM indikator_komponen WHERE indikator_id = ANY($1::uuid[])
      ORDER BY indikator_id, urutan`, [ids]);

  const [syarat, pengakuan] = komponen.length
    ? await Promise.all([
        q<any>(
          `SELECT komponen_id, kolom, operator, nilai
             FROM indikator_syarat WHERE komponen_id = ANY($1::uuid[])
            ORDER BY komponen_id, urutan`,
          [komponen.map((k) => k.id)]),
        q<any>(
          `SELECT komponen_id, nilai, persen
             FROM indikator_pengakuan WHERE komponen_id = ANY($1::uuid[])
            ORDER BY komponen_id, urutan`,
          [komponen.map((k) => k.id)]),
      ])
    : [[], []];

  const perPengakuan = new Map<string, { nilai: string; persen: number }[]>();
  for (const b of pengakuan) {
    const arr = perPengakuan.get(b.komponen_id) ?? [];
    arr.push({ nilai: b.nilai, persen: Number(b.persen) });
    perPengakuan.set(b.komponen_id, arr);
  }

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
      pengakuan_kolom: k.pengakuan_kolom,
      pengakuan: perPengakuan.get(k.id) ?? [],
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
  sumber: SumberMentah,
): Promise<number> {
  const params: any[] = [];
  kat.resetPakai();
  const ekspresi = susunRumus(
    { komponen: d.komponen, kali_seratus: d.kali_seratus },
    kat.kolomSah, params,
  );
  // Sumber tambahan digabung hanya bila rumusnya benar-benar memakainya.
  const joinPendukung = kat.gabungDipakai();

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
  const skorPita = `poin_dari_pita(g.target_id, g.nilai)`;
  const skorLama = `
    CASE
      WHEN g.nilai IS NULL OR g.target_kpi3 IS NULL THEN NULL
      WHEN g.target_kpi5 IS NOT NULL AND g.nilai >= g.target_kpi5 THEN 5
      WHEN g.target_kpi5 IS NOT NULL AND g.target_kpi4 IS NOT NULL
           AND g.nilai >= g.target_kpi4 AND g.target_kpi5 <> g.target_kpi4
        THEN 4 + (g.nilai - g.target_kpi4) / (g.target_kpi5 - g.target_kpi4)
      WHEN g.target_kpi4 IS NOT NULL AND g.nilai >= g.target_kpi3
           AND g.target_kpi4 <> g.target_kpi3
        THEN 3 + (g.nilai - g.target_kpi3) / (g.target_kpi4 - g.target_kpi3)
      WHEN g.nilai >= g.target_kpi3 THEN 3
      WHEN g.target_kpi3 = 0 THEN 0
      ELSE GREATEST(0, 3 * g.nilai / NULLIF(g.target_kpi3, 0))
    END`;
  const skor = `
    CASE
      WHEN g.nilai IS NULL THEN NULL
      WHEN g.ada_pita THEN ${skorPita}
      ELSE (${skorLama})
    END`;

  const sql = `
    WITH terdaftar AS (
      SELECT u.nik, u.nama, u.jabatan, u.cabang,
             t.id AS target_id, t.peran, t.jenis_nilai, t.nilai_efek,
             t.bobot_kpi, t.bobot_insentif, t.faktor_pengakuan,
             t.target_kpi3, t.target_kpi4, t.target_kpi5,
             EXISTS (SELECT 1 FROM indikator_pita p WHERE p.target_id = t.id) AS ada_pita
        FROM indikator_target t
        JOIN jabatan_produk jp ON jp.alias = t.alias AND jp.produk = t.produk
        JOIN app_user u ON norm_jabatan(u.jabatan) = t.alias AND u.aktif
       WHERE t.indikator_id = ${pIndikator} AND t.produk = ${pProduk} AND t.aktif
    ),
    hitung AS (
      SELECT dm.${kolomNik} AS nik, (${ekspresi}) AS nilai
        FROM ${sumber.ekspresiDari(params)} dm${joinPendukung}
       WHERE dm.${kolomNik} IS NOT NULL
         AND upper(btrim(COALESCE(dm.product, ''))) = upper(${pProduk})
       GROUP BY dm.${kolomNik}
    ),
    -- Pengakuan sebagian diterapkan di sini, sebelum dicocokkan ke
    -- pita/target apa pun — bukan cuma di tampilan. Jabatan yang
    -- menghandle lebih dari satu produk (mis. MBS MIX di R2 dan R4) bisa
    -- diberi faktor < 100 di pendaftarannya, supaya pencapaian mentah
    -- yang ikut dinilai memang cuma porsi kerjanya di produk ini — bukan
    -- seluruh portofolio produk itu dihitung penuh untuknya. 100 (nilai
    -- baku) berarti tidak mengubah apa pun.
    gabung AS (
      SELECT t.nik, t.nama, t.jabatan, t.cabang, t.target_id, t.peran,
             t.jenis_nilai, t.nilai_efek, t.bobot_kpi, t.bobot_insentif,
             t.target_kpi3, t.target_kpi4, t.target_kpi5, t.ada_pita,
             h.nilai * t.faktor_pengakuan / 100 AS nilai
        FROM terdaftar t
        LEFT JOIN hitung h ON h.nik = t.nik
    )
    INSERT INTO kpi_row
      (periode, nik, nama, jabatan, cabang, produk, indikator, indikator_id,
       bobot, bobot_insentif, pencapaian, skor_kpi, skor_terbobot, skor_terbobot_ins,
       target_kpi3, target_kpi4, target_kpi5, satuan, catatan,
       peran, jenis_nilai, nilai_efek,
       sumber, batch_id, dihitung_pada)
    SELECT ${pPeriode}::date, g.nik, g.nama, g.jabatan, g.cabang, ${pProduk},
           ${pNama}, ${pIndikator}::uuid,
           g.bobot_kpi, g.bobot_insentif, g.nilai,
           ROUND((${skor})::numeric, 2),
           -- Bobot kosong berarti indikator ini memang tidak ikut skema
           -- tersebut, jadi hasilnya NULL — bukan nol. Nol akan terbaca
           -- sebagai "ikut dinilai tapi tidak dapat apa-apa", padahal
           -- yang benar adalah "tidak ikut dinilai sama sekali". Peran di
           -- luar kpi/reguler (reward, penalty, tier, nominal, pendukung)
           -- juga dipaksa NULL di sini walau bobotnya terisi, supaya baris
           -- semacam itu tidak pernah ikut menyumbang skor KPI atau skor
           -- insentif reguler secara tidak sengaja — sumbangannya ke
           -- nominal dihitung terpisah, bukan lewat jalur bobot ini.
           -- 'pendukung' bahkan tidak membayar apa pun: ia ada semata
           -- supaya angkanya bisa dibaca gerbang dan pemilih pita.
           CASE WHEN g.peran NOT IN ('kpi','reguler') OR g.bobot_kpi IS NULL THEN NULL
                ELSE ROUND((${skor})::numeric * g.bobot_kpi / 100, 2) END,
           CASE WHEN g.peran NOT IN ('kpi','reguler') OR g.bobot_insentif IS NULL THEN NULL
                ELSE ROUND((${skor})::numeric * g.bobot_insentif / 100, 2) END,
           g.target_kpi3, g.target_kpi4, g.target_kpi5,
           ${pSatuan}, ${pCatatan},
           g.peran, g.jenis_nilai, g.nilai_efek,
           'api', NULL, now()
      FROM gabung g
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
 * Menilai gerbang kelayakan lalu menetapkan nominal datar per baris.
 *
 * Dijalankan setelah seluruh indikator selesai dihitung dan sebelum
 * insentif dirangkum, karena sebuah gerbang boleh menunjuk indikator lain
 * — "jumlah kontrak >= 5" tidak bisa dinilai sebelum jumlah kontraknya
 * sendiri ada di kpi_row.
 *
 * Hasilnya ditulis balik ke barisnya (nominal_baris, gerbang_gagal), bukan
 * dihitung ulang saat merangkum insentif. Dua alasan: kueri insentif tidak
 * perlu menjangkau baris indikator lain milik orang yang sama, dan alasan
 * "kenapa saya tidak dapat" ikut tersimpan permanen — pertanyaan itu pasti
 * datang, dan jawabannya sebaiknya sudah ada sejak angkanya dihitung.
 */
async function nilaiGerbang(periode: string): Promise<number> {
  const hasil = await q<any>(
    `WITH baris AS (
       SELECT k.id, k.nik, k.produk, k.periode, k.indikator_id,
              k.pencapaian, t.id AS target_id, t.pemilih_id
         FROM kpi_row k
         JOIN indikator_target t
           ON t.indikator_id = k.indikator_id
          AND t.produk       = k.produk
          AND t.alias        = norm_jabatan(k.jabatan)
          AND t.aktif
        WHERE k.sumber = 'api' AND k.periode = $1 AND k.peran = 'nominal'
     ),
     -- Tiap gerbang dicarikan angka ukurnya. sumber_id kosong berarti
     -- diuji pada indikator baris ini sendiri; terisi berarti pada
     -- indikator lain milik orang dan produk yang sama.
     diukur AS (
       SELECT b.id AS row_id, g.urutan, g.operator, g.nilai,
              COALESCE(NULLIF(BTRIM(g.label), ''), d.nama, 'Syarat') AS label,
              (SELECT s.pencapaian FROM kpi_row s
                WHERE s.sumber = 'api' AND s.periode = b.periode
                  AND s.nik = b.nik AND s.produk = b.produk
                  AND s.indikator_id = COALESCE(g.sumber_id, b.indikator_id)
                LIMIT 1) AS ukur
         FROM baris b
         JOIN indikator_gerbang g ON g.target_id = b.target_id
         LEFT JOIN indikator_def d ON d.id = g.sumber_id
     ),
     dinilai AS (
       SELECT row_id, urutan, label, ukur, operator, nilai,
              CASE
                -- Angka ukur tidak ada berarti indikator sumbernya belum
                -- didaftarkan atau belum terhitung. Dianggap GAGAL, bukan
                -- lulus: membayar karena syaratnya tak terperiksa adalah
                -- kekeliruan yang jauh lebih mahal daripada menahan bayar.
                WHEN ukur IS NULL           THEN FALSE
                WHEN operator = 'lebih'      THEN ukur >  nilai
                WHEN operator = 'lebih_sama' THEN ukur >= nilai
                WHEN operator = 'kurang'     THEN ukur <  nilai
                WHEN operator = 'kurang_sama'THEN ukur <= nilai
                WHEN operator = 'sama'       THEN ukur =  nilai
                ELSE FALSE
              END AS lulus
         FROM diukur
     ),
     rekap AS (
       SELECT b.id, b.target_id, b.pemilih_id, b.nik, b.produk, b.periode,
              b.indikator_id, b.pencapaian,
              -- Tanpa gerbang sama sekali berarti tidak ada yang menahan.
              COALESCE(bool_and(d.lulus), TRUE) AS lolos,
              string_agg(
                d.label || ' ' ||
                CASE d.operator WHEN 'lebih' THEN '>' WHEN 'lebih_sama' THEN '>='
                                WHEN 'kurang' THEN '<' WHEN 'kurang_sama' THEN '<='
                                ELSE '=' END || ' ' ||
                TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM d.nilai::text)) ||
                ' (nilai ' || COALESCE(
                  TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM d.ukur::text)),
                  'tidak ada') || ')',
                '; ' ORDER BY d.urutan
              ) FILTER (WHERE NOT d.lulus) AS gagal
         FROM baris b
         LEFT JOIN dinilai d ON d.row_id = b.id
        GROUP BY b.id, b.target_id, b.pemilih_id, b.nik, b.produk,
                 b.periode, b.indikator_id, b.pencapaian
     ),
     -- Nilai pemilih pita: indikator lain kalau ditunjuk, kalau tidak
     -- nilai baris ini sendiri.
     final AS (
       SELECT r.*,
              CASE WHEN r.pemilih_id IS NULL THEN r.pencapaian
                   ELSE (SELECT s.pencapaian FROM kpi_row s
                          WHERE s.sumber = 'api' AND s.periode = r.periode
                            AND s.nik = r.nik AND s.produk = r.produk
                            AND s.indikator_id = r.pemilih_id
                          LIMIT 1) END AS nilai_pemilih
         FROM rekap r
     )
     UPDATE kpi_row k
        SET nominal_baris = CASE WHEN f.lolos
                                 THEN nominal_dari_pita(f.target_id, f.nilai_pemilih)
                                 ELSE 0 END,
            gerbang_gagal = f.gagal
       FROM final f
      WHERE k.id = f.id`,
    [periode]);

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
 * Untuk mekanisme 'pagu', jabatan yang menghandle lebih dari satu produk
 * sekaligus (mis. MBS MIX menghandle R2 & R4) TIDAK dinilai per produk
 * sendiri-sendiri. SKOR seluruh produknya dijumlahkan dulu (lihat CTE
 * gabung_pagu), lalu: ambang minimal dicek dari skor gabungan itu, dan
 * nominalnya dihitung sekali untuk seluruh jabatan dengan pembagi dan pagu
 * jabatan — bukan pembagi/pagu yang ikut dijumlahkan, karena satu orang
 * hanya punya satu pagu meski baris paguya tercatat per produk. Hasilnya
 * baru dibagi kembali ke tiap produk sesuai porsi sumbangan skornya, agar
 * jumlah seluruh baris insentif orang itu tepat sama dengan nominal
 * jabatannya. Jabatan satu produk tidak berubah sama sekali.
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
                FILTER (WHERE k.peran = 'penalty' AND k.jenis_nilai = 'persen'),  0) AS penalty_persen,
              -- Nominal datar bersyarat sudah dinilai per baris oleh
              -- nilaiGerbang(); di sini tinggal dijumlahkan.
              COALESCE(SUM(k.nominal_baris)
                FILTER (WHERE k.peran = 'nominal'), 0) AS nominal_bersyarat,
              COUNT(*) FILTER (WHERE k.peran = 'nominal')::int AS jml_bersyarat,
              string_agg(k.gerbang_gagal, '; ')
                FILTER (WHERE k.peran = 'nominal' AND k.gerbang_gagal IS NOT NULL)
                AS sebab_gagal
         FROM kpi_row k
        WHERE k.sumber = 'api' AND k.periode = $1
        GROUP BY k.nik, k.produk
     ),
     lengkap AS (
       SELECT d.*, kelas_cabang(d.cabang, d.produk, $1::date) AS kelas
         FROM dasar d
     ),
     -- Skor seluruh produk 'pagu' milik satu jabatan dijumlahkan per
     -- (nik, jabatan) -- supaya jabatan yang menghandle lebih dari satu
     -- produk (mis. MBS MIX menghandle R2 & R4) dinilai dari HASIL AKHIR
     -- gabungan, bukan tiap produk harus sendiri-sendiri menembus ambang
     -- minimal.
     --
     -- Yang DIJUMLAHKAN hanya skornya. Pembagi dan pagu TIDAK: keduanya
     -- milik jabatan, bukan milik produk -- satu orang MBS MIX punya satu
     -- pagu, walau baris paguya tercatat dua kali (sekali untuk R2,
     -- sekali untuk R4) karena tabelnya memang berkunci jabatan+produk.
     -- Menjumlahkannya akan melipatgandakan pagu jabatan. Dipakai MAX
     -- supaya kalau baris pagu antarproduk kebetulan tidak seragam,
     -- yang terpakai tetap satu angka yang jelas (dan Tracing memberi
     -- peringatan kalau nilainya berbeda-beda).
     --
     -- Jabatan yang cuma menghandle satu produk tidak berubah sama
     -- sekali: gabungannya ya cuma dirinya sendiri, porsinya 100%.
     gabung_pagu AS (
       SELECT l.nik, norm_jabatan(l.jabatan) AS alias,
              SUM(l.total_skor)   AS skor_gabungan,
              MAX(g.pembagi)      AS pembagi_gabungan,
              MAX(g.nominal)      AS pagu_gabungan,
              MAX(g.skor_minimal) AS ambang_gabungan,
              COUNT(*)::int       AS jml_produk_gabungan
         FROM lengkap l
         JOIN insentif_pagu g
           ON g.alias = norm_jabatan(l.jabatan) AND g.produk = l.produk AND g.aktif
        WHERE g.mekanisme = 'pagu'
        GROUP BY l.nik, norm_jabatan(l.jabatan)
     ),
     pokok AS (
       SELECT l.*, g.alias, g.mekanisme,
              g.nominal AS pagu_nominal, g.skor_minimal, g.pembagi,
              gp.skor_gabungan, gp.pembagi_gabungan, gp.pagu_gabungan,
              gp.ambang_gabungan, gp.jml_produk_gabungan,
              CASE
                WHEN g.mekanisme = 'bersyarat' THEN l.nominal_bersyarat
                WHEN g.mekanisme = 'tier' THEN
                  COALESCE((SELECT it.nominal FROM insentif_tier it
                             WHERE it.alias = g.alias AND it.produk = g.produk
                               AND it.tier = l.tier AND it.kelas = l.kelas), 0)
                WHEN g.mekanisme = 'pagu' THEN
                  CASE
                    WHEN gp.skor_gabungan IS NULL
                      OR gp.skor_gabungan < gp.ambang_gabungan THEN 0
                    ELSE COALESCE(ROUND(
                      -- Nominal utuh jabatan ini: skor gabungan seluruh
                      -- produknya dibagi pembagi jabatan dikali pagu
                      -- jabatan. Lalu diambil bagian yang sebanding dengan
                      -- sumbangan skor produk ini terhadap skor gabungan,
                      -- supaya jumlah seluruh barisnya persis nominal itu.
                      (gp.skor_gabungan / NULLIF(gp.pembagi_gabungan, 0) * gp.pagu_gabungan)
                      * (l.total_skor / NULLIF(gp.skor_gabungan, 0))
                    , 0), 0)
                  END
                ELSE 0
              END AS nominal_dasar
         FROM lengkap l
         JOIN insentif_pagu g
           ON g.alias = norm_jabatan(l.jabatan) AND g.produk = l.produk AND g.aktif
         LEFT JOIN gabung_pagu gp
           ON gp.nik = l.nik AND gp.alias = norm_jabatan(l.jabatan) AND g.mekanisme = 'pagu'
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
              WHEN p.mekanisme = 'bersyarat' THEN
                CASE
                  WHEN p.jml_bersyarat = 0
                    THEN 'Mekanisme bersyarat, tapi belum ada indikator berperan nominal'
                  WHEN p.sebab_gagal IS NOT NULL
                    THEN 'Tidak cair — ' || p.sebab_gagal
                  ELSE 'Semua syarat terpenuhi, nominal dari pita'
                END
              WHEN p.mekanisme = 'tier' THEN
                'Tier ' || COALESCE(p.tier::text, '-') ||
                ' x kelas ' || COALESCE(p.kelas, '-') ||
                CASE WHEN p.kelas IS NULL OR p.tier IS NULL
                       OR p.nominal_dasar = 0 AND p.tier IS NOT NULL AND p.kelas IS NOT NULL
                     THEN ' (cek: tier/kelas belum lengkap atau tidak ada di tabel)'
                     ELSE '' END
              -- Mekanisme 'pagu' dengan lebih dari satu produk gabungan
              -- (jabatan menghandle beberapa produk sekaligus, mis. MBS
              -- MIX R2+R4): ambang dan nominal dihitung dari HASIL AKHIR
              -- gabungan seluruh produk, bukan tiap produk sendiri-sendiri.
              WHEN p.mekanisme = 'pagu' AND p.jml_produk_gabungan > 1 AND
                   (p.skor_gabungan IS NULL OR p.skor_gabungan < p.ambang_gabungan)
                THEN 'Skor gabungan ' || COALESCE(ROUND(p.skor_gabungan, 2)::text, '-') ||
                     ' dari ' || p.jml_produk_gabungan || ' produk (' || p.produk ||
                     ' menyumbang ' || COALESCE(ROUND(p.total_skor, 2)::text, '-') ||
                     ') di bawah minimal gabungan ' || p.ambang_gabungan
              WHEN p.mekanisme = 'pagu' AND p.jml_produk_gabungan > 1 THEN
                'Skor gabungan ' || ROUND(p.skor_gabungan, 2) || ' / ' || p.pembagi_gabungan ||
                ' x pagu ' || p.pagu_gabungan || ' (gabungan ' || p.jml_produk_gabungan ||
                ' produk) — bagian ' || p.produk || ' = ' || ROUND(p.total_skor, 2) || '/' ||
                ROUND(p.skor_gabungan, 2) || ' dari nominal gabungan itu'
              WHEN p.mekanisme = 'pagu' AND
                   (p.total_skor IS NULL OR p.total_skor < p.skor_minimal)
                THEN 'Skor ' || COALESCE(ROUND(p.total_skor, 2)::text, '-') ||
                     ' di bawah minimal ' || p.skor_minimal
              WHEN p.mekanisme = 'pagu' THEN
                ROUND(p.total_skor, 2) || ' / ' || p.pembagi ||
                ' x pagu ' || p.pagu_nominal
              ELSE 'Mekanisme insentif tidak dikenal'
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

  // Kolom turunan dihitung LEBIH DULU: indikator boleh memakainya seperti
  // kolom biasa, jadi isinya harus sudah mutakhir sebelum rumus dijalankan.
  // Kegagalannya tidak menghentikan proses — kolom itu saja yang tertinggal,
  // dan sebabnya tercatat untuk dilihat admin.
  const turunan = await hitungSemuaTurunan().catch(
    () => ({ berhasil: 0, gagal: [] as { kolom: string; pesan: string }[] }));

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

  // Sumber data mentah ditentukan SEKALI di sini, dipakai ulang untuk
  // seluruh pasangan indikator×produk periode ini: kalau periode ini
  // sudah punya arsip data mentah yang diterbitkan (lihat menu "Arsip
  // Data Mentah"), rumus dihitung dari arsip itu, bukan dari data_mentah
  // (yang hanya berisi snapshot hari ini). Kalau belum ada arsipnya —
  // termasuk periode berjalan — jatuh balik ke data_mentah seperti biasa.
  const sumber = await sumberUntukPeriode(p);

  for (const d of daftar) {
    const produkList = perIndikator.get(d.id) ?? [];
    if (!produkList.length) continue;

    let adaYangJalan = false;
    for (const produk of produkList) {
      try {
        baris += await hitungSatu(d, produk, p, kat, sumber);
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

  // Gerbang dinilai setelah semua indikator ada di kpi_row — sebuah
  // gerbang boleh menunjuk indikator lain, jadi urutannya tidak bisa
  // dibalik. Kegagalannya tidak menghentikan perhitungan insentif:
  // baris bersyarat akan bernominal kosong, dan itu lebih baik daripada
  // seluruh insentif satu periode tidak terbit.
  try {
    await nilaiGerbang(p);
  } catch (e) {
    gagal.push({
      indikator: "Gerbang nominal bersyarat",
      pesan: e instanceof Error ? e.message : String(e),
    });
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

  for (const t of turunan.gagal) {
    gagal.push({ indikator: `Kolom turunan ${t.kolom}`, pesan: t.pesan });
  }

  return { indikator: terhitung, baris, insentif, periode: p, gagal, dariArsip: sumber.arsip };
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
  kat.resetPakai();
  const ekspresi = susunRumus({ komponen, kali_seratus }, kat.kolomSah, params);
  const joinPendukung = kat.gabungDipakai();
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
       FROM data_mentah dm${joinPendukung}
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
