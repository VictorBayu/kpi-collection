import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import {
  alirJabatanProduk, radarIndikator, jabatanBerdata,
  ringkasNasional, perArea,
} from "@/lib/analitik";
import { angka, rp, toISODate } from "@/lib/format";
import PilihPeriode from "@/components/PilihPeriode";
import AnalitikClient from "./AnalitikClient";

export const metadata = { title: "Dashboard Analitik" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const daftar = await periodeTersedia();
  if (!daftar.length) {
    return (
      <AppShell>
        <main className="shell">
          <div className="card card-pad narrow mt">
            <h2>Belum ada data KPI</h2>
            <p className="muted">
              Grafik dibentuk dari data KPI yang sudah terhitung. Tarik data API
              atau unggah berkas Excel dulu.
            </p>
            <p className="mt"><Link className="btn" href="/admin/data-api">Ke Data API</Link></p>
          </div>
        </main>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  // Dijalankan berbarengan; tidak ada yang bergantung hasil yang lain, dan
  // berurutan berarti pembaca menunggu penjumlahan lima kali lebih lama.
  const [alir, radar, jabatan, ringkas, area] = await Promise.all([
    alirJabatanProduk(periode),
    radarIndikator(periode),
    jabatanBerdata(periode),
    ringkasNasional(periode),
    perArea(periode),
  ]);

  // Radar per jabatan disiapkan di server sekaligus, bukan diambil ulang
  // tiap kali penyaring diganti: jumlah jabatan sedikit, dan menunggu
  // perjalanan ke server tiap ganti pilihan membuat penelusuran terasa
  // berat justru saat pembaca sedang membandingkan.
  const radarPerJabatan: Record<string, Awaited<ReturnType<typeof radarIndikator>>> = {};
  await Promise.all(jabatan.map(async (j) => {
    radarPerJabatan[j.jabatan] = await radarIndikator(periode, j.jabatan);
  }));

  const persen = (n: number) =>
    ringkas.karyawan ? Math.round((n / ringkas.karyawan) * 100) : 0;

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Dashboard Analitik</h2>
            <p>
              Pola menyeluruh dari data KPI — untuk melihat apa yang tidak
              terlihat saat memeriksa cabang satu per satu.
            </p>
          </div>
          <PilihPeriode daftar={daftar.map((p) => toISODate(p.periode))} aktif={periode} />
        </div>

        <div className="kartu-angka mb">
          <div className="angka-kotak">
            <span>Karyawan dinilai</span>
            <b>{ringkas.karyawan.toLocaleString("id-ID")}</b>
          </div>
          <div className="angka-kotak">
            <span>Skor rata-rata</span>
            <b className={ringkas.skorRata === null ? "" :
                          ringkas.skorRata >= 4 ? "baik" : ringkas.skorRata < 3 ? "buruk" : ""}>
              {ringkas.skorRata === null ? "—" : angka(ringkas.skorRata)}
            </b>
          </div>
          <div className="angka-kotak">
            <span>KPI 4 ke atas</span>
            <b className="baik">{ringkas.jumlahKpi4}</b>
            <i>{persen(ringkas.jumlahKpi4)}% dari total</i>
          </div>
          <div className="angka-kotak">
            <span>Di bawah KPI 3</span>
            <b className="buruk">{ringkas.jumlahBawah}</b>
            <i>{persen(ringkas.jumlahBawah)}% dari total</i>
          </div>
          <div className="angka-kotak">
            <span>Total insentif</span>
            <b>{rp(ringkas.insentif)}</b>
          </div>
        </div>

        <AnalitikClient alir={alir} radar={radar} radarPerJabatan={radarPerJabatan}
                        jabatan={jabatan} area={area} />
      </main>
    </AppShell>
  );
}
