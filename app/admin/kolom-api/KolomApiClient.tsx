"use client";

import { useEffect, useMemo, useState } from "react";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";

type Kolom = {
  kolom: string; label: string; jenis: string; agregat: boolean;
  kelompok: string | null; urutan: number; field_api: string | null;
  bawaan: boolean; aktif: boolean; keterangan: string | null; dipakai: number;
  sumber: string;
};

const KOSONG: Kolom = {
  kolom: "", label: "", jenis: "teks", agregat: false, kelompok: "",
  urutan: 900, field_api: "", bawaan: false, aktif: true,
  keterangan: "", dipakai: 0, sumber: "api",
};

const NAMA_SUMBER: Record<string, string> = {
  api: "Data API utama",
  pendukung: "Data pendukung",
};

/**
 * Katalog kolom data mentah.
 *
 * Layar ini menjawab kebutuhan yang sebelumnya hanya bisa dipenuhi lewat
 * migrasi: menambah satu field dari API supaya bisa dipakai menyusun
 * rumus. Yang perlu dipahami admin — dan karenanya ditulis di layar —
 * adalah bahwa kolom baru mulai terisi pada tarikan BERIKUTNYA, bukan
 * seketika. Tanpa keterangan itu, kolom yang masih kosong akan disangka
 * rusak.
 *
 * Kolom inti dibedakan dari kolom kustom karena aturannya memang berbeda:
 * yang inti tidak bisa dihapus atau diubah jenisnya, karena mesin hitung
 * dan pemetaan PIC bersandar padanya.
 */
export default function KolomApiClient() {
  const [daftar, setDaftar] = useState<Kolom[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [sunting, setSunting] = useState<(Kolom & { baru: boolean }) | null>(null);

  async function segarkan() {
    setMuat(true);
    try {
      const r = await fetch("/api/admin/kolom-api", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal memuat katalog kolom."); return; }
      setDaftar(j.kolom ?? []);
    } finally { setMuat(false); }
  }
  useEffect(() => { segarkan(); }, []);

  const tampil = useMemo(() => {
    const c = cari.trim().toLowerCase();
    if (!c) return daftar;
    return daftar.filter((k) =>
      [k.kolom, k.label, k.kelompok ?? "", k.field_api ?? ""]
        .join(" ").toLowerCase().includes(c));
  }, [daftar, cari]);

  const kustom = daftar.filter((k) => !k.bawaan).length;

  async function kirim(cara: string, badan?: unknown, url = "/api/admin/kolom-api") {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(url, {
        method: cara,
        headers: badan ? { "content-type": "application/json" } : undefined,
        body: badan ? JSON.stringify(badan) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  async function simpan() {
    if (!sunting) return;
    const ok = await kirim(sunting.baru ? "POST" : "PUT", sunting);
    if (ok) {
      setSunting(null);
      setPesan(sunting.baru
        ? "Kolom dibuat. Datanya akan mulai terisi pada tarikan API berikutnya."
        : "Tersimpan.");
    }
  }

  async function hapus(k: Kolom) {
    const ok = await kirim("DELETE", undefined,
      `/api/admin/kolom-api?kolom=${encodeURIComponent(k.kolom)}`);
    if (ok) { setSunting(null); setPesan(`Kolom "${k.label}" dihapus.`); }
  }

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Kolom Data API</h2>
          <p>
            Daftar kolom data mentah yang bisa dipakai saat menyusun rumus indikator.
            Kolom baru mulai terisi pada tarikan API berikutnya.
          </p>
        </div>
        <button className="btn" onClick={() => setSunting({ ...KOSONG, baru: true })}>
          + Tambah kolom
        </button>
      </div>

      {pesan && (
        <div className={"alert mb " + (/dihapus|Tersimpan|dibuat/.test(pesan) ? "ok" : "bad")}>
          {pesan}
        </div>
      )}

      {sunting && (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>
            {sunting.baru ? "Kolom baru" : `Ubah: ${sunting.label}`}
          </h3>

          <div className="kolom-form">
            <label className="field">
              <span>Nama kolom</span>
              <input value={sunting.kolom} disabled={!sunting.baru}
                     placeholder="contract_prepaid"
                     onChange={(e) => setSunting({ ...sunting, kolom: e.target.value })} />
            </label>
            <label className="field">
              <span>Label tampilan</span>
              <input value={sunting.label} placeholder="Contract Prepaid"
                     onChange={(e) => setSunting({ ...sunting, label: e.target.value })} />
            </label>
            <label className="field">
              <span>Field di API</span>
              <input value={sunting.field_api ?? ""} placeholder="ContractPrepaid"
                     onChange={(e) => setSunting({ ...sunting, field_api: e.target.value })} />
            </label>
            <label className="field">
              <span>Sumber data</span>
              {/* Sumber dikunci setelah tersimpan: memindahkan kolom antar
                  tabel berarti memindahkan datanya juga, dan itu bukan
                  sesuatu yang boleh terjadi karena satu klik. */}
              {sunting.baru ? (
                <Pilih nilai={sunting.sumber} cari={false}
                       onPilih={(v) => setSunting({ ...sunting, sumber: v })}
                       opsi={[
                         { nilai: "api", label: "Data API utama", ket: "tabel data_mentah" },
                         { nilai: "pendukung", label: "Data pendukung", ket: "digabung lewat agreement_no" },
                       ]} />
              ) : (
                <input value={NAMA_SUMBER[sunting.sumber] ?? sunting.sumber} disabled />
              )}
            </label>
            <label className="field">
              <span>Jenis</span>
              <Pilih nilai={sunting.jenis} cari={false}
                     onPilih={(v) => setSunting({ ...sunting, jenis: v })}
                     opsi={[
                       { nilai: "teks", label: "Teks" },
                       { nilai: "angka", label: "Angka" },
                       { nilai: "tanggal", label: "Tanggal" },
                     ]} />
            </label>
            <label className="field">
              <span>Kelompok</span>
              <input value={sunting.kelompok ?? ""} placeholder="Nilai"
                     onChange={(e) => setSunting({ ...sunting, kelompok: e.target.value })} />
            </label>
            <label className="field">
              <span>Urutan</span>
              <input type="number" value={sunting.urutan}
                     onChange={(e) =>
                       setSunting({ ...sunting, urutan: Number(e.target.value) || 0 })} />
            </label>
          </div>

          <label className="field mt">
            <span>Keterangan (opsional)</span>
            <input value={sunting.keterangan ?? ""}
                   placeholder="Dipakai untuk perhitungan prepaid"
                   onChange={(e) => setSunting({ ...sunting, keterangan: e.target.value })} />
          </label>

          <div className="kolom-cek">
            <label className="ind-cek">
              <input type="checkbox" checked={sunting.agregat}
                     onChange={(e) => setSunting({ ...sunting, agregat: e.target.checked })} />
              Boleh dijumlahkan (SUM/AVG)
            </label>
            <label className="ind-cek">
              <input type="checkbox" checked={sunting.aktif}
                     onChange={(e) => setSunting({ ...sunting, aktif: e.target.checked })} />
              Aktif — muncul saat menyusun rumus
            </label>
          </div>

          {sunting.bawaan && (
            <p className="muted small mt">
              Kolom inti: nama dan jenisnya dikunci, dan tidak bisa dihapus.
              Bila tidak dipakai lagi, cukup hilangkan centang Aktif.
            </p>
          )}
          {sunting.jenis === "angka" && !sunting.agregat && (
            <p className="muted small mt">
              Kolom angka biasanya perlu dicentang &quot;boleh dijumlahkan&quot; agar
              bisa dipilih sebagai sumber SUM di rumus.
            </p>
          )}

          <div className="mt" style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={sibuk} onClick={simpan}>Simpan</button>
            <button className="btn ghost" disabled={sibuk}
                    onClick={() => { setSunting(null); setPesan(null); }}>Batal</button>
            {!sunting.baru && !sunting.bawaan && (
              <button className="btn ghost bahaya" disabled={sibuk}
                      onClick={() => hapus(sunting)}>Hapus kolom</button>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="cardhead rowbetween">
          <div>
            <h3 style={{ fontSize: 14 }}>
              {daftar.length} kolom · {kustom} kustom
            </h3>
            <p className="muted small">
              Kolom inti dibuat bersama sistem dan tidak bisa dihapus.
            </p>
          </div>
          <KotakCari nilai={cari} onUbah={setCari} placeholder="Cari kolom…" />
        </div>

        <table>
          <thead>
            <tr>
              <th>Kolom</th><th>Sumber</th><th>Field API</th><th>Jenis</th>
              <th>Kelompok</th><th className="r">Dipakai</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((k) => (
              <tr key={k.kolom} className={k.aktif ? "" : "kurang"}>
                <td>
                  <b>{k.label}</b>
                  {!k.bawaan && <span className="tag-warn">kustom</span>}
                  {!k.aktif && <span className="tag-warn">nonaktif</span>}
                  <div className="faint num">{k.kolom}</div>
                </td>
                <td className={k.sumber === "pendukung" ? "" : "faint"}>
                  {k.sumber === "pendukung" ? "Pendukung" : "API utama"}
                </td>
                <td className={k.field_api ? "num" : "faint"}>{k.field_api ?? "—"}</td>
                <td>
                  {k.jenis}
                  {k.agregat && <span className="faint"> · dapat dijumlah</span>}
                </td>
                <td className={k.kelompok ? "" : "faint"}>{k.kelompok ?? "—"}</td>
                <td className="r num">
                  {k.dipakai ? <b>{k.dipakai}</b> : <span className="faint">0</span>}
                </td>
                <td className="r">
                  <button className="btn ghost sm"
                          onClick={() => setSunting({ ...k, baru: false })}>Ubah</button>
                </td>
              </tr>
            ))}
            {!tampil.length && (
              <tr><td colSpan={7} className="empty">
                {muat ? "Memuat…" : "Tidak ada kolom yang cocok."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
