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

  const aktifDi = (list: Item[]) => list.some((it) => path?.startsWith(it.href));

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
                        className={path?.startsWith(it.href) ? "on" : ""}
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
                className={path?.startsWith(e.href) ? "on" : ""}>
            {e.label}
            {e.lencana && <NavBadge />}
          </Link>
        ),
      )}
    </nav>
  );
}
