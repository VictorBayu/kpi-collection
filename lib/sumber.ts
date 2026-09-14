import { q } from "./db";

/**
 * Registri sumber data.
 *
 * Sampai v20 daftar sumber tertanam di kode: 'api' dan 'pendukung', dengan
 * nama tabelnya ditulis langsung di setiap tempat yang menggabungkannya.
 * Menambah API kedua berarti menyunting mesin hitung, mesin kolom turunan,
 * dan layar katalog kolom sekaligus — tiga tempat yang mudah tertinggal
 * salah satunya.
 *
 * Berkas ini menjadikan daftar itu data: satu baris di tabel sumber_data
 * per sumber, dan seluruh SQL penggabungan dirakit dari baris itu. Sumber
 * ketiga cukup didaftarkan lewat layar admin.
 *
 * SOAL KEAMANAN. Nama tabel dan nama kolom kunci tidak bisa dilewatkan
 * sebagai parameter — keduanya harus ditempel ke teks SQL. Karena itu
 * keduanya disaring DUA KALI, sama seperti nama kolom pada katalog kolom:
 * oleh CHECK di database saat disimpan, dan oleh pola di sini sebelum
 * ditempel. Sumber yang namanya tidak lolos ditolak, bukan dilewati diam-
 * diam, supaya kekeliruan konfigurasi berhenti di tempat yang terlihat.
 */

export type JenisSumber = "utama" | "api" | "unggah";

export type Sumber = {
  kode: string;
  nama: string;
  jenis: JenisSumber;
  tabel: string;
  kunci_gabung: string;
  field_kunci: string | null;

  // konfigurasi penarikan (jenis 'api')
  url: string | null;
  metode: string;
  header: Record<string, string>;
  badan: any;
  per_cabang: boolean;
  param_cabang: string | null;
  param_tanggal: string | null;
  param_halaman: string | null;
  param_ukuran: string | null;
  ukuran_halaman: number;
  jalur_data: string | null;
  jalur_total: string | null;

  aktif: boolean;
  urutan: number;
  keterangan: string | null;
  ditarik_pada: string | null;
  baris_terakhir: number | null;
  galat: string | null;
};

/** Pola yang sama dengan CHECK di database. */
export const POLA_NAMA = /^[a-z][a-z0-9_]{1,50}$/;

export class SumberSalah extends Error {}

const KOLOM_SUMBER = `kode, nama, jenis, tabel, kunci_gabung, field_kunci,
  url, metode, header, badan, per_cabang, param_cabang, param_tanggal,
  param_halaman, param_ukuran, ukuran_halaman, jalur_data, jalur_total,
  aktif, urutan, keterangan, ditarik_pada, baris_terakhir, galat`;

function keSumber(r: any): Sumber {
  return {
    kode: r.kode, nama: r.nama, jenis: r.jenis, tabel: r.tabel,
    kunci_gabung: r.kunci_gabung, field_kunci: r.field_kunci ?? null,
    url: r.url, metode: r.metode ?? "GET",
    header: (r.header ?? {}) as Record<string, string>,
    badan: r.badan ?? null,
    per_cabang: r.per_cabang !== false,
    param_cabang: r.param_cabang, param_tanggal: r.param_tanggal,
    param_halaman: r.param_halaman, param_ukuran: r.param_ukuran,
    ukuran_halaman: Number(r.ukuran_halaman ?? 300),
    jalur_data: r.jalur_data, jalur_total: r.jalur_total,
    aktif: r.aktif !== false, urutan: Number(r.urutan ?? 100),
    keterangan: r.keterangan,
    ditarik_pada: r.ditarik_pada ?? null,
    baris_terakhir: r.baris_terakhir === null || r.baris_terakhir === undefined
      ? null : Number(r.baris_terakhir),
    galat: r.galat ?? null,
  };
}

export async function daftarSumber(hanyaAktif = false): Promise<Sumber[]> {
  const rows = await q<any>(
    `SELECT ${KOLOM_SUMBER} FROM sumber_data
      ${hanyaAktif ? "WHERE aktif" : ""}
      ORDER BY urutan, kode`);
  return rows.map(keSumber);
}

export async function satuSumber(kode: string): Promise<Sumber | null> {
  const [r] = await q<any>(
    `SELECT ${KOLOM_SUMBER} FROM sumber_data WHERE kode = $1`, [kode]);
  return r ? keSumber(r) : null;
}

export async function petaSumber(): Promise<Map<string, Sumber>> {
  return new Map((await daftarSumber()).map((s) => [s.kode, s]));
}

/**
 * Sumber utama — tempat NIK PIC, cabang, dan produk berada.
 *
 * Selalu ada tepat satu. Kalau registri belum terisi (mis. migrasi v21
 * belum dijalankan), dipakai bentuk lama supaya aplikasi tetap hidup
 * alih-alih gagal di setiap perhitungan.
 */
export const SUMBER_UTAMA_BAWAAN: Sumber = {
  kode: "api", nama: "API Collection (utama)", jenis: "utama",
  tabel: "data_mentah", kunci_gabung: "agreement_no", field_kunci: null,
  url: null, metode: "GET", header: {}, badan: null,
  per_cabang: true, param_cabang: "branch_id", param_tanggal: null,
  param_halaman: "page", param_ukuran: "limit", ukuran_halaman: 300,
  jalur_data: "data", jalur_total: null,
  aktif: true, urutan: 1, keterangan: null,
  ditarik_pada: null, baris_terakhir: null, galat: null,
};

export function sumberUtama(daftar: Sumber[]): Sumber {
  return daftar.find((s) => s.jenis === "utama") ?? SUMBER_UTAMA_BAWAAN;
}

/** Alias tabel di dalam SQL. Diturunkan dari kode, jadi selalu sah. */
export function aliasSumber(kode: string): string {
  if (!POLA_NAMA.test(kode)) {
    throw new SumberSalah(`Kode sumber "${kode}" tidak sah.`);
  }
  return `s_${kode}`;
}

/**
 * Klausa LEFT JOIN satu sumber tambahan ke tabel utama.
 *
 * LEFT, bukan INNER: kontrak yang belum punya baris di sumber tambahan
 * harus tetap ikut dihitung dengan nilai kosong. Baris yang hilang jauh
 * lebih sulit disadari daripada angka yang kosong — pelajaran yang sama
 * yang membuat kolom turunan memakai baris bayangan.
 *
 * COALESCE(aktif, true) membuat baris yang dinonaktifkan admin berhenti
 * ikut perhitungan tanpa perlu dihapus. Karena itu setiap tabel sumber
 * tambahan WAJIB punya kolom `aktif` — dijamin oleh pembuat tabelnya.
 */
export function klausaGabung(s: Sumber, utama: Sumber, aliasDasar = "dm"): string {
  if (!POLA_NAMA.test(s.tabel)) {
    throw new SumberSalah(`Nama tabel sumber "${s.kode}" tidak sah.`);
  }
  if (!POLA_NAMA.test(s.kunci_gabung) || !POLA_NAMA.test(utama.kunci_gabung)) {
    throw new SumberSalah(`Kunci gabung sumber "${s.kode}" tidak sah.`);
  }
  const a = aliasSumber(s.kode);
  return `\n       LEFT JOIN ${s.tabel} ${a}` +
         `\n         ON ${a}.${s.kunci_gabung} = ${aliasDasar}.${utama.kunci_gabung}` +
         `\n        AND COALESCE(${a}.aktif, true)`;
}

/**
 * Penunjuk kolom berkualifikasi tabel: `dm.kolom` untuk sumber utama,
 * `s_<kode>.kolom` untuk sumber tambahan.
 */
export function penunjukKolom(kolom: string, kodeSumber: string, kodeUtama: string): string {
  return kodeSumber === kodeUtama ? `dm.${kolom}` : `${aliasSumber(kodeSumber)}.${kolom}`;
}

/**
 * Merakit seluruh klausa gabung untuk sekumpulan sumber yang tersentuh
 * satu rumus. Sumber utama dilewati — ia tabel dasarnya, bukan tamu.
 */
export function gabungUntuk(
  dipakai: Iterable<string>, peta: Map<string, Sumber>, utama: Sumber,
  aliasDasar = "dm",
): string {
  const kode = [...new Set(dipakai)].filter((k) => k !== utama.kode).sort();
  let sql = "";
  for (const k of kode) {
    const s = peta.get(k);
    // Sumber yang hilang dari registri berarti katalog kolom menunjuk ke
    // sesuatu yang sudah tidak ada. Berhenti di sini, jangan menghasilkan
    // SQL yang diam-diam kehilangan satu tabel dan mengembalikan NULL.
    if (!s) throw new SumberSalah(`Sumber data "${k}" tidak terdaftar.`);
    sql += klausaGabung(s, utama, aliasDasar);
  }
  return sql;
}

/** Nama tabel fisik untuk sumber baru yang didaftarkan lewat layar admin. */
export function namaTabelSumber(kode: string): string {
  if (!POLA_NAMA.test(kode)) throw new SumberSalah("Kode sumber tidak sah.");
  return `data_sumber_${kode}`;
}
