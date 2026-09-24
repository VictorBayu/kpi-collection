import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import TierClient from "./TierClient";

export const metadata = { title: "Tabel Tier Insentif" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_tier")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <TierClient />
      </main>
    </AppShell>
  );
}
