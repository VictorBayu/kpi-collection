"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Ikon from "./Ikon";
import { MENU } from "@/lib/menu";

/**
 * Remah roti (breadcrumb) di bawah topbar: Beranda › Grup › Halaman.
 *
 * Diturunkan dari katalog menu, jadi halaman baru ikut punya remah tanpa
 * perlu menulisnya per halaman. Alamat yang lebih dalam dari tautan menu
 * (mis. /admin/kpi/20250733) diberi ruas "Rincian".
 */
export default function Remah() {
  const path = usePathname() ?? "/";
  const menu = MENU
    .filter((m) => path === m.href || path.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const judulLain: Record<string, string> = { "/ganti-password": "Ganti password" };
  const label = menu?.label ?? judulLain[path];
  if (!label) return null;

  const lebihDalam = menu && path !== menu.href;
  // Halaman turunan yang punya nama sendiri; sisanya tetap "Rincian".
  const judulDalam: Record<string, string> = { "/admin/analitik/cabang": "Prioritas pemulihan cabang" };

  return (
    <nav className="remah tanpa-cetak" aria-label="Remah roti">
      <div className="remah-in">
        <Link href="/" className="remah-beranda"><Ikon nama="home" ukuran={15} /> Beranda</Link>
        {menu?.grup && (<><Ikon nama="chevronRight" ukuran={14} className="remah-sep" /><span>{menu.grup}</span></>)}
        <Ikon nama="chevronRight" ukuran={14} className="remah-sep" />
        {lebihDalam
          ? <Link href={menu.href}>{label}</Link>
          : <span className="remah-ini" aria-current="page">{label}</span>}
        {lebihDalam && (<><Ikon nama="chevronRight" ukuran={14} className="remah-sep" /><span className="remah-ini" aria-current="page">{judulDalam[path] ?? "Rincian"}</span></>)}
      </div>
    </nav>
  );
}
