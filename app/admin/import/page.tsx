import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ImportWizard from "./ImportWizard";
import Link from "next/link";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";
import { readSession } from "@/lib/auth";

export const metadata = { title: "Unggah data KPI" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Impor Excel"
          meta="4 langkah · aman sampai diterbitkan"
          judul="Unggah data KPI"
          deskripsi="Data karyawan tidak berubah sampai langkah terakhir. Batch sebelumnya tetap tersimpan dan bisa diaktifkan kembali."
          aksi={<Link className="btn ghost" href="/admin/riwayat"><Ikon nama="history" ukuran={16} /> Riwayat impor</Link>}
        />
        <ImportWizard />
      </main>
    </AppShell>
  );
}
