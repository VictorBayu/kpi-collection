import Link from "next/link";
import { readSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import AccessBeacon from "./AccessBeacon";
import NavBadge from "./NavBadge";

/**
 * Bilah atas yang sama di semua halaman, menu menyesuaikan peran.
 * Sengaja TIDAK melakukan kueri database di sini: jumlah notifikasi
 * diambil setelah halaman tampil (NavBadge), supaya perpindahan menu
 * tidak menunggu perjalanan bolak-balik ke database.
 */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();

  const menu =
    s?.peran === "admin"
      ? [["/admin/import", "Unggah data"], ["/admin/kpi", "Data KPI"],
         ["/admin/riwayat", "Riwayat impor"], ["/admin/request", "Kelola request"],
         ["/admin/pengguna", "Pengguna & Akses"], ["/admin/hierarki", "Master Hierarki"]]
      : s?.peran === "atasan"
      ? [["/dashboard", "Dasbor saya"], ["/tim", "Tim saya"], ["/request", "Request"]]
      : [["/dashboard", "Dasbor saya"], ["/request", "Request"]];

  const menuRequest = s?.peran === "admin" ? "/admin/request" : "/request";

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
              <Link key={href} href={href} prefetch>
                {label}
                {href === menuRequest && <NavBadge />}
              </Link>
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
      <AccessBeacon />
      {children}
    </>
  );
}
