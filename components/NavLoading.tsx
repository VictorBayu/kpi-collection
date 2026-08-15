"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Penanda "sedang memuat" saat berpindah halaman.
 *
 * Next.js sudah melakukan streaming, jadi sebagian besar perpindahan terasa
 * instan dan penanda ini tidak pernah muncul. Yang ditangani di sini adalah
 * kasus sebaliknya: server sedang dingin atau kueri sedang lambat, dan tanpa
 * umpan balik pengguna mengira kliknya tidak terbaca lalu menekan berulang.
 *
 * Karena itu penanda sengaja DITUNDA 300 ms. Perpindahan cepat tidak
 * memunculkan kedipan yang justru terasa lambat; hanya yang benar-benar
 * lama yang menampilkannya.
 *
 * Cara kerjanya: menyimak klik pada tautan internal, lalu berhenti begitu
 * alamat halaman berubah.
 */
export default function NavLoading() {
  const [tampil, setTampil] = useState(false);
  const jeda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = usePathname();
  const query = useSearchParams();

  // Alamat berubah = halaman baru sudah tampil. Hentikan penanda.
  useEffect(() => {
    if (jeda.current) { clearTimeout(jeda.current); jeda.current = null; }
    setTampil(false);
  }, [path, query]);

  useEffect(() => {
    function mulai() {
      if (jeda.current) clearTimeout(jeda.current);
      jeda.current = setTimeout(() => setTampil(true), 300);
    }

    function klik(e: MouseEvent) {
      // Abaikan klik yang memang tidak berpindah halaman di tab ini
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      // Hanya tautan di dalam aplikasi ini
      const tujuan = new URL(a.href, window.location.href);
      if (tujuan.origin !== window.location.origin) return;
      // Alamat yang sama persis tidak memuat apa pun
      if (tujuan.pathname + tujuan.search === window.location.pathname + window.location.search) return;

      mulai();
    }

    // Tombol "Lihat" pada pemilih periode memakai pengiriman form biasa
    function kirimForm() { mulai(); }

    document.addEventListener("click", klik);
    document.addEventListener("submit", kirimForm);
    window.addEventListener("pagehide", () => setTampil(false));
    return () => {
      document.removeEventListener("click", klik);
      document.removeEventListener("submit", kirimForm);
      if (jeda.current) clearTimeout(jeda.current);
    };
  }, []);

  if (!tampil) return null;

  return (
    <>
      <div className="navbar-load" aria-hidden />
      <div className="navpop" role="status" aria-live="polite">
        <span className="navpop-spin" aria-hidden />
        <span>Memuat halaman…</span>
      </div>
    </>
  );
}
