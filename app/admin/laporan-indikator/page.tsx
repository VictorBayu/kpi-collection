import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";
import { muatLaporanIndikator } from "@/lib/laporan-indikator-db";
import { statusDari, totalBobot, labelBulan } from "@/lib/laporan-indikator";
import { daftarPeriodeIndikator, periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import Client from "./Client";

export const metadata = { title: "Laporan Indikator" };
export const dynamic = "force-dynamic";

const angka = (v: number) => v.toLocaleString("id-ID");

export default async function Page({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_laporan_indikator")) redirect("/dashboard");

  const sp = await searchParams;
  const adaPeriode = await daftarPeriodeIndikator();
  const semuaPeriode = sp.periode === "semua";
  // Bawaan: bulan berjalan; bila belum punya set, bulan terbaru yang ada.
  const bawaan = adaPeriode.some((x) => x.periode === periodeBerjalan())
    ? periodeBerjalan() : (adaPeriode[0]?.periode ?? periodeBerjalan());
  const periode = semuaPeriode ? null : (periodeSah(sp.periode) ?? bawaan);
  const baris = await muatLaporanIndikator(periode);
  const aktif = baris.filter((b) => statusDari(b) === "aktif");
  const pasangan = new Set(aktif.map((b) => `${b.jabatan}|${b.produk}`));
  const tidakGenap = [...totalBobot(baris).values()].filter((t) => Math.abs(t.kpi - 100) > 0.001).length;

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Data & indikator"
          meta={<><TitikStatus nada={aktif.length ? "good" : "netral"} /> {angka(aktif.length)} pendaftaran aktif</>}
          judul="Laporan indikator"
          deskripsi="Per periode (bulan berlaku): indikator yang terdaftar di tiap jabatan·produk beserta perannya (Reguler, Reward, Penalty, dll.), bobot KPI, bobot insentif, faktor pengakuan, dan statusnya — dibaca langsung dari Create Indicator."
          aksi={
            <Link className="btn ghost" href="/admin/indikator">
              <Ikon nama="formula" ukuran={16} /> Buka Create Indicator
            </Link>
          }
        />

        <div className="km-grid">
          <KartuMetrik label="Total pendaftaran" nilai={angka(baris.length)} satuan="baris"
                       catatan={`${angka(baris.length - aktif.length)} nonaktif`}
                       ikon={<Ikon nama="sheet" ukuran={20} />} nada="accent" />
          <KartuMetrik label="Indikator" nilai={angka(new Set(baris.map((b) => b.indikatorId)).size)} satuan="indikator"
                       catatan={`${angka(new Set(aktif.map((b) => b.indikatorId)).size)} dipakai aktif`}
                       ikon={<Ikon nama="formula" ukuran={20} />} nada="netral" />
          <KartuMetrik label="Jabatan·produk aktif" nilai={angka(pasangan.size)} satuan="pasangan"
                       catatan="Punya minimal satu pendaftaran aktif"
                       ikon={<Ikon nama="layers" ukuran={20} />} nada="good" />
          <KartuMetrik label="Bobot KPI ≠ 100%" nilai={angka(tidakGenap)} satuan="pasangan"
                       catatan="Jumlah bobot Reguler aktif per jabatan·produk"
                       ikon={<Ikon nama="checkCircle" ukuran={20} />} nada={tidakGenap ? "warn" : "good"} />
        </div>

        <Client baris={baris} periode={periode ?? "semua"}
                periodeOpsi={adaPeriode.map((x) => ({ nilai: x.periode, label: `${labelBulan(x.periode)} · ${x.pendaftaran} pendaftaran` }))} />
      </main>
    </AppShell>
  );
}
