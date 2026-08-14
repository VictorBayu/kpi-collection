"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
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
      router.replace(data.tujuan);
    } catch (e: any) {
      setGalat(e.message);
      setSibuk(false);
    }
  }

  return (
    <form onSubmit={masuk}>
      <label className="field mb">
        <span>Nomor Induk Karyawan</span>
        <input className="num" inputMode="numeric" autoComplete="username"
               placeholder="20240117" value={nik} required
               onChange={(e) => setNik(e.target.value)} />
      </label>

      <label className="field">
        <span>Password</span>
        <span className="inputgroup">
          <input type={lihat ? "text" : "password"} autoComplete="current-password"
                 placeholder="••••••••" value={password} required
                 onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setLihat(!lihat)}
                  aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}>
            {lihat ? "Sembunyikan" : "Lihat"}
          </button>
        </span>
      </label>

      {galat && <p className="inline-error" role="alert">{galat}</p>}

      <button className="btn wide" disabled={sibuk}>
        {sibuk ? "Memeriksa..." : "Masuk ke dasbor"}
      </button>

      <p className="faint center">Lupa password? Hubungi admin data di ext. 4120.</p>
    </form>
  );
}
