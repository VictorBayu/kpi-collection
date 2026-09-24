import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusHarianBar from "@/components/StatusHarian";
import RincianHarian from "@/components/RincianHarian";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import { statusHarian, progresNik, ringkasHarian } from "@/lib/harian";
import { q } from "@/lib/db";
import Ikon from "@/components/Ikon";

export const metadata = { title: "Progres harian karyawan" };
export const dynamic = "force-dynamic";

export default async function DetailHarian({
  params,
}: { params: Promise<{ nik: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_harian")) redirect("/harian");

  const { nik } = await params;
  const [[orang], status, baris, ringkas] = await Promise.all([
    q<any>(`SELECT nama, cabang, area, jabatan FROM app_user WHERE nik = $1`, [nik]),
    statusHarian(),
    progresNik(nik),
    ringkasHarian(nik),
  ]);

  return (
    <AppShell>
      <main className="shell">
        <header className="rk-kepala">
          <div className="rk-id">
            <div className="rk-atas">
              <Link className="rk-balik"
                    href={`/admin/harian?cabang=${encodeURIComponent(orang?.cabang ?? "")}`}>
                <Ikon nama="chevronRight" ukuran={15} className="rk-balik-ikon" />
                {orang?.cabang ?? "Kembali"}
              </Link>
              <span className="jh-titik" aria-hidden>•</span>
              <span className="jh-meta">Progres harian · bulan berjalan</span>
            </div>
            <h1 className="rk-nama">{orang?.nama ?? nik}</h1>
            <div className="rk-meta">
              <span className="rk-nik num">NIK {nik}</span>
              <span><Ikon nama="badge" ukuran={15} /> Jabatan: <b>{orang?.jabatan ?? "—"}</b></span>
              <span><Ikon nama="building" ukuran={15} /> Wilayah: <b>{orang?.cabang ?? "—"}{orang?.area ? ` (${orang.area})` : ""}</b></span>
            </div>
          </div>
          <div className="rk-aksi">
            <Link className="btn tint sm" href={`/admin/kpi/${nik}`}>
              <Ikon nama="table" ukuran={15} /> Rincian KPI bulanan
            </Link>
          </div>
        </header>

        <StatusHarianBar s={status} />
        <RincianHarian ringkas={ringkas} baris={baris} />
      </main>
    </AppShell>
  );
}
