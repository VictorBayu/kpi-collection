import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import SampelClient from "./SampelClient";

export const metadata = { title: "Sample Data API" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_sampel")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <SampelClient />
      </main>
    </AppShell>
  );
}
