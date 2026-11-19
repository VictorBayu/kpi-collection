import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { ringkasanPeriode } from "@/lib/report-bulanan";
import Client from "./Client";

export const metadata = { title: "Report Bulanan" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const periode = await ringkasanPeriode();

  return (
    <AppShell>
      <main className="shell">
        <Client periode={periode} />
      </main>
    </AppShell>
  );
}
