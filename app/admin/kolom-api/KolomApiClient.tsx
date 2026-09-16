"use client";

import { useEffect, useMemo, useState } from "react";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman, { TitikStatus } from "@/components/JudulHalaman";

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

  // Esc menutup formulir — kebiasaan yang diharapkan dari sebuah modal.
  useEffect(() => {
    if (!sunting) return;
    const tutup = (e: KeyboardEvent) => { if (e.key === "Escape" && !sibuk) setSunting(null); };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [sunting, sibuk]);

  const nonaktif = daftar.filter((k) => !k.aktif).length;
  const olahan = daftar.filter((k) => k.turunan).length;
  const pesanOk = !!pesan && /dihapus|Tersimpan|dibuat/.test(pesan);

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<><TitikStatus nada={muat ? "netral" : "good"} /> {daftar.length} kolom terdaftar</>}
        judul="CRUD Kolom API"
        deskripsi={<>Menentukan kolom mana yang <b>diambil</b> saat cron menarik data dari API,
          dan mana yang <b>ditawarkan</b> saat menyusun rumus indikator.</>}
        aksi={
          <button className="btn" onClick={() => { setPesan(null); setSunting({ ...KOSONG, baru: true }); }}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah kolom
          </button>
        }
      />

      {pesan && !sunting && (
        <div className={"alert-box ka-pesan " + (pesanOk ? "good" : "bad")} role="status">
          <span className="alert-ikon">{pesanOk ? "✓" : "!"}</span>
          <span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <section className="card pa-tabel-kartu">
        <div className="pa-alat ka-alat">
          <div className="ka-ringkas">
            <div className="ka-hitung">
              <b className="num">{daftar.length}</b> kolom
              <span className="ka-lencana good"><i />{ditarikJml} ditarik dari API</span>
              <span className="ka-lencana accent"><i />{kustom} kustom</span>
              {olahan > 0 && <span className="ka-lencana info"><i />{olahan} olahan</span>}
              {nonaktif > 0 && <span className="ka-lencana netral"><i />{nonaktif} nonaktif</span>}
            </div>
            <p className="pa-sub">
              Kolom inti dibuat bersama sistem dan tidak bisa dihapus. Hanya kolom bertanda
              “Ditarik: ya” yang diambil saat cron berjalan.
            </p>
          </div>
          <div className="ka-cari">
            <KotakCari nilai={cari} onUbah={setCari} lebar={320} placeholder="Cari kolom, label, atau field API…" />
          </div>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel ka-tabel">
            <thead>
              <tr>
                <th>Kolom</th><th>Sumber</th><th>Field API</th><th>Jenis</th>
                <th>Ditarik</th><th className="r">Dipakai</th><th className="r">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((k) => {
                const sb = sumber.find((s) => s.kode === k.sumber);
                return (
                  <tr key={k.kolom} className={k.aktif ? "" : "mati"}>
                    <td>
                      <div className="ka-label">
                        {k.label}
                        {!k.bawaan && <span className="rk-tag ka-kustom">kustom</span>}
                        {!k.aktif && <span className="rk-tag ka-mati">nonaktif</span>}
                      </div>
                      <div className="pa-sub num">{k.kolom}</div>
                    </td>
                    <td>
                      <span className="ka-sumber">{sb?.nama ?? k.sumber}</span>
                      {sb?.jenis === "utama" && <span className="faint small"> (utama)</span>}
                    </td>
                    <td>{k.field_api ? <code className="ka-field">{k.field_api}</code> : <span className="faint">—</span>}</td>
                    <td>
                      <span className={"ka-jenis " + k.jenis}>{k.jenis}</span>
                      {k.agregat && <span className="faint small"> · dapat dijumlah</span>}
                    </td>
                    <td>
                      {k.turunan
                        ? <span className="ri-status netral">olahan</span>
                        : k.ditarik
                        ? <span className="pa-status good">ya</span>
                        : <span className="pa-status warn">tidak</span>}
                    </td>
                    <td className="r">
                      {k.dipakai ? <span className="ka-dipakai num">{k.dipakai}</span> : <span className="faint num">0</span>}
                    </td>
                    <td className="r">
                      <button className="btn ghost sm" onClick={() => { setPesan(null); setSunting({ ...k, baru: false }); }}>
                        <Ikon nama="pencil" ukuran={14} /> Ubah
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!tampil.length && (
                <tr><td colSpan={7} className="empty">
                  {muat ? "Memuat…" : "Tidak ada kolom yang cocok."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pa-pager">
          <span className="faint">
            {cocok.length
              ? <>Halaman <b>{halAman + 1}</b> dari <b>{halTotal}</b> <span className="sd-sep">|</span> total <b>{cocok.length}</b> kolom</>
              : "Tidak ada data"}
          </span>
          {halTotal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={halAman === 0} onClick={() => setHal(halAman - 1)}>← Sebelumnya</button>
              <button className="btn ghost sm" disabled={halAman >= halTotal - 1} onClick={() => setHal(halAman + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>

      {sunting && (
        <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget && !sibuk) setSunting(null); }}>
          <div className="modal ka-modal" role="dialog" aria-modal="true" aria-labelledby="ka-judul">
            <div className="modal-kepala">
              <span className="sd-ikon accent"><Ikon nama={sunting.baru ? "columns" : "pencil"} ukuran={20} /></span>
              <div className="modal-judul">
                <h2 id="ka-judul">
                  {sunting.baru ? "Kolom baru" : sunting.label}
                  {!sunting.baru && sunting.bawaan && <span className="rk-tag ka-inti">kolom inti</span>}
                  {!sunting.baru && sunting.turunan && <span className="rk-tag ka-olahan">olahan</span>}
                </h2>
                <p>{sunting.baru
                  ? "Kolom baru mulai terisi pada tarikan API berikutnya, bukan seketika."
                  : <>Mengubah pengaturan <code className="ka-field">{sunting.kolom}</code></>}</p>
              </div>
              <button className="pa-tutup" onClick={() => setSunting(null)} disabled={sibuk} aria-label="Tutup">×</button>
            </div>

            <div className="modal-isi">
              {pesan && (
                <div className="alert-box bad"><span className="alert-ikon">!</span><span>{pesan}</span></div>
              )}

              <div className="pa-form-grid">
                <label className="field">
                  <span>Nama kolom</span>
                  <input value={sunting.kolom} disabled={!sunting.baru} className="num"
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
                  <input value={sunting.field_api ?? ""} placeholder="ContractPrepaid" className="num"
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
                    <input value={sumber.find((s) => s.kode === sunting.sumber)?.nama ?? sunting.sumber} disabled />
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
                <div className="ka-dua">
                  <label className="field">
                    <span>Kelompok</span>
                    <input value={sunting.kelompok ?? ""} placeholder="Nilai"
                           onChange={(e) => setSunting({ ...sunting, kelompok: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Urutan</span>
                    <input type="number" value={sunting.urutan} className="num"
                           onChange={(e) => setSunting({ ...sunting, urutan: Number(e.target.value) || 0 })} />
                  </label>
                </div>
              </div>

              <label className="field">
                <span>Keterangan (opsional)</span>
                <input value={sunting.keterangan ?? ""} placeholder="Dipakai untuk perhitungan prepaid"
                       onChange={(e) => setSunting({ ...sunting, keterangan: e.target.value })} />
              </label>

              <div className="ka-opsi">
                <label className={"ka-opsi-item" + (sunting.agregat ? " on" : "")}>
                  <input type="checkbox" checked={sunting.agregat}
                         onChange={(e) => setSunting({ ...sunting, agregat: e.target.checked })} />
                  <span><b>Boleh dijumlahkan</b><small>Bisa dipakai sebagai SUM/AVG di rumus</small></span>
                </label>
                <label className={"ka-opsi-item" + (sunting.aktif ? " on" : "")}>
                  <input type="checkbox" checked={sunting.aktif}
                         onChange={(e) => setSunting({ ...sunting, aktif: e.target.checked })} />
                  <span><b>Aktif</b><small>Muncul saat menyusun rumus</small></span>
                </label>
                <label className={"ka-opsi-item" + (sunting.ditarik && !sunting.turunan ? " on" : "") + (sunting.turunan ? " kunci" : "")}>
                  <input type="checkbox" checked={sunting.ditarik} disabled={sunting.turunan}
                         onChange={(e) => setSunting({ ...sunting, ditarik: e.target.checked })} />
                  <span><b>Ditarik dari API</b><small>Diambil tiap cron berjalan</small></span>
                </label>
              </div>

              {sunting.bawaan && (
                <div className="alert-box info"><span className="alert-ikon">i</span><span>
                  Kolom inti: nama dan jenisnya dikunci, dan tidak bisa dihapus. Bila tidak dipakai lagi,
                  hilangkan centang Aktif (sembunyikan dari rumus) atau Ditarik (berhenti diambil dari API).
                </span></div>
              )}
              {sunting.turunan && (
                <div className="alert-box info"><span className="alert-ikon">i</span><span>
                  Kolom turunan tidak pernah diambil dari API — nilainya dihitung sesudah data masuk, lewat menu Kolom Turunan.
                </span></div>
              )}
              {!sunting.ditarik && !sunting.turunan && (
                <div className="alert-box warn"><span className="alert-ikon">!</span><span>
                  Kolom ini <b>tidak akan diisi</b> pada tarikan berikutnya. Data lama tetap tersimpan, tapi nilainya berhenti diperbarui.
                </span></div>
              )}
              {sunting.jenis === "angka" && !sunting.agregat && (
                <div className="alert-box warn"><span className="alert-ikon">!</span><span>
                  Kolom angka biasanya perlu dicentang “boleh dijumlahkan” agar bisa dipilih sebagai sumber SUM di rumus.
                </span></div>
              )}
            </div>

            <div className="modal-kaki ka-kaki">
              {!sunting.baru && !sunting.bawaan && (
                <button className="btn danger" disabled={sibuk}
                        onClick={() => { if (confirm(`Hapus kolom "${sunting.label}"? Datanya ikut hilang.`)) hapus(sunting); }}>
                  <Ikon nama="trash" ukuran={15} /> Hapus kolom
                </button>
              )}
              <span className="ka-spasi" />
              <button className="btn ghost" disabled={sibuk} onClick={() => { setSunting(null); setPesan(null); }}>Batal</button>
              <button className="btn" disabled={sibuk} onClick={simpan}>
                <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
