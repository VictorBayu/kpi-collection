"use client";

import { useEffect, useState } from "react";
import { waktu } from "@/lib/format";

/**
 * Pil "Data diperbarui" di topbar, di sebelah pil Peran.
 * Mengambil waktu tarikan terakhir setelah halaman tampil (pola sama
 * dengan NavBadge), supaya perpindahan menu tidak menunggu kueri database.
 */
export default function PilTarikan() {
  const [ditarik, setDitarik] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    let hidup = true;
    const ambil = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/status-tarikan")
        .then((r) => r.json())
        .then((d) => { if (hidup) { setDitarik(d.ditarik ?? null); setSiap(true); } })
        .catch(() => { if (hidup) setSiap(true); });
    };
    ambil();
    const t = setInterval(ambil, 60000);
    return () => { hidup = false; clearInterval(t); };
  }, []);

  if (!siap) return null;

  return (
    <span className="tb-pill tb-pill-tarikan" title="Kapan data mentah terakhir ditarik dari API">
      <span className={"tb-dot" + (ditarik ? "" : " tb-dot-mati")} aria-hidden />
      <span>Data diperbarui: <strong>{ditarik ? waktu(ditarik) : "belum ada"}</strong></span>
    </span>
  );
}
