"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NavBadge from "./NavBadge";

export type Item = { href: string; label: string; lencana?: boolean };
export type Entri = Item | { label: string; grup: Item[] };

/**
 * Navigasi topbar dengan pengelompokan.
 *
 * Menu admin sudah berkembang jadi delapan tautan sejajar — pada lebar
 * layar biasa itu mulai berdesakan dan sulit dipindai sekilas. Yang benar-
 * benar dibuka tiap hari (Data KPI, Unggah data) tetap langsung terlihat;
 * yang sifatnya pengaturan sesekali (master, indikator, data API)
 * dikelompokkan ke belakang dropdown supaya topbar tidak terus memanjang
 * tiap kali ada menu admin baru.
 */
export default function NavMenu({ entri }: { entri: Entri[] }) {
  const path = usePathname();
  const [buka, setBuka] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    function tutup(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setBuka(null);
    }
    document.addEventListener("mousedown", tutup);
    return () => document.removeEventListener("mousedown", tutup);
  }, []);

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
    <nav className="mainnav" ref={ref}>
      {entri.map((e, i) =>
        "grup" in e ? (
          <div className="navgrup" key={e.label}>
            <button
              className={"navgrup-tombol" + (aktifDi(e.grup) ? " on" : "")}
              onClick={() => setBuka(buka === i ? null : i)}
            >
              {e.label} <span className="navgrup-panah">▾</span>
            </button>
            {buka === i && (
              <div className="navgrup-isi">
                {e.grup.map((it) => (
                  <Link key={it.href} href={it.href} prefetch
                        className={aktif(it.href) ? "on" : ""}
                        onClick={() => setBuka(null)}>
                    {it.label}
                    {it.lencana && <NavBadge />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Link key={e.href} href={e.href} prefetch
                className={aktif(e.href) ? "on" : ""}>
            {e.label}
            {e.lencana && <NavBadge />}
          </Link>
        ),
      )}
    </nav>
  );
}
