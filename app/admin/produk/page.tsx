import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import ProdukClient from "./ProdukClient";

export const metadata = { title: "Master Produk" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <main className="shell">
        <ProdukClient />
      </main>
    </AppShell>
  );
}
