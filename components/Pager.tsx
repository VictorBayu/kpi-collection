"use client";

/**
 * Paginasi yang dipakai bersama beberapa halaman admin.
 *
 * Menampilkan nomor halaman, bukan sekadar maju-mundur. Dengan 65 cabang
 * atau ribuan baris data mentah, "berikutnya" saja memaksa admin menekan
 * belasan kali untuk sampai ke bagian tengah — sementara nomor halaman
 * memberi tahu sekaligus di mana posisinya sekarang dan seberapa jauh
 * sisanya.
 *
 * Nomor yang ditampilkan dibatasi di sekitar halaman aktif supaya barisnya
 * tidak memanjang saat jumlah halaman banyak; halaman pertama dan terakhir
 * selalu ikut ditampilkan karena keduanya yang paling sering dituju.
 */
export default function Pager({
  hal, totalHal, totalBaris, dariBaris, sampaiBaris, satuan = "baris", onPindah,
}: {
  hal: number;               // berbasis nol
  totalHal: number;
  totalBaris: number;
  dariBaris: number;         // berbasis satu, untuk ditampilkan
  sampaiBaris: number;
  satuan?: string;
  onPindah: (h: number) => void;
}) {
  if (totalHal <= 1) {
    return (
      <div className="pager">
        <span className="faint">
          {totalBaris.toLocaleString("id-ID")} {satuan}
        </span>
      </div>
    );
  }

  // Halaman pertama, terakhir, dan tetangga halaman aktif.
  const nomor: (number | "…")[] = [];
  for (let i = 0; i < totalHal; i++) {
    const dekat = Math.abs(i - hal) <= 1;
    if (i === 0 || i === totalHal - 1 || dekat) nomor.push(i);
    else if (nomor[nomor.length - 1] !== "…") nomor.push("…");
  }

  return (
    <div className="pager">
      <span className="faint">
        {dariBaris.toLocaleString("id-ID")}–{sampaiBaris.toLocaleString("id-ID")} dari{" "}
        {totalBaris.toLocaleString("id-ID")} {satuan}
      </span>
      <div className="pager-btns">
        <button className="btn ghost sm" disabled={hal === 0}
                onClick={() => onPindah(hal - 1)}>← Sebelumnya</button>

        <div className="pager-nomor">
          {nomor.map((n, i) =>
            n === "…" ? (
              <span className="pager-jeda" key={`j${i}`}>…</span>
            ) : (
              <button key={n}
                      className={"pager-hal" + (n === hal ? " on" : "")}
                      onClick={() => onPindah(n)}>
                {n + 1}
              </button>
            ),
          )}
        </div>

        <button className="btn ghost sm" disabled={hal >= totalHal - 1}
                onClick={() => onPindah(hal + 1)}>Berikutnya →</button>
      </div>
    </div>
  );
}
