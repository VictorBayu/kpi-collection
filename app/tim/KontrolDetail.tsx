"use client";

import { useEffect, useState } from "react";

/**
 * Tombol buka/tutup semua kartu anggota di mode "Detail semua indikator".
 *
 * Daftar anggotanya sengaja tetap dirender di server — memindahkannya ke
 * klien hanya demi tombol ini akan menambah beban JavaScript untuk data
 * yang bisa mencapai ratusan baris. Komponen kecil ini cukup membuka atau
 * menutup elemen <details> yang sudah ada di halaman.
 */
export default function KontrolDetail() {
  const [semuaTerbuka, setSemuaTerbuka] = useState(false);
  const [jumlah, setJumlah] = useState({ total: 0, terbuka: 0 });

  function hitung() {
    const kartu = document.querySelectorAll<HTMLDetailsElement>("details.orang");
    const terbuka = Array.from(kartu).filter((d) => d.open).length;
    setJumlah({ total: kartu.length, terbuka });
    setSemuaTerbuka(kartu.length > 0 && terbuka === kartu.length);
  }

  useEffect(() => {
    hitung();
    // Ikut menyesuaikan kalau pengguna membuka/menutup kartu satu per satu
    const pada = () => hitung();
    document.addEventListener("toggle", pada, true);
    return () => document.removeEventListener("toggle", pada, true);
  }, []);

  function ubahSemua(buka: boolean) {
    document.querySelectorAll<HTMLDetailsElement>("details.orang")
      .forEach((d) => { d.open = buka; });
    hitung();
  }

  if (!jumlah.total) return null;

  return (
    <div className="kontrol-detail">
      <span className="faint small">
        {jumlah.terbuka} dari {jumlah.total} terbuka
      </span>
      <button className="btn ghost sm" onClick={() => ubahSemua(!semuaTerbuka)}>
        {semuaTerbuka ? "Tutup semua" : "Buka semua"}
      </button>
    </div>
  );
}
