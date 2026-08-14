"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Mencatat akses halaman ke server, tapi hemat: maksimal sekali per 10 menit
 * per sesi browser. Tidak memblokir tampilan; gagal pun diabaikan.
 */
export default function AccessBeacon() {
  const path = usePathname();
  useEffect(() => {
    try {
      const kunci = "kpi_akses_terakhir";
      const now = Date.now();
      const lalu = Number(sessionStorage.getItem(kunci) || 0);
      if (now - lalu < 10 * 60 * 1000) return; // sudah dicatat < 10 menit lalu
      sessionStorage.setItem(kunci, String(now));
      fetch("/api/akses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [path]);
  return null;
}
