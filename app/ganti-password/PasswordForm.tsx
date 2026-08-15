"use client";

import { useState } from "react";

export default function PasswordForm() {
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [pesan, setPesan] = useState<{ tipe: "galat" | "sukses"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const kuat = baru.length >= 8 && /[a-zA-Z]/.test(baru) && /[0-9]/.test(baru);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (baru !== ulang) {
      setPesan({ tipe: "galat", teks: "Ketikan ulang tidak sama dengan password baru." });
      return;
    }
    setSibuk(true);
    setPesan(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lama, baru }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPesan({ tipe: "sukses", teks: "Password diperbarui. Mengalihkan ke dasbor..." });
      // Muat ulang penuh agar sesi baru tidak tercampur cache lama.
      setTimeout(() => window.location.replace("/dashboard"), 1200);
    } catch (e: any) {
      setPesan({ tipe: "galat", teks: e.message });
      setSibuk(false);
    }
  }

  return (
    <form className="card card-pad narrow" onSubmit={simpan}>
      <label className="field mb">
        <span>Password saat ini</span>
        <input type="password" value={lama} required onChange={(e) => setLama(e.target.value)} />
      </label>

      <label className="field mb">
        <span>Password baru</span>
        <input type="password" value={baru} required onChange={(e) => setBaru(e.target.value)} />
        <small className={kuat ? "ok" : "faint"}>
          {kuat ? "Sudah memenuhi syarat" : "Minimal 8 karakter, gabungkan huruf dan angka"}
        </small>
      </label>

      <label className="field mb">
        <span>Ketik ulang password baru</span>
        <input type="password" value={ulang} required onChange={(e) => setUlang(e.target.value)} />
      </label>

      {pesan && (
        <p className={pesan.tipe === "galat" ? "inline-error" : "inline-ok"} role="alert">
          {pesan.teks}
        </p>
      )}

      <button className="btn wide" disabled={sibuk || !kuat}>
        {sibuk ? "Menyimpan..." : "Perbarui password"}
      </button>
    </form>
  );
}
