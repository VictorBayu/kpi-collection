const nf = new Intl.NumberFormat("id-ID");

export const rp = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "Rp " + nf.format(Math.round(n));

export function rpSingkat(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e9) return "Rp " + (n / 1e9).toFixed(1).replace(".", ",") + " M";
  if (Math.abs(n) >= 1e6) return "Rp " + Math.round(n / 1e6) + " jt";
  return rp(n);
}

export const angka = (n: number | null | undefined, desimal = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(desimal).replace(".", ",");

export const namaPeriode = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export const waktu = (iso: string | Date | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** Menerjemahkan nilai ke satuan yang dipahami pembaca. */
export function nilai(v: number | null, satuan: string): string {
  if (v === null || v === undefined) return "—";
  if (satuan === "persen") return Math.round(v * 100) + "%";
  if (satuan === "unit") return nf.format(v) + " unit";
  return rpSingkat(v);
}

export function selisih(v: number, satuan: string): string {
  if (satuan === "persen") return Math.round(v * 100) + " poin";
  if (satuan === "unit") return nf.format(Math.ceil(v)) + " unit";
  return rpSingkat(v);
}

/** Menebak satuan dari nama indikator — dipakai kalau kolom satuan kosong. */
export function tebakSatuan(indikator: string, nilai: number | null): "rupiah" | "persen" | "unit" {
  const s = indikator.toLowerCase();
  if (s.includes("rasio") || s.includes("ratio") || s.includes("%") || s.includes("persen")) return "persen";
  if (s.includes("kunjungan") || s.includes("unit") || s.includes("jumlah") || s.includes("staff")) return "unit";
  if (nilai === null) return "rupiah";
  const a = Math.abs(nilai);
  // Rasio biasanya 0–1 (0,4105 = 41%). Nilai finansial jauh lebih besar.
  if (a > 0 && a <= 1) return "persen";
  if (a >= 1000) return "rupiah";
  return "unit";
}

/**
 * Ubah nilai tanggal apa pun (Date dari driver, string ISO, dsb.)
 * menjadi "YYYY-MM-DD" yang aman untuk dikirim ke kolom Postgres `date`.
 * Menghindari bug String(Date) -> "Wed Jul 01 2026 ...".
 */
export function toISODate(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v ?? "");
  // sudah berbentuk 2026-07-01... -> ambil 10 karakter pertama
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // fallback: coba parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

/**
 * Memilih nilai yang sebanding dengan Target 3/4/5.
 * Di berkas KPI, sebagian indikator memakai target berupa RASIO
 * (mis. Delq: target 0,1415 / 0,1315 / 0,1215) sementara kolom
 * "Pencapaian" berisi nominal rupiah. Membandingkan rupiah dengan
 * rasio membuat semua indikator seolah "melewati target tertinggi".
 * Karena itu: kalau target berskala rasio dan kolom rasio tersedia,
 * gunakan rasio; selain itu gunakan pencapaian.
 */
export function nilaiBanding(
  pencapaian: number | null, rasio: number | null, t3: number | null,
): { v: number | null; satuan: "rupiah" | "persen" | "unit" } {
  const targetRasio = t3 !== null && Math.abs(t3) <= 1.5;
  if (targetRasio && rasio !== null) return { v: rasio, satuan: "persen" };
  return { v: pencapaian, satuan: pencapaian === null ? "rupiah" : tebakSatuan("", pencapaian) };
}
