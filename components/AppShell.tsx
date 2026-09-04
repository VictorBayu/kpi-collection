import Link from "next/link";
import { Suspense } from "react";
import { readSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import AccessBeacon from "./AccessBeacon";
import NavLoading from "./NavLoading";
import IkonTarget from "./IkonTarget";
import NavMenu, { type Entri } from "./NavMenu";
import { MENU, URUT_GRUP, menuSesi } from "@/lib/menu";

/**
 * Bilah atas yang sama di semua halaman, menu menyesuaikan peran.
 * Sengaja TIDAK melakukan kueri database di sini: jumlah notifikasi
 * diambil setelah halaman tampil (NavBadge), supaya perpindahan menu
 * tidak menunggu perjalanan bolak-balik ke database.
 *
 * Menu admin dikelompokkan: yang dibuka tiap hari (Dashboard, Data KPI,
 * Supporting) tetap tautan langsung; yang sifatnya pengaturan sesekali —
 * termasuk unggah data, yang hanya dipakai saat data belum masuk lewat API —
 * masuk dropdown supaya topbar tidak terus memanjang tiap ada menu baru.
 */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();

  /**
   * Navigasi dirakit dari katalog menu (lib/menu.ts) disaring dengan hak
   * akses peran, bukan ditulis ulang per peran. Dengan begitu menambah
   * peran baru cukup lewat layar Peran & Hak Akses — tidak perlu menyentuh
   * berkas ini lagi. Grup dropdown hanya muncul bila ada isinya.
   */
  const izin = new Set(menuSesi(s?.peran ?? "karyawan", s?.menu));
  const boleh = MENU.filter((m) => izin.has(m.kode));

  const tautan = (m: (typeof boleh)[number]) =>
    ({ href: m.href, label: m.label, lencana: m.lencana });

  const entri: Entri[] = [
    ...boleh.filter((m) => !m.grup && !m.akhir).map(tautan),
    ...URUT_GRUP.flatMap((judul) => {
      const isi = boleh.filter((m) => m.grup === judul);
      return isi.length
        ? [{ label: judul, grup: isi.map((m) => ({ href: m.href, label: m.label })) }]
        : [];
    }),
    ...boleh.filter((m) => !m.grup && m.akhir).map(tautan),
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
