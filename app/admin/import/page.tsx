import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ImportWizard from "./ImportWizard";
import { readSession } from "@/lib/auth";

export const metadata = { title: "Unggah data KPI" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Unggah data KPI</h2>
            <p>Empat langkah. Data karyawan tidak berubah sampai langkah terakhir.</p>
          </div>
        </div>
        <ImportWizard />
      </main>
    </AppShell>
  );
}
