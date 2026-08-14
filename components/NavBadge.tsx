"use client";

import { useEffect, useState } from "react";

/**
 * Mengambil jumlah pembaruan request setelah halaman tampil, bukan sebelumnya.
 * Dengan begitu perpindahan menu tidak menunggu kueri database.
 */
export default function NavBadge() {
  const [n, setN] = useState(0);

  useEffect(() => {
    let hidup = true;
    const ambil = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/request/belum-dibaca")
        .then((r) => r.json())
        .then((d) => { if (hidup) setN(d.n ?? 0); })
        .catch(() => {});
    };
    ambil();
    const t = setInterval(ambil, 30000);
    return () => { hidup = false; clearInterval(t); };
  }, []);

  if (!n) return null;
  return (
    <span className="navbadge" title={`${n} pembaruan belum dibaca`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}
