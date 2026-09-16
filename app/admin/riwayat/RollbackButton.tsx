"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RollbackButton({ batchId, periode }: { batchId: string; periode: string }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);

  async function aktifkan() {
    const alasan = prompt(
      `Aktifkan kembali batch ${periode}?\n\n` +
      `Angka di layar karyawan akan langsung berubah. Tulis alasannya untuk catatan audit:`);
    if (alasan === null) return;

    setSibuk(true);
    const res = await fetch("/api/import/rollback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, alasan }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { alert(d.error); return; }
    router.refresh();
  }

  return (
    <button className="btn hati sm" onClick={aktifkan} disabled={sibuk}>
      {sibuk ? "Mengaktifkan..." : "Aktifkan lagi"}
    </button>
  );
}
