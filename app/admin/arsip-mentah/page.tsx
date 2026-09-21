import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import ArsipMentahClient from "./ArsipMentahClient";

export const metadata = { title: "Arsip Data Mentah" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <ArsipMentahClient />
      </main>
    </AppShell>
  );
}
