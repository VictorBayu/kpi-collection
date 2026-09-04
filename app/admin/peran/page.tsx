import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import PeranClient from "./PeranClient";

export const metadata = { title: "Peran & Hak Akses" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <PeranClient />
      </main>
    </AppShell>
  );
}
