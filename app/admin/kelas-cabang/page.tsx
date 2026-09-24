import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import KelasCabangClient from "./KelasCabangClient";

export const metadata = { title: "Grading Cabang" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_kelas_cabang")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <KelasCabangClient />
      </main>
    </AppShell>
  );
}
