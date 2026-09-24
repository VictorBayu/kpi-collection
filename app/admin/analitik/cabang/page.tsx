import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import { periodeTersedia } from "@/lib/kpi";
import { semuaCabang } from "@/lib/analitik";
import { namaPeriode, toISODate } from "@/lib/format";
import PilihPeriode from "@/components/PilihPeriode";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";
import PrioritasClient from "./PrioritasClient";

export const metadata = { title: "Prioritas pemulihan cabang" };
export const dynamic = "force-dynamic";

/**
 * Prioritas pemulihan — seluruh cabang, diurut dari skor terendah.
 *
 * Kartu "Cabang perlu perhatian" di Dashboard hanya memuat delapan cabang
 * terbawah. Layar ini lanjutannya: daftar lengkap untuk menyusun urutan
 * kunjungan atau intervensi, dengan penyaring area dan status.
 */
export default async function Page({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_analitik")) redirect("/dashboard");

  const daftar = await periodeTersedia();
  if (!daftar.length) redirect("/admin/analitik");

  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = toISODate(aktif.periode);
  const cabang = await semuaCabang(periode);

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Dashboard · prioritas pemulihan"
          nada="tegas"
          meta={`Periode ${namaPeriode(periode)} · ${cabang.length} cabang`}
          judul="Prioritas pemulihan cabang"
          deskripsi="Seluruh cabang diurutkan dari skor KPI rata-rata terendah, lengkap dengan jumlah karyawan di bawah KPI 3 — untuk menyusun urutan intervensi."
          aksi={<>
            <Link className="btn ghost" href={`/admin/analitik?periode=${periode}`}>
              <Ikon nama="chevronRight" ukuran={16} className="pp-balik" /> Kembali ke Dashboard
            </Link>
            <PilihPeriode daftar={daftar.map((p) => toISODate(p.periode))} aktif={periode} />
          </>}
        />
        <PrioritasClient cabang={cabang} periode={periode} />
      </main>
    </AppShell>
  );
}
