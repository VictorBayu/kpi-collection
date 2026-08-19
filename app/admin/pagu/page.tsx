import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import PaguClient from "./PaguClient";

export const metadata = { title: "Pagu Insentif" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <PaguClient />
      </main>
    </AppShell>
  );
}
