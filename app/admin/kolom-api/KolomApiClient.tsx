"use client";

import { useEffect, useMemo, useState } from "react";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";

type Kolom = {
  kolom: string; label: string; jenis: string; agregat: boolean;
  kelompok: string | null; urutan: number; field_api: string | null;
  bawaan: boolean; aktif: boolean; keterangan: string | null; dipakai: number;
  sumber: string; ditarik: boolean; turunan: boolean;
};

const PER_HAL = 10;

const KOSONG: Kolom = {
  kolom: "", label: "", jenis: "teks", agregat: false, kelompok: "",
  urutan: 900, field_api: "", bawaan: false, aktif: true,
  keterangan: "", dipakai: 0, sumber: "api", ditarik: true, turunan: false,
};

type SumberRingkas = { kode: string; nama: string; jenis: string; tabel: string };

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
  const [sumber, setSumber] = useState<SumberRingkas[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [sunting, setSunting] = useState<(Kolom & { baru: boolean }) | null>(null);
  const [hal, setHal] = useState(0);

  async function segarkan() {
    setMuat(true);
    try {
      const r = await fetch("/api/admin/kolom-api", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal memuat katalog kolom."); return; }
      setDaftar(j.kolom ?? []);
      setSumber(j.sumber ?? []);
    } finally { setMuat(false); }
  }
  useEffect(() => { segarkan(); }, []);

  const cocok = useMemo(() => {
    const c = cari.trim().toLowerCase();
    if (!c) return daftar;
    return daftar.filter((k) =>
      [k.kolom, k.label, k.kelompok ?? "", k.field_api ?? ""]
        .join(" ").toLowerCase().includes(c));
  }, [daftar, cari]);

  // Halaman dikembalikan ke awal tiap kali penyaringan berubah; tanpa itu
  // pencarian yang menyisakan 3 baris sementara halaman masih di 5 akan
  // menampilkan tabel kosong dan terlihat seperti tidak ada hasil.
  useEffect(() => { setHal(0); }, [cari]);

  const halTotal = Math.max(1, Math.ceil(cocok.length / PER_HAL));
  const halAman = Math.min(hal, halTotal - 1);
  const tampil = cocok.slice(halAman * PER_HAL, halAman * PER_HAL + PER_HAL);
  const ditarikJml = daftar.filter((k) => k.ditarik && !k.turunan).length;

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
          <h2>CRUD Kolom API</h2>
          <p>
            Menentukan kolom mana yang <b>diambil</b> saat cron menarik data dari API,
            dan mana yang <b>ditawarkan</b> saat menyusun rumus indikator.
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
                <Pilih nilai={sunting.sumber} cari={sumber.length > 7}
                       onPilih={(v) => setSunting({ ...sunting, sumber: v })}
                       opsi={sumber.map((s) => ({
                         nilai: s.kode, label: s.nama,
                         ket: s.jenis === "utama" ? "tabel utama" : `digabung lewat nomor kontrak · ${s.tabel}`,
                       }))} />
              ) : (
                <input value={sumber.find((s) => s.kode === sunting.sumber)?.nama ?? sunting.sumber}
                       disabled />
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
            <label className="ind-cek">
              <input type="checkbox" checked={sunting.ditarik} disabled={sunting.turunan}
                     onChange={(e) => setSunting({ ...sunting, ditarik: e.target.checked })} />
              Ditarik dari API — diambil tiap cron berjalan
            </label>
          </div>

          {sunting.bawaan && (
            <p className="muted small mt">
              Kolom inti: nama dan jenisnya dikunci, dan tidak bisa dihapus.
              Bila tidak dipakai lagi, hilangkan centang Aktif (sembunyikan dari rumus)
              atau Ditarik (berhenti diambil dari API).
            </p>
          )}
          {sunting.turunan && (
            <p className="muted small mt">
              Kolom turunan tidak pernah diambil dari API — nilainya dihitung
              sesudah data masuk, lewat menu Kolom Turunan.
            </p>
          )}
          {!sunting.ditarik && !sunting.turunan && (
            <p className="muted small mt">
              Kolom ini <b>tidak akan diisi</b> pada tarikan berikutnya. Data lama tetap
              tersimpan, tapi nilainya berhenti diperbarui.
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
              {daftar.length} kolom · {ditarikJml} ditarik dari API · {kustom} kustom
            </h3>
            <p className="muted small">
              Kolom inti dibuat bersama sistem dan tidak bisa dihapus.
              Hanya kolom bertanda &quot;Ditarik: ya&quot; yang diambil saat cron berjalan.
            </p>
          </div>
          <KotakCari nilai={cari} onUbah={setCari} placeholder="Cari kolom…" />
        </div>

        <table>
          <thead>
            <tr>
              <th>Kolom</th><th>Sumber</th><th>Field API</th><th>Jenis</th>
              <th>Ditarik</th><th className="r">Dipakai</th><th></th>
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
                <td className={k.sumber === "api" ? "faint" : ""}>
                  {sumber.find((s) => s.kode === k.sumber)?.nama ?? k.sumber}
                </td>
                <td className={k.field_api ? "num" : "faint"}>{k.field_api ?? "—"}</td>
                <td>
                  {k.jenis}
                  {k.agregat && <span className="faint"> · dapat dijumlah</span>}
                </td>
                <td>
                  {k.turunan
                    ? <span className="faint">olahan</span>
                    : k.ditarik
                    ? <span className="tag-ok">ya</span>
                    : <span className="tag-warn">tidak</span>}
                </td>
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

        {cocok.length > PER_HAL && (
          <div className="paging">
            <button className="btn ghost sm" disabled={halAman === 0}
                    onClick={() => setHal(halAman - 1)}>← Sebelumnya</button>
            <span className="faint small">
              Halaman {halAman + 1} dari {halTotal} · {cocok.length} kolom
            </span>
            <button className="btn ghost sm" disabled={halAman >= halTotal - 1}
                    onClick={() => setHal(halAman + 1)}>Berikutnya →</button>
          </div>
        )}
      </section>
    </>
  );
}
