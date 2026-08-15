"use client";

/**
 * Mencetak halaman apa adanya — di Windows dan Mac, dialog cetak selalu
 * punya pilihan "Simpan sebagai PDF", jadi satu tombol ini melayani dua
 * kebutuhan: laporan tercetak dan berkas untuk dikirim ke grup.
 *
 * Gaya khusus cetak ada di globals.css (@media print): bilah navigasi,
 * tombol, dan elemen berkelas .tanpa-cetak disembunyikan, dan seluruh
 * kartu cabang dibuka supaya isinya ikut tercetak walau di layar sedang
 * terlipat.
 */
export default function TombolCetak({ label = "Cetak / PDF" }: { label?: string }) {
  return (
    <button
      className="btn ghost sm tanpa-cetak"
      onClick={() => {
        // Buka semua kartu lebih dulu; <details> yang tertutup tidak ikut
        // tercetak dan hasilnya jadi laporan kosong.
        document.querySelectorAll<HTMLDetailsElement>("details.pc-kartu, details.orang")
          .forEach((d) => d.setAttribute("data-buka-asli", d.open ? "1" : "0"));
        document.querySelectorAll<HTMLDetailsElement>("details.pc-kartu, details.orang")
          .forEach((d) => { d.open = true; });

        window.print();

        // Kembalikan seperti semula setelah dialog cetak ditutup
        setTimeout(() => {
          document.querySelectorAll<HTMLDetailsElement>("details.pc-kartu, details.orang")
            .forEach((d) => { d.open = d.getAttribute("data-buka-asli") === "1"; });
        }, 400);
      }}
    >
      {label}
    </button>
  );
}
