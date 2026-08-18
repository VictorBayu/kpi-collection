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
   * Skor KPI dari pencapaian.
   *
   * Interpolasi lurus di antara ambang, bukan lompatan bertingkat: dengan
   * lompatan, pencapaian 3,99 dan 3,01 bernilai sama padahal jaraknya jauh,
   * dan itu menghapus insentif untuk memperbaiki sedikit demi sedikit.
   * Di bawah KPI 3 skornya menurun sebanding sampai nol.
   */
  const skor = `
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

  const sql = `
    WITH terdaftar AS (
      SELECT u.nik, u.nama, u.jabatan, u.cabang,
             t.bobot, t.target_kpi3, t.target_kpi4, t.target_kpi5
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
       bobot, pencapaian, skor_kpi, skor_terbobot,
       target_kpi3, target_kpi4, target_kpi5, satuan, catatan,
       sumber, batch_id, dihitung_pada)
    SELECT ${pPeriode}::date, t.nik, t.nama, t.jabatan, t.cabang, ${pProduk},
           ${pNama}, ${pIndikator}::uuid,
           t.bobot, h.nilai,
           ROUND((${skor})::numeric, 2),
           ROUND((${skor})::numeric * COALESCE(t.bobot, 1) / 100, 2),
           t.target_kpi3, t.target_kpi4, t.target_kpi5,
           ${pSatuan}, ${pCatatan},
           'api', NULL, now()
      FROM terdaftar t
      LEFT JOIN hitung h ON h.nik = t.nik
    ON CONFLICT (nik, periode, indikator_id, produk) WHERE sumber = 'api'
    DO UPDATE SET
      pencapaian    = EXCLUDED.pencapaian,
      skor_kpi      = EXCLUDED.skor_kpi,
      skor_terbobot = EXCLUDED.skor_terbobot,
      bobot         = EXCLUDED.bobot,
      target_kpi3   = EXCLUDED.target_kpi3,
      target_kpi4   = EXCLUDED.target_kpi4,
      target_kpi5   = EXCLUDED.target_kpi5,
      satuan        = EXCLUDED.satuan,
      catatan       = EXCLUDED.catatan,
      nama          = EXCLUDED.nama,
      jabatan       = EXCLUDED.jabatan,
      cabang        = EXCLUDED.cabang,
      dihitung_pada = now()`;

  const hasil = await q<any>(sql, params);
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

  return { indikator: terhitung, baris, periode: p, gagal };
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
