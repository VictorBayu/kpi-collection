import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";
import { muatLaporanIndikator } from "@/lib/laporan-indikator-db";
import { statusDari, totalBobot } from "@/lib/laporan-indikator";
import Client from "./Client";

export const metadata = { title: "Laporan Indikator" };
export const dynamic = "force-dynamic";

const angka = (v: number) => v.toLocaleString("id-ID");

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_laporan_indikator")) redirect("/dashboard");

  const baris = await muatLaporanIndikator();
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
          deskripsi="Indikator yang terdaftar di tiap jabatan·produk beserta perannya (Reguler, Reward, Penalty, dll.), bobot KPI, bobot insentif, faktor pengakuan, dan statusnya — dibaca langsung dari Create Indicator."
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

        <Client baris={baris} />
      </main>
    </AppShell>
  );
}
