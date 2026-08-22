import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import IndikatorClient from "./IndikatorClient";

export const metadata = { title: "Create Indicator" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <IndikatorClient />
      </main>
    </AppShell>
  );
}
