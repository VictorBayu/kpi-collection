"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import Pilih from "./Pilih";

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni",
               "Juli","Agustus","September","Oktober","November","Desember"];

function label(iso: string) {
  const [th, bl] = iso.split("-");
  return `${BULAN[Number(bl) - 1] ?? bl} ${th}`;
}

/**
 * Pemilih periode cutoff.
 *
 * Menggantikan pasangan <select> + tombol "Lihat": dua langkah untuk satu
 * niat. Memilih periode langsung memuat halamannya, dan penyaring lain di
 * URL (cabang yang sedang dibuka, misalnya) sengaja dipertahankan supaya
 * berpindah bulan tidak melempar pembaca kembali ke awal.
 *
 * Periode terbaru diberi penanda agar terlihat mana cutoff berjalan —
 * daftar tanggal yang seragam tidak memberi tahu itu.
 *
 * Penyaring lain yang perlu dipertahankan dioper lewat `simpan`, bukan
 * dibaca sendiri dengan useSearchParams: kait itu memaksa seluruh halaman
 * masuk Suspense boundary saat build, sedangkan halaman pemanggilnya sudah
 * memegang nilai-nilai itu dan tinggal menyerahkannya.
 */
export default function PilihPeriode({
  daftar, aktif, nama = "periode", simpan,
}: {
  daftar: string[]; aktif: string; nama?: string;
  simpan?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const path = usePathname();
  const [menunggu, mulai] = useTransition();

  function pindah(v: string) {
    if (v === aktif) return;
    const p = new URLSearchParams();
    p.set(nama, v);
    for (const [k, nilai] of Object.entries(simpan ?? {})) {
      if (nilai) p.set(k, nilai);
    }
    mulai(() => router.push(`${path}?${p.toString()}`));
  }

  const terbaru = daftar[0];

  return (
    <div className={"periode-pilih" + (menunggu ? " menunggu" : "")}>
      <span className="periode-label">Periode</span>
      <div className="periode-kotak">
        <Pilih nilai={aktif} onPilih={pindah} cari={daftar.length > 7}
               opsi={daftar.map((p) => ({
                 nilai: p,
                 label: label(p),
                 ket: p === terbaru ? "terbaru" : undefined,
               }))} />
      </div>
      {menunggu && <span className="periode-memuat" aria-live="polite">memuat…</span>}
    </div>
  );
}
