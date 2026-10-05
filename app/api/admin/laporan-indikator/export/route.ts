import * as XLSX from "xlsx";
import { requireMenu, handler } from "@/lib/auth";
import { muatLaporanIndikator } from "@/lib/laporan-indikator-db";
import { periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import {
  saring, saringanDariUrl, statusDari, labelPeran, teksEfek, totalBobot, STATUS_LABEL,
  kunciBobot, labelBulan,
} from "@/lib/laporan-indikator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kosong untuk nilai yang memang tidak diisi, bukan nol. */
const n = (v: number | null) => (v === null ? "" : v);

export const GET = handler(async (req) => {
  await requireMenu("admin_laporan_indikator");
  const param = new URL(req.url).searchParams.get("periode");
  const semuaPeriode = param === "semua";
  const periode = semuaPeriode ? null : (periodeSah(param) ?? periodeBerjalan());
  const semua = await muatLaporanIndikator(periode);
  // Saringan yang sama persis dengan layar (lib/laporan-indikator.ts).
  const baris = saring(semua, saringanDariUrl(new URL(req.url).searchParams));
  const total = totalBobot(semua);

  const data = baris.map((b) => {
    const t = total.get(kunciBobot(b));
    return {
      PERIODE: labelBulan(b.periode),
      JABATAN: b.jabatan,
      PRODUK: b.produk,
      "NAMA PRODUK": b.produkNama ?? "",
      INDIKATOR: b.indikator,
      SATUAN: b.satuan ?? "",
      PERAN: labelPeran(b.peran),
      "BOBOT KPI (%)": n(b.bobotKpi),
      "BOBOT INSENTIF (%)": n(b.bobotInsentif),
      "FAKTOR PENGAKUAN (%)": b.faktorPengakuan,
      "EFEK REWARD/PENALTY": teksEfek(b),
      "TARGET KPI 3": n(b.targetKpi3),
      "TARGET KPI 4": n(b.targetKpi4),
      "TARGET KPI 5": n(b.targetKpi5),
      "PAKAI PITA": b.adaPita ? "Ya" : "Tidak",
      STATUS: STATUS_LABEL[statusDari(b)],
      "INDIKATOR AKTIF": b.aktifIndikator ? "Ya" : "Tidak",
      "PENDAFTARAN AKTIF": b.aktifDaftar ? "Ya" : "Tidak",
      "TOTAL BOBOT KPI JABATAN·PRODUK": t ? t.kpi : "",
      "TOTAL BOBOT INSENTIF JABATAN·PRODUK": t ? t.ins : "",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 40 }, { wch: 10 }, { wch: 18 },
    { wch: 13 }, { wch: 17 }, { wch: 19 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 11 }, { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "LAPORAN INDIKATOR");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const tanggal = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-indikator-${periode ? periode.slice(0, 7) : "semua-periode"}-${tanggal}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
