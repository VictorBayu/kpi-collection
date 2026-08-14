import AppShell from "@/components/AppShell";
import PasswordForm from "./PasswordForm";
import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Ganti password" };

export default async function Page() {
  const s = await readSession();
  if (!s) redirect("/login");

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Ganti password</h2>
            <p>Akun {s.nama} · NIK {s.nik}</p>
          </div>
        </div>
        <PasswordForm />
      </main>
    </AppShell>
  );
}
