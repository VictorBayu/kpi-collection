"use client";

import { useRef } from "react";

/**
 * Input angka dengan pemisah ribuan gaya Indonesia.
 *
 * Yang dilihat pengguna dikelompokkan titik (100.000.000) dan — bila
 * `desimal` — memakai koma untuk pecahan (4,5). Yang DISIMPAN tetap angka
 * mentah tanpa pemisah, dengan titik sebagai desimal (100000000, 4.5),
 * supaya semua kode yang sudah ada — Number(v), angkaAtauNull — tidak
 * perlu tahu soal format tampilan sama sekali.
 *
 * Kursor dijaga tetap di tempatnya saat mengetik di tengah angka: tanpa
 * itu, menyisipkan satu digit di awal melempar kursor ke ujung tiap
 * ketikan dan mengetik jadi menyiksa.
 */
type Props = {
  value: string;
  onChange: (mentah: string) => void;
  desimal?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  onBlur?: () => void;
};

const kelompokkan = (bulat: string) =>
  bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Angka mentah → tampilan berpemisah. */
function keTampilan(mentah: string, desimal: boolean): string {
  if (mentah === "" || mentah == null) return "";
  const [bulatRaw, pecahanRaw] = mentah.split(".");
  const bulat = (bulatRaw || "").replace(/\D/g, "");
  const depan = bulat ? kelompokkan(bulat) : "";
  if (desimal && mentah.includes(".")) {
    return depan + "," + (pecahanRaw ?? "").replace(/\D/g, "");
  }
  return depan;
}

/** Tampilan yang diketik → angka mentah. */
function keMentah(tampil: string, desimal: boolean): string {
  let s = tampil.replace(/\./g, "");        // buang titik ribuan
  if (desimal) s = s.replace(",", ".");     // koma → titik desimal
  s = s.replace(desimal ? /[^\d.]/g : /\D/g, "");
  if (desimal) {
    const bagian = s.split(".");
    if (bagian.length > 2) s = bagian[0] + "." + bagian.slice(1).join("");
  }
  return s;
}

export default function InputAngka({
  value, onChange, desimal = false, className, placeholder,
  disabled, id, title, onBlur,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  function tangani(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    // Hitung berapa digit di kiri kursor sebelum diformat ulang.
    const sebelum = el.value.slice(0, el.selectionStart ?? el.value.length);
    const digitKiri = (sebelum.match(/\d/g) || []).length;

    const mentah = keMentah(el.value, desimal);
    onChange(mentah);

    const terformat = keTampilan(mentah, desimal);
    // Kembalikan kursor tepat setelah digit ke-`digitKiri` pada teks baru.
    requestAnimationFrame(() => {
      const inp = ref.current;
      if (!inp) return;
      let pos = 0, terlihat = 0;
      while (pos < terformat.length && terlihat < digitKiri) {
        if (/\d/.test(terformat[pos])) terlihat++;
        pos++;
      }
      inp.setSelectionRange(pos, pos);
    });
  }

  return (
    <input
      ref={ref}
      id={id}
      title={title}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      inputMode={desimal ? "decimal" : "numeric"}
      value={keTampilan(value ?? "", desimal)}
      onChange={tangani}
      onBlur={onBlur}
    />
  );
}
