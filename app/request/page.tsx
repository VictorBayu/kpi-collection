import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import RequestClient from "./RequestClient";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import { toISODate } from "@/lib/format";

export const metadata = { title: "Request saya" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");

  const periode = (await periodeTersedia()).map((p) => toISODate(p.periode));

  return (
    <AppShell>
      <main className="shell">
        <RequestClient admin={false} periodeTersedia={periode} />
      </main>
    </AppShell>
  );
}
