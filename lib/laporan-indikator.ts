/**
 * Laporan pendaftaran indikator per jabatan·produk -- bagian yang aman
 * dipakai di browser maupun server (tanpa akses database).
 *
 * Saringan & penurunan status sengaja ditaruh di satu tempat ini dan
 * dipakai bersama oleh layar laporan dan unduhan Excel, supaya baris yang
 * terlihat di layar dan baris di berkas yang diunduh selalu persis sama.
 */

export type BarisLaporan = {
  id: string;
  /** Bulan berlaku pendaftaran (YYYY-MM-DD, tanggal 1). */
  periode: string;
  indikatorId: string;
  indikator: string;
  satuan: string | null;
  jabatan: string;
  produk: string;
  produkNama: string | null;
  peran: string;
  jenisNilai: string | null;
  nilaiEfek: number | null;
  bobotKpi: number | null;
  bobotInsentif: number | null;
  faktorPengakuan: number;
  targetKpi3: number | null;
  targetKpi4: number | null;
  targetKpi5: number | null;
  adaPita: boolean;
  aktifIndikator: boolean;
  aktifDaftar: boolean;
};

/**
 * Label peran, disamakan dengan pilihan di Create Indicator. Nilai lama
 * 'reguler' di database diperlakukan sama dengan 'kpi' -- persis seperti
 * layar Create Indicator memuatnya (IndikatorClient: reguler -> kpi).
 */
export const PERAN_LABEL: Record<string, string> = {
  kpi: "Reguler",
  reward: "Reward",
  penalty: "Penalty",
  tier: "Penentu tier",
  nominal: "Nominal bersyarat",
  pendukung: "Pendukung",
};

export const normPeran = (p: string | null | undefined) =>
  !p || p === "reguler" ? "kpi" : p;

export const labelPeran = (p: string | null | undefined) =>
  PERAN_LABEL[normPeran(p)] ?? String(p);

export type Status = "aktif" | "daftar_nonaktif" | "indikator_nonaktif";

/**
 * Baris baru ikut dihitung bila indikatornya aktif DAN pendaftarannya
 * aktif. Indikator yang dinonaktifkan mematikan semua pendaftarannya
 * sekaligus, jadi alasan itu didahulukan.
 */
export function statusDari(b: Pick<BarisLaporan, "aktifIndikator" | "aktifDaftar">): Status {
  if (!b.aktifIndikator) return "indikator_nonaktif";
  if (!b.aktifDaftar) return "daftar_nonaktif";
  return "aktif";
}

export const STATUS_LABEL: Record<Status, string> = {
  aktif: "Aktif",
  daftar_nonaktif: "Nonaktif (pendaftaran)",
  indikator_nonaktif: "Nonaktif (indikator)",
};

export type Saringan = {
  cari?: string;
  jabatan?: string;
  produk?: string;
  peran?: string;
  /** "" = semua, "aktif", "nonaktif" (keduanya), atau kode Status. */
  status?: string;
};

export function saring(baris: BarisLaporan[], s: Saringan): BarisLaporan[] {
  const k = (s.cari ?? "").trim().toLowerCase();
  return baris.filter((b) => {
    const st = statusDari(b);
    if (s.jabatan && b.jabatan !== s.jabatan) return false;
    if (s.produk && b.produk !== s.produk) return false;
    if (s.peran && normPeran(b.peran) !== s.peran) return false;
    if (s.status === "aktif" && st !== "aktif") return false;
    if (s.status === "nonaktif" && st === "aktif") return false;
    if (s.status && !["aktif", "nonaktif"].includes(s.status) && st !== s.status) return false;
    if (k && ![b.indikator, b.jabatan, b.produk, b.produkNama ?? ""]
      .some((t) => t.toLowerCase().includes(k))) return false;
    return true;
  });
}

/**
 * Jumlah bobot KPI & insentif baris Reguler yang aktif per jabatan·produk,
 * dihitung atas SELURUH pendaftaran (bukan hanya yang lolos saringan),
 * supaya angka ini tidak ikut berubah saat admin menyaring satu indikator.
 * Idealnya 100; selain itu tanda susunan bobot belum lengkap/berlebih.
 */
/** Kunci jumlah bobot: per periode·jabatan·produk. */
export const kunciBobot = (b: Pick<BarisLaporan, "periode" | "jabatan" | "produk">) =>
  `${b.periode}|${b.jabatan}|${b.produk}`;

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
export function labelBulan(p: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(p ?? "");
  return m ? `${BULAN[Number(m[2]) - 1]} ${m[1]}` : p;
}

export function totalBobot(baris: BarisLaporan[]) {
  const peta = new Map<string, { kpi: number; ins: number }>();
  for (const b of baris) {
    if (statusDari(b) !== "aktif" || normPeran(b.peran) !== "kpi") continue;
    const kunci = kunciBobot(b);
    const t = peta.get(kunci) ?? { kpi: 0, ins: 0 };
    t.kpi += b.bobotKpi ?? 0;
    t.ins += b.bobotInsentif ?? 0;
    peta.set(kunci, t);
  }
  return peta;
}

/** Teks efek reward/penalty: "Rp50.000 / satuan" atau "1% / satuan". */
export function teksEfek(b: Pick<BarisLaporan, "peran" | "jenisNilai" | "nilaiEfek">): string {
  const p = normPeran(b.peran);
  if ((p !== "reward" && p !== "penalty") || b.nilaiEfek === null) return "";
  return b.jenisNilai === "persen"
    ? `${b.nilaiEfek.toLocaleString("id-ID")}% / satuan`
    : `Rp${b.nilaiEfek.toLocaleString("id-ID")} / satuan`;
}

/** Saringan dari query string -- dipakai rute unduhan. */
export function saringanDariUrl(p: URLSearchParams): Saringan {
  return {
    cari: p.get("cari") ?? "",
    jabatan: p.get("jabatan") ?? "",
    produk: p.get("produk") ?? "",
    peran: p.get("peran") ?? "",
    status: p.get("status") ?? "",
  };
}
