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
  if (s.includes("rasio") || s.includes("ratio") || s.includes("%")) return "persen";
  if (s.includes("kunjungan") || s.includes("unit") || s.includes("jumlah")) return "unit";
  if (nilai !== null && Math.abs(nilai) <= 5) return "persen";
  return "rupiah";
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
