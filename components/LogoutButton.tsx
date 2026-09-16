"use client";

import Ikon from "./Ikon";

export default function LogoutButton() {
  return (
    <button className="icobtn" title="Keluar" aria-label="Keluar"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });

        /**
         * Sengaja memakai window.location, bukan router.replace().
         *
         * Next.js menyimpan halaman yang sudah dikunjungi di Router Cache
         * milik browser. Perpindahan lewat router tidak membuang isinya,
         * sehingga setelah user lain masuk, halaman lama milik user
         * sebelumnya masih bisa muncul sampai di-refresh paksa.
         *
         * Memuat ulang seluruh halaman membuang cache itu sepenuhnya.
         * replace() dipakai agar tombol Kembali tidak membawa pengguna
         * balik ke halaman yang sudah tidak boleh dia akses.
         */
        window.location.replace("/login");
      }}>
      <Ikon nama="logout" ukuran={17} />
    </button>
  );
}
