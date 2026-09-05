import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import { toISODate } from "@/lib/format";
import {
  ringkasTim, sebaranTim, indikatorTim, trenTim, radarAnggota, perluPerhatian,
} from "@/lib/analitik-tim";
import DashboardTimClient from "./DashboardTimClient";

export const metadata = { title: "Dashboard Tim" };
export const dynamic = "force-dynamic";

/**
 * Dasbor cabang untuk atasan.
 *
 * Isinya sama bentuknya dengan dasbor admin, tapi lingkupnya dibatasi tim
 * yang boleh dilihat pengguna ini. Admin diarahkan ke dasbor penuh: ia
 * sudah punya versi yang lebih lengkap, dan menyediakan dua halaman mirip
 * hanya membuat bingung mana yang seharusnya dibuka.
 */
export default async function Page({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran === "admin") redirect("/admin/analitik");

  const daftar = await periodeTersedia();
  if (!daftar.length) {
    return (
      <AppShell>
        <main className="shell">
          <div className="card card-pad narrow mt">
            <h2>Belum ada data KPI</h2>
            <p className="muted">
              Dasbor akan terisi begitu data KPI periode pertama diterbitkan.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  const [ringkas, sebaran, indikator, tren, radar, perhatian] = await Promise.all([
    ringkasTim(s.nik, periode),
    sebaranTim(s.nik, periode),
    indikatorTim(s.nik, periode),
    trenTim(s.nik),
    radarAnggota(s.nik, periode),
    perluPerhatian(s.nik, periode),
  ]);

  return (
    <AppShell>
      <main className="shell">
        <DashboardTimClient
          periode={periode}
          daftarPeriode={daftar.map((p) => toISODate(p.periode))}
          ringkas={ringkas} sebaran={sebaran} indikator={indikator}
          tren={tren} radar={radar} perhatian={perhatian}
        />
      </main>
    </AppShell>
  );
}
