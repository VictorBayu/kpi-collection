"use client";

import { useEffect, useRef, useState } from "react";
import Ikon from "@/components/Ikon";

/**
 * Kotak cari di daftar cabang (Data KPI admin).
 *
 * Daftar area/cabang dirender di server; komponen ini hanya menyaring
 * elemen yang sudah ada lewat atribut data-cari, jadi tidak perlu
 * mengirim ulang seluruh daftar ke browser sebagai props. Selama ada
 * kata kunci, semua area dibuka supaya hasil yang cocok langsung terlihat.
 */
export default function CariCabang({ targetId }: { targetId: string }) {
  const [kata, setKata] = useState("");
  const asal = useRef<Map<HTMLDetailsElement, boolean>>(new Map());

  useEffect(() => {
    const akar = document.getElementById(targetId);
    if (!akar) return;
    const k = kata.trim().toUpperCase();
    const grup = Array.from(akar.querySelectorAll<HTMLDetailsElement>("details[data-area]"));

    if (k && !asal.current.size) grup.forEach((g) => asal.current.set(g, g.open));

    let ada = 0;
    for (const g of grup) {
      const area = (g.dataset.area ?? "").toUpperCase();
      const item = Array.from(g.querySelectorAll<HTMLElement>("[data-cari]"));
      let cocokDiGrup = 0;
      for (const it of item) {
        const cocok = !k || area.includes(k) || (it.dataset.cari ?? "").toUpperCase().includes(k);
        it.hidden = !cocok;
        if (cocok) cocokDiGrup++;
      }
      g.hidden = !!k && cocokDiGrup === 0;
      if (k) g.open = cocokDiGrup > 0;
      ada += cocokDiGrup;
    }

    if (!k && asal.current.size) {
      asal.current.forEach((buka, g) => { g.open = buka; });
      asal.current.clear();
    }
    const kosong = akar.querySelector<HTMLElement>("[data-cari-kosong]");
    if (kosong) kosong.hidden = !k || ada > 0;
  }, [kata, targetId]);

  return (
    <label className="cari-cabang">
      <Ikon nama="search" ukuran={16} className="cari-cabang-ikon" />
      <input type="search" value={kata} placeholder="Cari cabang atau area…"
             aria-label="Cari cabang atau area"
             onChange={(e) => setKata(e.target.value)} />
    </label>
  );
}
