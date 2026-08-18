import Link from "next/link";
import { Suspense } from "react";
import { readSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import AccessBeacon from "./AccessBeacon";
import NavLoading from "./NavLoading";
import IkonTarget from "./IkonTarget";
import NavMenu, { type Entri } from "./NavMenu";

/**
 * Bilah atas yang sama di semua halaman, menu menyesuaikan peran.
 * Sengaja TIDAK melakukan kueri database di sini: jumlah notifikasi
 * diambil setelah halaman tampil (NavBadge), supaya perpindahan menu
 * tidak menunggu perjalanan bolak-balik ke database.
 *
 * Menu admin dikelompokkan: yang dibuka tiap hari (Data KPI, Unggah data,
 * Kelola request) tetap tautan langsung; yang sifatnya pengaturan sesekali
 * masuk dropdown supaya topbar tidak terus memanjang tiap ada menu baru.
 */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();

  const entri: Entri[] =
    s?.peran === "admin"
      ? [
          { href: "/admin/kpi", label: "Data KPI" },
          { href: "/admin/import", label: "Unggah data" },
          {
            label: "Data & indikator",
            grup: [
              { href: "/admin/indikator", label: "Pembangun indikator" },
              { href: "/admin/data-api", label: "Data API" },
              { href: "/admin/sampel-data", label: "Sampel data mentah" },
              { href: "/admin/riwayat", label: "Riwayat impor Excel" },
            ],
          },
          {
            label: "Master",
            grup: [
              { href: "/admin/hierarki", label: "Master Hierarki" },
              { href: "/admin/produk", label: "Master Produk" },
              { href: "/admin/cabang", label: "Master Cabang API" },
              { href: "/admin/pengguna", label: "Pengguna & Akses" },
            ],
          },
          { href: "/admin/request", label: "Kelola request", lencana: true },
        ]
      : s?.peran === "atasan"
      ? [
          { href: "/dashboard", label: "Dasbor saya" },
          { href: "/tim", label: "Tim saya" },
          { href: "/request", label: "Request", lencana: true },
        ]
      : [
          { href: "/dashboard", label: "Dasbor saya" },
          { href: "/request", label: "Request", lencana: true },
        ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="mark"><IkonTarget ukuran={19} /></span>
            <span>
              <b>KPI Collection</b>
              <small>Smart Multi Finance</small>
            </span>
          </div>

          <NavMenu entri={entri} />

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
      <Suspense fallback={null}><NavLoading /></Suspense>
      {children}
    </>
  );
}
