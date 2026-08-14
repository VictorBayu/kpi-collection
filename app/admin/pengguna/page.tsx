import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import PenggunaClient from "./PenggunaClient";
import { readSession } from "@/lib/auth";

export const metadata = { title: "Pengguna & Akses" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <PenggunaClient />
      </main>
    </AppShell>
  );
}
