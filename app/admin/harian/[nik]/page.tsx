import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusHarianBar from "@/components/StatusHarian";
import RincianHarian from "@/components/RincianHarian";
import { readSession } from "@/lib/auth";
import { statusHarian, progresNik, ringkasHarian } from "@/lib/harian";
import { q } from "@/lib/db";

export const metadata = { title: "Progres harian karyawan" };
export const dynamic = "force-dynamic";

export default async function DetailHarian({
  params,
}: { params: Promise<{ nik: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/harian");

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
        <div className="sectionhead">
          <div>
            <Link className="dk-balik"
                  href={`/admin/harian?cabang=${encodeURIComponent(orang?.cabang ?? "")}`}>
              ← {orang?.cabang ?? "Kembali"}
            </Link>
            <h2>{orang?.nama ?? nik}</h2>
            <p className="faint num">
              {nik} · {orang?.jabatan ?? "—"} · {orang?.cabang ?? "—"}
            </p>
          </div>
        </div>

        <StatusHarianBar s={status} />
        <div className="mt" />
        <RincianHarian ringkas={ringkas} baris={baris} />
      </main>
    </AppShell>
  );
}
