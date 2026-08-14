import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import RequestClient from "@/app/request/RequestClient";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import { toISODate } from "@/lib/format";

export const metadata = { title: "Kelola request" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/request");

  const periode = (await periodeTersedia()).map((p) => toISODate(p.periode));

  return (
    <AppShell>
      <main className="shell">
        <RequestClient admin periodeTersedia={periode} />
      </main>
    </AppShell>
  );
}
