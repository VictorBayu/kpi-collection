import Link from "next/link";
import { Suspense } from "react";
import { readSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import AccessBeacon from "./AccessBeacon";
import NavLoading from "./NavLoading";
import NavBadge from "./NavBadge";
import Ikon from "./Ikon";
import Remah from "./Remah";
import NavMenu, { type Entri } from "./NavMenu";
import { MENU, URUT_GRUP, menuSesi, berandaUntuk } from "@/lib/menu";

/** Nama peran yang ditampilkan di pil status topbar. */
const LABEL_PERAN: Record<string, string> = {
  admin: "Admin Data",
  manajemen_ho: "Manajemen HO",
  manager: "Branch Manager",
  atasan: "Atasan",
  karyawan: "Karyawan",
};

/** Dua huruf awal nama untuk monogram avatar. */
function inisial(nama?: string | null) {
  const kata = (nama ?? "").trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return "KC";
  return ((kata[0][0] ?? "") + (kata.length > 1 ? kata[kata.length - 1][0] : kata[0][1] ?? "")).toUpperCase();
}

/**
 * Bilah atas yang sama di semua halaman, menu menyesuaikan peran.
 * Mengikuti spesifikasi "Topbar Navigation Master Spec" (DS NAV-01):
 * tinggi 64px, lengket di atas, latar navy #091024, menu aktif berupa
 * tombol indigo solid, utilitas (kunci, lonceng, keluar) di kanan.
 *
 * Sengaja TIDAK melakukan kueri database di sini: jumlah notifikasi
 * diambil setelah halaman tampil (NavBadge), supaya perpindahan menu
 * tidak menunggu perjalanan bolak-balik ke database.
 */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const s = await readSession();

  /**
   * Navigasi dirakit dari katalog menu (lib/menu.ts) disaring dengan hak
   * akses peran, bukan ditulis ulang per peran. Grup dropdown hanya
   * muncul bila ada isinya.
   */
  const kode = menuSesi(s?.peran ?? "karyawan", s?.menu);
  const izin = new Set(kode);
  const boleh = MENU.filter((m) => izin.has(m.kode));

  const tautan = (m: (typeof boleh)[number]) =>
    ({ href: m.href, label: m.label, lencana: m.lencana, ikon: m.ikon });

  const entri: Entri[] = [
    ...boleh.filter((m) => !m.grup && !m.akhir).map(tautan),
    ...URUT_GRUP.flatMap((judul) => {
      const isi = boleh.filter((m) => m.grup === judul);
      return isi.length ? [{ label: judul, grup: isi.map(tautan) }] : [];
    }),
    ...boleh.filter((m) => !m.grup && m.akhir).map(tautan),
  ];

  // Lonceng mengarah ke kotak request yang berhak dibuka sesi ini.
  const kotakRequest = izin.has("admin_request") ? "/admin/request"
    : izin.has("request") ? "/request" : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="topbar-kiri">
            <Link href={berandaUntuk(kode)} className="brand" title="KPI Collection — beranda">
              <span className="mark">KC</span>
              <span className="brand-teks">
                <b>KPI Collection</b>
                <small>PT Smart Multi Finance</small>
              </span>
            </Link>
            <span className="tb-pill" title="Peran sesi yang sedang masuk">
              <span className="tb-dot" aria-hidden />
              <span>Peran: <strong>{LABEL_PERAN[s?.peran ?? ""] ?? s?.peran ?? "-"}</strong></span>
            </span>
          </div>

          <NavMenu entri={entri} />

          <div className="who">
            <div className="tb-alat">
              <Link href="/ganti-password" className="icobtn" title="Ganti password" aria-label="Ganti password">
                <Ikon nama="key" ukuran={17} />
              </Link>
              {kotakRequest && (
                <Link href={kotakRequest} className="icobtn" title="Request & notifikasi" aria-label="Request & notifikasi">
                  <Ikon nama="bell" ukuran={17} />
                  <NavBadge />
                </Link>
              )}
              <LogoutButton />
            </div>
            <span className="txt">
              <b>{s?.nama}</b>
              <small className="num">NIK {s?.nik}</small>
            </span>
            <span className="avatar" aria-hidden>{inisial(s?.nama)}</span>
          </div>
        </div>
      </header>
      <Remah />
      <AccessBeacon />
      <Suspense fallback={null}><NavLoading /></Suspense>
      {children}
    </>
  );
}
