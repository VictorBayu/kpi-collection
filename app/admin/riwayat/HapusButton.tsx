"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HapusButton({
  batchId, periode, namaFile, baris,
}: { batchId: string; periode: string; namaFile: string; baris: number }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);

  async function hapus() {
    // Peringatan menyebut angka konkret supaya admin tahu persis apa yang
    // ikut hilang, bukan sekadar "yakin?" yang mudah diklik tanpa dibaca.
    const ya = confirm(
      `Hapus batch ${periode}?\n\n` +
      `Berkas   : ${namaFile}\n` +
      `Baris    : ${baris.toLocaleString("id-ID")}\n\n` +
      `Seluruh baris KPI/insentif batch ini dan berkas Excel aslinya akan ` +
      `dihapus permanen. Tindakan ini tidak bisa dibatalkan.`);
    if (!ya) return;

    setSibuk(true);
    const res = await fetch("/api/import/hapus", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { alert(d.error); return; }
    router.refresh();
  }

  return (
    <button className="btn danger sm" onClick={hapus} disabled={sibuk}>
      {sibuk ? "Menghapus…" : "Hapus"}
    </button>
  );
}
