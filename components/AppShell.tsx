import Link from "next/link";
import { readSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

/** Bilah atas yang sama di semua halaman, menu menyesuaikan peran. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();

  const menu =
    s?.peran === "admin"
      ? [["/admin/import", "Unggah data"], ["/admin/riwayat", "Riwayat impor"], ["/admin/request", "Kelola request"]]
      : s?.peran === "atasan"
      ? [["/dashboard", "Dasbor saya"], ["/tim", "Tim saya"], ["/request", "Request"]]
      : [["/dashboard", "Dasbor saya"], ["/request", "Request"]];

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="mark">KC</span>
            <span>
              <b>KPI Collection</b>
              <small>Smart Multi Finance</small>
            </span>
          </div>

          <nav className="mainnav">
            {menu.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>

          <div className="who">
            <span className="txt">
              <b>{s?.nama}</b>
              <small>NIK {s?.nik}</small>
            </span>
            <Link href="/ganti-password" className="icobtn" title="Ganti password">🔑</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
