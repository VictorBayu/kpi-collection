"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pemuat amCharts 5 dari CDN.
 *
 * Dimuat lewat CDN, bukan dipasang sebagai dependensi npm, karena amCharts
 * berukuran besar sementara hanya dipakai satu halaman. Menaruhnya di
 * bundel utama berarti setiap halaman lain ikut menanggung ongkos unduhnya,
 * termasuk dasbor karyawan yang tidak punya grafik sama sekali.
 *
 * Berkas yang sama dipakai bersama semua grafik di halaman ini, jadi
 * pemuatannya dijaga hanya sekali lewat janji yang dibagi — tanpa itu, tiga
 * grafik di satu halaman akan mengunduh pustaka yang sama tiga kali.
 */

const BERKAS = [
  "https://cdn.amcharts.com/lib/5/index.js",
  "https://cdn.amcharts.com/lib/5/xy.js",
  "https://cdn.amcharts.com/lib/5/radar.js",
  "https://cdn.amcharts.com/lib/5/flow.js",
  "https://cdn.amcharts.com/lib/5/themes/Animated.js",
];

let janji: Promise<void> | null = null;

function muatSatu(src: string) {
  return new Promise<void>((selesai, gagal) => {
    // Berkas yang sudah ada di halaman tidak diunduh ulang.
    if (document.querySelector(`script[src="${src}"]`)) return selesai();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;   // urutan penting: xy/radar/flow butuh index lebih dulu
    s.onload = () => selesai();
    s.onerror = () => gagal(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}

export function muatAmCharts(): Promise<void> {
  if (!janji) {
    // Dimuat berurutan, bukan serentak: modul xy, radar, dan flow
    // mendaftarkan dirinya ke objek am5 dari index.js, jadi index harus
    // sudah selesai sebelum sisanya dijalankan.
    janji = BERKAS.reduce(
      (rantai, src) => rantai.then(() => muatSatu(src)),
      Promise.resolve(),
    ).catch((e) => {
      janji = null;   // biar percobaan berikutnya tidak langsung gagal
      throw e;
    });
  }
  return janji;
}

type Props = {
  /** Dipanggil setelah pustaka siap; kembalikan fungsi pembersih. */
  gambar: (root: any, am5: any) => void;
  tinggi?: number;
  /** Nilai yang bila berubah membuat grafik digambar ulang. */
  kunci?: string;
  kosong?: boolean;
  pesanKosong?: string;
};

export default function AmChart({
  gambar, tinggi = 420, kunci = "", kosong = false,
  pesanKosong = "Belum ada data untuk digambar.",
}: Props) {
  const wadah = useRef<HTMLDivElement>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    if (kosong) return;
    let root: any = null;
    let batal = false;

    muatAmCharts()
      .then(() => {
        if (batal || !wadah.current) return;
        const am5 = (window as any).am5;
        if (!am5) throw new Error("Pustaka grafik tidak tersedia.");

        root = am5.Root.new(wadah.current);
        // Tema dasar mengikuti DESIGN.md: huruf Inter, tinta slate, garis
        // kisi hairline. Pengaturan warna yang ditulis eksplisit di tiap
        // grafik tetap menang atas aturan tema ini.
        const tema = am5.Theme.new(root);
        tema.rule("Label").setAll({
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize: 12, fill: am5.color(0x475569),
        });
        tema.rule("Grid").setAll({ stroke: am5.color(0xe2e8f0), strokeOpacity: 1 });
        tema.rule("Tooltip").setAll({ getFillFromSprite: false });
        tema.rule("PointedRectangle", ["tooltip", "background"]).setAll({
          fill: am5.color(0x0f172a), fillOpacity: 0.96, stroke: am5.color(0x334155), strokeOpacity: 1,
        });
        tema.rule("Label", ["tooltip"]).setAll({ fill: am5.color(0xf8fafc), fontSize: 12 });
        root.setThemes([(window as any).am5themes_Animated.new(root), tema]);
        // Tulisan "Chart by amCharts" dari lisensi gratis; disembunyikan
        // hanya bila memang berlisensi. Dibiarkan apa adanya di sini.
        gambar(root, am5);
        setSiap(true);
      })
      .catch((e) => {
        if (!batal) setGalat(e instanceof Error ? e.message : String(e));
      });

    return () => {
      batal = true;
      if (root) root.dispose();
    };
  }, [gambar, kunci, kosong]);

  if (kosong) {
    return <div className="grafik-kosong" style={{ height: tinggi }}>{pesanKosong}</div>;
  }
  if (galat) {
    return (
      <div className="grafik-kosong" style={{ height: tinggi }}>
        {galat}
        <div className="faint small mt">
          Grafik dimuat dari internet; periksa sambungan lalu muat ulang halaman.
        </div>
      </div>
    );
  }

  return (
    <div className="grafik-bungkus">
      {!siap && <div className="grafik-memuat" style={{ height: tinggi }}>Memuat grafik…</div>}
      <div ref={wadah} style={{ height: tinggi, width: "100%",
                                display: siap ? "block" : "none" }} />
    </div>
  );
}
