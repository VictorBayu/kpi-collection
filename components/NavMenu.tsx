"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NavBadge from "./NavBadge";
import Ikon from "./Ikon";

export type Item = { href: string; label: string; lencana?: boolean; ikon?: string };
export type Entri = Item | { label: string; grup: Item[] };

/**
 * Navigasi topbar dengan pengelompokan.
 *
 * Yang dibuka tiap hari tetap tautan langsung; pengaturan sesekali
 * dikelompokkan ke dropdown "Data & indikator" dan "Master". Tampilan
 * dropdown mengikuti "Dropdown Menu Component Showcase": panel navy
 * lebar 320px, kepala berlabel, ikon per menu, item aktif indigo solid
 * dengan penanda "Terbuka ✓", dan kaki berisi petunjuk Esc.
 */
export default function NavMenu({ entri }: { entri: Entri[] }) {
  const path = usePathname();
  const [buka, setBuka] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    function tutup(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setBuka(null);
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") setBuka(null); }
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", tutup);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // Pindah halaman selalu menutup dropdown yang terbuka.
  useEffect(() => { setBuka(null); }, [path]);

  /**
   * Menu yang sedang aktif = tautan dengan awalan TERPANJANG yang cocok.
   *
   * Pencocokan awalan sederhana membuat dua menu menyala sekaligus saat
   * salah satu alamatnya bersarang di dalam yang lain: membuka
   * /tim/dashboard juga menyalakan /tim. Karena itu semua tautan diadu
   * dulu, lalu hanya yang paling khusus yang dianggap aktif.
   *
   * Batas ruas ("/") ikut diperiksa supaya /tim tidak pernah dianggap
   * cocok dengan alamat lain yang kebetulan berawalan sama, mis. /timur.
   */
  const semuaHref = entri.flatMap((e) =>
    "grup" in e ? e.grup.map((it) => it.href) : [e.href]);

  const cocok = (href: string) => path === href || path?.startsWith(href + "/");

  const terpilih = semuaHref
    .filter(cocok)
    .sort((a, b) => b.length - a.length)[0] ?? null;

  const aktif = (href: string) => href === terpilih;
  const aktifDi = (list: Item[]) => list.some((it) => aktif(it.href));

  return (
    <nav className="mainnav" ref={ref} aria-label="Navigasi utama">
      {entri.map((e, i) => {
        if (!("grup" in e)) {
          return (
            <Link key={e.href} href={e.href} prefetch
                  className={aktif(e.href) ? "on" : ""}
                  aria-current={aktif(e.href) ? "page" : undefined}>
              {e.label}
              {e.lencana && <NavBadge />}
            </Link>
          );
        }
        const adaAktif = aktifDi(e.grup);
        return (
          <div className="navgrup" key={e.label}>
            <button
              type="button"
              className={"navgrup-tombol" + (adaAktif ? " on" : "") + (buka === i ? " buka" : "")}
              aria-expanded={buka === i}
              aria-haspopup="menu"
              onClick={() => setBuka(buka === i ? null : i)}
            >
              {e.label} <Ikon nama="chevronDown" ukuran={14} tebal={2.2} className="navgrup-panah" />
            </button>
            {buka === i && (
              <div className="navgrup-isi" role="menu">
                <div className="navgrup-kepala">
                  <span>Navigasi {e.label}</span>
                  <span className={"num" + (adaAktif ? " aktif" : "")}>
                    {adaAktif ? "1 Aktif" : `${e.grup.length} Menu`}
                  </span>
                </div>
                <div className="navgrup-daftar">
                  {e.grup.map((it) => {
                    const on = aktif(it.href);
                    return (
                      <Link key={it.href} href={it.href} prefetch role="menuitem"
                            className={"navitem" + (on ? " on" : "")}
                            aria-current={on ? "page" : undefined}
                            onClick={() => setBuka(null)}>
                        <span className="navitem-ikon"><Ikon nama={it.ikon ?? "file"} ukuran={15} /></span>
                        <span className="navitem-label">{it.label}</span>
                        {it.lencana && <NavBadge />}
                        {on && (
                          <span className="navitem-status">
                            Terbuka <Ikon nama="check" ukuran={14} tebal={2.4} />
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
                <div className="navgrup-kaki">
                  {adaAktif
                    ? <span>Halaman yang sedang Anda buka</span>
                    : <span>Tekan <kbd>Esc</kbd> untuk menutup</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
