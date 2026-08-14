import Link from "next/link";
import { readSession } from "@/lib/auth";
import { q } from "@/lib/db";
import LogoutButton from "./LogoutButton";
import AccessBeacon from "./AccessBeacon";

/**
 * Jumlah tiket yang punya aktivitas baru bagi pemiliknya:
 * - karyawan/atasan: balasan admin atau perubahan status yang belum ia buka
 * - admin: tiket baru masuk atau balasan karyawan yang belum ia buka
 * Kalau kolom penanda belum ada (schema belum dijalankan), diamkan saja
 * supaya seluruh halaman tetap berfungsi.
 */
async function hitungBelumDibaca(userId: string, admin: boolean): Promise<number> {
  try {
    const [r] = await q<{ n: number }>(
      admin
        ? `SELECT COUNT(*)::int AS n FROM request
            WHERE status NOT IN ('selesai','ditolak')
              AND updated_at > COALESCE(dilihat_admin_at, 'epoch')`
        : `SELECT COUNT(*)::int AS n FROM request
            WHERE user_id = $1
              AND updated_at > COALESCE(dilihat_user_at, 'epoch')`,
      admin ? [] : [userId]);
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Bilah atas yang sama di semua halaman, menu menyesuaikan peran. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();
  const belum = s ? await hitungBelumDibaca(s.sub, s.peran === "admin") : 0;

  const menu =
    s?.peran === "admin"
      ? [["/admin/import", "Unggah data"], ["/admin/kpi", "Data KPI"],
         ["/admin/riwayat", "Riwayat impor"], ["/admin/request", "Kelola request"],
         ["/admin/pengguna", "Pengguna & Akses"]]
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
              <Link key={href} href={href}>
                {label}
                {href === menuRequest && belum > 0 && (
                  <span className="navbadge" title={`${belum} pembaruan belum dibaca`}>{belum > 9 ? "9+" : belum}</span>
                )}
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
