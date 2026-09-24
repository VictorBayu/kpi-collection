import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import ProdukClient from "./ProdukClient";

export const metadata = { title: "Master Produk" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_produk")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <ProdukClient />
      </main>
    </AppShell>
  );
}
