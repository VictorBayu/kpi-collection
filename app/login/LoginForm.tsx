"use client";

import { useState } from "react";
import Ikon from "@/components/Ikon";

export default function LoginForm() {
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setGalat(null);
    setSibuk(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Muat ulang penuh, bukan router.replace(). Router Cache milik Next
      // masih menyimpan halaman milik akun sebelumnya; kalau tidak dibuang,
      // pengguna baru bisa melihat sisa data akun lama sampai refresh paksa.
      window.location.replace(data.tujuan);
    } catch (e: any) {
      setGalat(e.message);
      setSibuk(false);
    }
  }

  return (
    <form onSubmit={masuk} className="login-form">
      <label className="field">
        <span className="field-atas"><span>Nomor Induk Karyawan (NIK)</span></span>
        <span className="login-input">
          <Ikon nama="badge" ukuran={18} className="login-input-ikon" />
          <input className="num" inputMode="numeric" autoComplete="username"
                 placeholder="20240117" value={nik} required
                 onChange={(e) => setNik(e.target.value)} />
        </span>
      </label>

      <label className="field">
        <span className="field-atas">
          <span>Password</span>
          <em>Lupa? Hubungi admin data</em>
        </span>
        <span className="login-input">
          <Ikon nama="key" ukuran={18} className="login-input-ikon" />
          <input type={lihat ? "text" : "password"} autoComplete="current-password"
                 placeholder="••••••••" value={password} required
                 onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="login-lihat" onClick={() => setLihat(!lihat)}
                  aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}>
            <Ikon nama={lihat ? "eyeOff" : "eye"} ukuran={16} />
            {lihat ? "Sembunyikan" : "Lihat"}
          </button>
        </span>
      </label>

      {galat && <p className="inline-error" role="alert">{galat}</p>}

      <button className="btn wide login-masuk" disabled={sibuk}>
        {sibuk ? "Memeriksa..." : <>Masuk ke Dasbor <Ikon nama="arrowRight" ukuran={18} tebal={2.2} /></>}
      </button>
    </form>
  );
}
