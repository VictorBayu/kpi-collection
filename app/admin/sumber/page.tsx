import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import Client from "./Client";

export const metadata = { title: "Sumber Data" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_sumber")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <Client />
      </main>
    </AppShell>
  );
}
