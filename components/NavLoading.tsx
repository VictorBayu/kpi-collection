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
 *
 * PENTING soal `submit`: banyak layar di aplikasi ini memakai <form> yang
 * TIDAK berpindah halaman -- Tracing KPI, pencarian, penyaring -- yaitu
 * form yang handler-nya memanggil preventDefault() lalu fetch() sendiri.
 * Penanda ini hanya berhenti ketika alamat berubah, jadi kalau form
 * semacam itu ikut dihitung sebagai perpindahan, penandanya TIDAK PERNAH
 * berhenti: pengguna melihat "Memuat halaman... 14 detik" lalu "Masih
 * diproses, lebih lama dari biasanya" padahal datanya sudah tampil sejak
 * detik pertama. Karena itu submit yang sudah di-preventDefault
 * diabaikan, dan pemeriksaannya diulang lagi setelah jeda 300 ms supaya
 * tidak bergantung pada di mana React memasang listener-nya.
 *
 * Alasan yang sama berlaku untuk tautan UNDUHAN (mis. tombol "Unduh
 * Template Excel"): berkasnya turun, alamat halaman tidak berubah, jadi
 * penandanya menggantung. Karena itu seluruh tautan ke /api/ dilewati.
 */
export default function NavLoading() {
  const [tampil, setTampil] = useState(false);
  const [detik, setDetik] = useState(0);
  const [server, setServer] = useState<"belum" | "hidup" | "diam">("belum");

  const jeda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jam = useRef<ReturnType<typeof setInterval> | null>(null);
  const denyut = useRef<ReturnType<typeof setInterval> | null>(null);
  // Denyut pertama dijadwalkan 3 detik setelah penanda tampil. Tanpa ref,
  // berhenti() tidak bisa membatalkannya: perpindahan yang selesai di
  // detik pertama tetap menyalakan interval 4 detik sesudahnya, dan
  // interval itu menyentuh /api/akses selamanya karena tidak ada lagi
  // yang membersihkannya.
  const denyutAwal = useRef<ReturnType<typeof setTimeout> | null>(null);

  const path = usePathname();
  const query = useSearchParams();

  function berhenti() {
    if (jeda.current) { clearTimeout(jeda.current); jeda.current = null; }
    if (jam.current) { clearInterval(jam.current); jam.current = null; }
    if (denyut.current) { clearInterval(denyut.current); denyut.current = null; }
    if (denyutAwal.current) { clearTimeout(denyutAwal.current); denyutAwal.current = null; }
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

    function mulai(e?: Event) {
      if (jeda.current) clearTimeout(jeda.current);
      jeda.current = setTimeout(() => {
        jeda.current = null;
        // Diperiksa lagi di sini, bukan cuma saat event datang: handler
        // React bisa memanggil preventDefault() setelah listener document
        // ini jalan, tergantung di mana React memasang listener-nya.
        if (e?.defaultPrevented) return;
        setTampil(true);
        setDetik(0);
        jam.current = setInterval(() => setDetik((d) => d + 1), 1000);
        // Denyut pertama setelah 3 detik, lalu tiap 4 detik.
        denyutAwal.current = setTimeout(() => {
          denyutAwal.current = null;
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
      // Tautan ke /api/ bukan perpindahan halaman: ia mengunduh berkas
      // (template Excel, ekspor CSV) atau memanggil endpoint. Alamat
      // halaman tidak pernah berubah, jadi penanda ini tidak akan pernah
      // berhenti sendiri -- persis kegagalan yang sama dengan <form> yang
      // menangani dirinya sendiri. Atribut download saja tidak cukup:
      // berkas yang diunduh lewat Content-Disposition di sisi server
      // sering ditulis sebagai tautan biasa tanpa atribut itu.
      if (tujuan.pathname.startsWith("/api/")) return;
      if (tujuan.pathname + tujuan.search === window.location.pathname + window.location.search) return;

      mulai(e);
    }

    // Form yang menangani dirinya sendiri (preventDefault lalu fetch)
    // bukan perpindahan halaman, jadi tidak menyalakan penanda ini.
    const kirimForm = (e: Event) => {
      if (e.defaultPrevented) return;
      mulai(e);
    };
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
