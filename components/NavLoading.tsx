"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Penanda "sedang memuat" saat berpindah halaman.
 *
 * Perpindahan yang cepat tidak menampilkan apa pun — penanda baru muncul
 * setelah 300 ms, karena kedipan singkat justru membuat aplikasi terasa
 * lebih lambat.
 *
 * Yang ditangani serius di sini adalah perpindahan yang macet. Server bisa
 * dingin, jaringan bisa putus sebentar, dan tanpa umpan balik pengguna
 * hanya melihat layar diam lalu menekan refresh sendiri. Karena itu:
 *
 *   - setelah 3 detik, lama menunggu ditampilkan;
 *   - setiap 4 detik aplikasi menyentuh server untuk memastikan masih
 *     tersambung, dan hasilnya diberitahukan apa adanya;
 *   - setelah 12 detik disediakan tombol muat ulang, jadi pengguna tidak
 *     perlu menebak sendiri harus berbuat apa.
 */
export default function NavLoading() {
  const [tampil, setTampil] = useState(false);
  const [detik, setDetik] = useState(0);
  const [server, setServer] = useState<"belum" | "hidup" | "diam">("belum");

  const jeda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jam = useRef<ReturnType<typeof setInterval> | null>(null);
  const denyut = useRef<ReturnType<typeof setInterval> | null>(null);

  const path = usePathname();
  const query = useSearchParams();

  function berhenti() {
    if (jeda.current) { clearTimeout(jeda.current); jeda.current = null; }
    if (jam.current) { clearInterval(jam.current); jam.current = null; }
    if (denyut.current) { clearInterval(denyut.current); denyut.current = null; }
    setTampil(false);
    setDetik(0);
    setServer("belum");
  }

  // Alamat berubah = halaman baru sudah tampil.
  useEffect(() => { berhenti(); }, [path, query]);

  useEffect(() => {
    /** Memastikan server masih menjawab, tanpa mengganggu perpindahan. */
    async function sentuhServer() {
      try {
        const r = await fetch("/api/akses", {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        // Status apa pun berarti server menjawab — yang penting bukan
        // isinya, melainkan bahwa sambungannya hidup.
        setServer(r ? "hidup" : "diam");
      } catch {
        setServer("diam");
      }
    }

    function mulai() {
      if (jeda.current) clearTimeout(jeda.current);
      jeda.current = setTimeout(() => {
        setTampil(true);
        setDetik(0);
        jam.current = setInterval(() => setDetik((d) => d + 1), 1000);
        // Denyut pertama setelah 3 detik, lalu tiap 4 detik.
        setTimeout(() => {
          sentuhServer();
          denyut.current = setInterval(sentuhServer, 4000);
        }, 3000);
      }, 300);
    }

    function klik(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      const tujuan = new URL(a.href, window.location.href);
      if (tujuan.origin !== window.location.origin) return;
      if (tujuan.pathname + tujuan.search === window.location.pathname + window.location.search) return;

      mulai();
    }

    const kirimForm = () => mulai();
    const sembunyi = () => berhenti();

    document.addEventListener("click", klik);
    document.addEventListener("submit", kirimForm);
    window.addEventListener("pagehide", sembunyi);
    return () => {
      document.removeEventListener("click", klik);
      document.removeEventListener("submit", kirimForm);
      window.removeEventListener("pagehide", sembunyi);
      berhenti();
    };
  }, []);

  if (!tampil) return null;

  const lama = detik >= 12;
  const pesan =
    server === "diam"
      ? "Server belum menjawab. Menunggu sambungan…"
      : lama
      ? "Masih diproses, lebih lama dari biasanya"
      : detik >= 3
      ? `Memuat halaman… ${detik} detik`
      : "Memuat halaman…";

  return (
    <>
      <div className="navbar-load" aria-hidden />
      <div className={"navpop" + (lama || server === "diam" ? " lama" : "")}
           role="status" aria-live="polite">
        <span className="navpop-spin" aria-hidden />
        <span className="navpop-teks">{pesan}</span>

        {(lama || server === "diam") && (
          <button className="navpop-btn" onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        )}
      </div>
    </>
  );
}
