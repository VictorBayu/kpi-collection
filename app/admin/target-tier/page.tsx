import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import TargetTierClient from "./TargetTierClient";

export const metadata = { title: "Target Tier" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_target_tier")) redirect("/dashboard");
  return (
    <AppShell>
      <main className="shell">
        <TargetTierClient />
      </main>
    </AppShell>
  );
}
