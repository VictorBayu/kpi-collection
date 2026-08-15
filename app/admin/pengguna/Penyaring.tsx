"use client";

import { useState } from "react";
import Pilih from "@/components/Pilih";

export type Aturan = { kolom: string; operator: string; nilai: string; nilai2?: string };

export type Skema = {
  kolom: { kode: string; label: string; jenis: string; opsi?: string[] }[];
  operator: Record<string, { kode: string; label: string }[]>;
  pilihan: { cabang?: string[]; area?: string[]; jabatan?: string[] };
};

/** Operator yang tidak butuh isian nilai. */
const TANPA_NILAI = ["kosong", "terisi"];

/**
 * Penyaring bersusun.
 *
 * Susunannya kolom → operator → nilai, mengikuti cara orang mengucapkan
 * syaratnya ("cabang mengandung MANADO"). Operator yang ditawarkan
 * menyesuaikan jenis kolom: angka dapat "lebih dari", teks dapat
 * "mengandung", jadi pengguna tidak perlu tahu tipe data untuk memakainya.
 *
 * Aturan yang sedang aktif ditampilkan sebagai chip yang bisa dihapus satu
 * per satu, supaya selalu jelas kenapa daftarnya menyusut — masalah paling
 * umum pada penyaring yang tersembunyi di balik panel.
 */
export default function Penyaring({
  skema, aturan, gabung, onUbah, onGabung, hasil, total,
}: {
  skema: Skema | null;
  aturan: Aturan[];
  gabung: "dan" | "atau";
  onUbah: (a: Aturan[]) => void;
  onGabung: (g: "dan" | "atau") => void;
  hasil: number;
  total: number;
}) {
  const [buka, setBuka] = useState(false);
  if (!skema) return null;
  const sk = skema;   // setelah penjagaan di atas, pasti terisi

  const defKolom = (kode: string) => sk.kolom.find((k) => k.kode === kode);
  const opsiUntuk = (kode: string): string[] | undefined => {
    const d = defKolom(kode);
    if (d?.opsi) return d.opsi;
    if (kode === "cabang") return sk.pilihan.cabang;
    if (kode === "area") return sk.pilihan.area;
    if (kode === "jabatan") return sk.pilihan.jabatan;
    return undefined;
  };

  function ubah(i: number, patch: Partial<Aturan>) {
    const baru = aturan.map((a, x) => (x === i ? { ...a, ...patch } : a));
    // Ganti kolom = operator lama bisa jadi tidak berlaku lagi
    if (patch.kolom) {
      const jenis = defKolom(patch.kolom)?.jenis ?? "teks";
      baru[i].operator = sk.operator[jenis]?.[0]?.kode ?? "mengandung";
      baru[i].nilai = "";
    }
    onUbah(baru);
  }

  const tambah = () =>
    onUbah([...aturan, { kolom: "cabang", operator: "mengandung", nilai: "" }]);

  const label = (a: Aturan) => {
    const k = defKolom(a.kolom);
    const jenis = k?.jenis ?? "teks";
    const op = sk.operator[jenis]?.find((o) => o.kode === a.operator);
    return `${k?.label ?? a.kolom} ${op?.label ?? a.operator}${
      TANPA_NILAI.includes(a.operator) ? "" : ` ${a.nilai}${a.operator === "antara" ? `–${a.nilai2 ?? ""}` : ""}`
    }`;
  };

  const aktif = aturan.filter((a) => TANPA_NILAI.includes(a.operator) || a.nilai.trim());

  return (
    <div className="saring">
      <div className="saring-bar">
        <button className={"btn ghost sm" + (aktif.length ? " ada" : "")}
                onClick={() => setBuka(!buka)}>
          ⚙ Filter{aktif.length > 0 && ` (${aktif.length})`}
        </button>

        {aktif.map((a, i) => (
          <span className="saring-chip" key={i}>
            {label(a)}
            <button title="Hapus filter ini"
                    onClick={() => onUbah(aturan.filter((_, x) => x !== aturan.indexOf(a)))}>×</button>
          </span>
        ))}

        {aktif.length > 0 && (
          <>
            <button className="saring-bersih" onClick={() => onUbah([])}>Bersihkan semua</button>
            <span className="faint saring-hasil">
              {hasil} dari {total} pengguna
            </span>
          </>
        )}
      </div>

      {buka && (
        <div className="saring-panel">
          {aturan.length === 0 && (
            <p className="faint small">
              Belum ada syarat. Tambahkan satu untuk mempersempit daftar.
            </p>
          )}

          {aturan.map((a, i) => {
            const jenis = defKolom(a.kolom)?.jenis ?? "teks";
            const ops = sk.operator[jenis] ?? [];
            const opsiNilai = opsiUntuk(a.kolom);
            return (
              <div className="saring-baris" key={i}>
                <span className="saring-gabung">
                  {i === 0 ? "Bila" : (
                    <button className="saring-toggle"
                            onClick={() => onGabung(gabung === "dan" ? "atau" : "dan")}
                            title="Ganti antara semua syarat / salah satu syarat">
                      {gabung === "dan" ? "dan" : "atau"}
                    </button>
                  )}
                </span>

                <div className="saring-kolom">
                  <Pilih nilai={a.kolom} onPilih={(v) => ubah(i, { kolom: v })}
                         opsi={sk.kolom.map((k) => ({ nilai: k.kode, label: k.label }))} />
                </div>

                <div className="saring-op">
                  <Pilih nilai={a.operator} onPilih={(v) => ubah(i, { operator: v })} cari={false}
                         opsi={ops.map((o) => ({ nilai: o.kode, label: o.label }))} />
                </div>

                <div className="saring-nilai">
                  {TANPA_NILAI.includes(a.operator) ? (
                    <span className="faint small">tidak perlu nilai</span>
                  ) : opsiNilai ? (
                    <Pilih nilai={a.nilai} onPilih={(v) => ubah(i, { nilai: v })} bebas
                           placeholder="pilih atau ketik"
                           opsi={opsiNilai.map((o) => ({ nilai: o, label: o }))} />
                  ) : jenis === "tanggal" ? (
                    <input type="date" value={a.nilai}
                           onChange={(e) => ubah(i, { nilai: e.target.value })} />
                  ) : (
                    <input
                      inputMode={jenis === "angka" ? "numeric" : "text"}
                      className={jenis === "angka" ? "num" : ""}
                      value={a.nilai} placeholder="nilai"
                      onChange={(e) => ubah(i, { nilai: e.target.value })} />
                  )}

                  {a.operator === "antara" && (
                    <input className="num" inputMode="numeric" placeholder="sampai"
                           value={a.nilai2 ?? ""}
                           onChange={(e) => ubah(i, { nilai2: e.target.value })} />
                  )}
                </div>

                <button className="saring-x" title="Hapus baris"
                        onClick={() => onUbah(aturan.filter((_, x) => x !== i))}>×</button>
              </div>
            );
          })}

          <div className="saring-aksi">
            <button className="btn ghost sm" onClick={tambah} disabled={aturan.length >= 8}>
              + Tambah syarat
            </button>
            {aturan.length > 1 && (
              <span className="faint small">
                {gabung === "dan"
                  ? "Semua syarat harus terpenuhi."
                  : "Cukup salah satu syarat terpenuhi."}
              </span>
            )}
            <button className="btn sm" onClick={() => setBuka(false)}>Selesai</button>
          </div>
        </div>
      )}
    </div>
  );
}
