"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import KotakCari from "@/components/KotakCari";
import UnggahGambar, { type Lampiran } from "@/components/UnggahGambar";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";

type Tiket = {
  id: string; nomor: string; kategori: string; periode: string | null;
  judul: string; status: string; prioritas: string; hasil: string | null;
  created_at: string; updated_at: string;
  pemohon: string; pemohon_nik: string; petugas: string | null; pesan: number;
  belum_dibaca?: boolean;
};
type Pesan = {
  peran: "karyawan" | "admin"; pesan: string; created_at: string; nama: string;
  lampiran_url?: string | null; lampiran_nama?: string | null;
};

const LABEL: Record<string, string> = {
  baru: "Menunggu", diproses: "Diproses", butuh_info: "Butuh info",
  selesai: "Selesai", ditolak: "Ditolak",
};
const KELAS: Record<string, string> = {
  baru: "c-baru", diproses: "c-proses", butuh_info: "c-info",
  selesai: "c-selesai", ditolak: "c-tolak",
};
const PRIORITAS: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Mendesak" };

const inisial = (nama: string) => {
  const k = (nama ?? "").trim().split(/\s+/).filter(Boolean);
  return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : k[0]?.[1] ?? "")).toUpperCase() || "?";
};
const namaBulan = (p: string) =>
  new Date(p).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export default function RequestClient({
  admin, periodeTersedia,
}: { admin: boolean; periodeTersedia: string[] }) {
  const [list, setList] = useState<Tiket[]>([]);
  const [stat, setStat] = useState({ total: 0, baru: 0, proses: 0, selesai: 0 });
  const [kategori, setKategori] = useState<string[]>([]);
  const [saring, setSaring] = useState("");
  const [cari, setCari] = useState("");
  const [pilih, setPilih] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ tiket: any; pesan: Pesan[] } | null>(null);
  const [bukaForm, setBukaForm] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [terkirim, setTerkirim] = useState<{ id: string; nomor: string; kategori: string; prioritas: string; periode: string; judul: string } | null>(null);

  const muat = useCallback(async () => {
    const p = new URLSearchParams();
    if (saring) p.set("status", saring);
    if (cari) p.set("cari", cari);
    const d = await fetch(`/api/request?${p}`).then((r) => r.json());
    setList(d.list ?? []);
    setStat(d.stat ?? stat);
    setKategori(d.kategori ?? []);
  }, [saring, cari]);

  useEffect(() => { muat(); }, [muat]);

  const muatDetail = useCallback(async (id: string) => {
    try {
      const d = await fetch(`/api/request/${id}`).then((r) => r.json());
      setDetail((lama: any) => {
        // Jangan render ulang kalau tidak ada yang berubah (hemat & anti kedip)
        if (lama && JSON.stringify(lama) === JSON.stringify(d)) return lama;
        return d;
      });
    } catch {}
  }, []);

  // Buka tiket -> muat percakapan, lalu perbarui otomatis tiap 5 detik
  // selama tiket terbuka dan tab aktif — terasa seperti chat.
  useEffect(() => {
    if (!pilih) { setDetail(null); return; }
    muatDetail(pilih);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") muatDetail(pilih);
    }, 5000);
    return () => clearInterval(t);
  }, [pilih, muatDetail]);

  // Daftar tiket ikut segar tiap 15 detik (status & penanda belum dibaca)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") muat();
    }, 15000);
    return () => clearInterval(t);
  }, [muat]);

  async function kirim(url: string, body: unknown, metode = "POST") {
    setGalat(null);
    setSibuk(true);
    try {
      const res = await fetch(url, {
        method: metode, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await muat();
      if (pilih) await muatDetail(pilih);
      return d;
    } catch (e: any) {
      setGalat(e.message);
      return null;
    } finally {
      setSibuk(false);
    }
  }


  /** Kirim balasan dengan tampilan seketika (optimistik), lalu sinkron ke server. */
  async function kirimPesan(id: string, teks: string, lampiran?: Lampiran) {
    const bersih = teks.trim();
    if (!bersih) return;
    setDetail((d: any) => d ? {
      ...d,
      pesan: [...d.pesan, {
        peran: admin ? "admin" : "karyawan", pesan: bersih,
        created_at: new Date().toISOString(), nama: "Anda",
        lampiran_url: lampiran?.url ?? null,
        lampiran_nama: lampiran?.nama ?? null,
      }],
    } : d);
    await kirim(`/api/request/${id}`, {
      pesan: bersih,
      lampiran: lampiran?.url ?? null,
      lampiran_nama: lampiran?.nama ?? null,
    });
  }

  const STAT = [
    { v: "", label: "Total tiket", nilai: stat.total, catatan: admin ? "Semua tiket tercatat" : "Semua request Anda", ikon: "inbox", nada: "netral" },
    { v: "baru", label: "Menunggu respon", nilai: stat.baru, catatan: "Belum disentuh tim data", ikon: "clock", nada: "warn" },
    { v: "diproses", label: "Sedang diproses", nilai: stat.proses, catatan: "Termasuk yang butuh info", ikon: "refresh", nada: "accent" },
    { v: "selesai", label: "Selesai", nilai: stat.selesai, catatan: "Sudah ditindaklanjuti", ikon: "checkCircle", nada: "good" },
  ] as const;

  return (
    <>
      <JudulHalaman
        eyebrow={admin ? "Layanan bantuan" : "Request & koreksi"}
        meta={stat.baru ? <><i className="titik-status warn" aria-hidden /> {stat.baru} tiket menunggu jawaban</> : "Tidak ada tiket yang menunggu"}
        judul={admin ? "Supporting & Helpdesk Tiket" : "Request saya"}
        deskripsi={admin
          ? "Pusat penanganan kendala sistem dan permohonan koreksi data KPI. Tiket yang belum disentuh muncul paling atas."
          : "Ajukan koreksi kalau ada angka yang tidak sesuai catatan Anda. Rata-rata dijawab dalam 2 hari kerja."}
        aksi={!admin && (
          <button className="btn" onClick={() => { setGalat(null); setBukaForm(true); }}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Buat tiket baru
          </button>
        )}
      />

      <div className="pa-stat-grid">
        {STAT.map((k) => (
          <button key={k.v || "semua"} type="button" aria-pressed={saring === k.v}
                  className={"pa-stat rq-stat " + k.nada + (saring === k.v ? " on" : "")}
                  onClick={() => setSaring(k.v)}>
            <span className="pa-stat-isi">
              <span className="km-label">{k.label}</span>
              <span className="km-nilai"><b className="num">{k.nilai}</b><span className="km-satuan">tiket</span></span>
              <span className="km-catatan">{k.catatan}</span>
            </span>
            <span className={"km-ikon " + k.nada}><Ikon nama={k.ikon} ukuran={20} /></span>
          </button>
        ))}
      </div>

      {galat && !bukaForm && (
        <div className="alert-box bad mb" role="alert">
          <span className="alert-ikon" aria-hidden>✕</span>
          <span><b>Belum bisa dilanjutkan.</b> {galat}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setGalat(null)}>×</button>
        </div>
      )}

      {bukaForm && !admin && (
        <FormBaru kategori={kategori} periodeTersedia={periodeTersedia} sibuk={sibuk} galat={galat}
                  onTutup={() => { setBukaForm(false); setGalat(null); }}
                  onKirim={async (body: any) => {
                    const d = await kirim("/api/request", body);
                    if (d) {
                      setBukaForm(false);
                      setTerkirim({ id: d.id, nomor: d.nomor, kategori: body.kategori,
                                    prioritas: body.prioritas, periode: body.periode, judul: body.judul });
                    }
                  }} />
      )}

      {terkirim && (
        <TiketTerkirim t={terkirim}
                       onLihat={() => { setPilih(terkirim.id); setTerkirim(null); }}
                       onTutup={() => setTerkirim(null)} />
      )}

      <div className="rq-split">
        <section className="card rq-daftar">
          <div className="rq-daftar-alat">
            <div className="rq-pil" role="tablist" aria-label="Saring status">
              {[["", "Semua", stat.total], ["baru", "Menunggu", stat.baru],
                ["diproses", "Diproses", stat.proses], ["selesai", "Selesai", stat.selesai]].map(([v, t, n]) => (
                <button key={String(v)} role="tab" aria-selected={saring === v}
                        className={saring === v ? "on" : ""} onClick={() => setSaring(String(v))}>
                  {t} <span className="num">· {n}</span>
                </button>
              ))}
            </div>
            {admin && (
              <KotakCari nilai={cari} onUbah={setCari} lebar={600}
                         placeholder="Cari nomor tiket, nama pelapor, atau NIK…" />
            )}
          </div>

          <div className="rq-tiket-list">
            {list.map((t) => (
              <button key={t.id}
                      className={"rq-tiket" + (t.belum_dibaca ? " unread" : "") + (pilih === t.id ? " on" : "")}
                      aria-selected={pilih === t.id}
                      onClick={() => {
                        setPilih(t.id);
                        // tandai terbaca secara lokal seketika (server ikut menandai saat detail dibuka)
                        setList((ls) => ls.map((x) => x.id === t.id ? { ...x, belum_dibaca: false } : x));
                      }}>
                <span className="rq-tiket-atas">
                  <span className="rq-nomor num">
                    {t.belum_dibaca && <i className="rq-titik" aria-label="ada pembaruan" />}
                    {t.nomor}
                  </span>
                  <span className={`rq-status ${KELAS[t.status]}`}>{LABEL[t.status]}</span>
                </span>
                <b className="rq-judul">{t.judul}</b>
                {admin && (
                  <span className="rq-pemohon">
                    <b>{t.pemohon}</b> <span className="num">· {t.pemohon_nik}</span>
                  </span>
                )}
                <span className="rq-tiket-bawah">
                  <span className="rq-kat">{t.kategori}</span>
                  {t.prioritas === "tinggi" && <span className="rq-prio tinggi">Mendesak</span>}
                  <span className="rq-waktu">
                    {new Date(t.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
              </button>
            ))}
            {!list.length && (
              <div className="rq-kosong">
                <Ikon nama="inbox" ukuran={26} />
                <span>
                  {saring || cari
                    ? "Tidak ada tiket yang cocok dengan penyaringan ini."
                    : admin ? "Belum ada tiket masuk." : "Belum ada request. Mulai dari tombol Buat tiket baru."}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="card rq-detail">
          {!detail
            ? (
              <div className="rq-kosong besar">
                <Ikon nama="message" ukuran={30} />
                <b>Pilih tiket</b>
                <span>Pilih satu tiket di sebelah kiri untuk melihat percakapan dan tindak lanjutnya.</span>
              </div>
            )
            : <Detail d={detail} admin={admin} sibuk={sibuk} kirim={kirim} kirimPesan={kirimPesan} />}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- detail */

function Detail({ d, admin, sibuk, kirim, kirimPesan }: any) {
  const t = d.tiket;
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Selalu gulir ke pesan terbaru saat percakapan bertambah
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [d.pesan.length]);
  const tertutup = ["selesai", "ditolak"].includes(t.status);
  const [balasan, setBalasan] = useState("");
  const [lampiran, setLampiran] = useState<Lampiran>(null);
  const [naik, setNaik] = useState(false);
  const [hasil, setHasil] = useState(t.hasil ?? "");
  const [status, setStatus] = useState(t.status);

  const lawan = admin ? t.pemohon : "tim data";
  const bisaKirim = !sibuk && !naik && !!balasan.trim();
  const kirimSekarang = () => {
    if (!bisaKirim) return;
    kirimPesan(t.id, balasan, lampiran);
    setBalasan(""); setLampiran(null);
  };

  return (
    <>
      <div className="rq-d-kepala">
        <div className="rq-d-atas">
          <span className="rq-nomor-chip num">{t.nomor}</span>
          <span className="rq-d-kat">Kategori: <b>{t.kategori}</b></span>
          <span className={`rq-status besar ${KELAS[t.status]}`}>{LABEL[t.status]}</span>
        </div>
        <h2>{t.judul}</h2>
        <div className="rq-d-meta">
          {admin && <span><b>{t.pemohon}</b> <span className="num">(NIK {t.pemohon_nik})</span></span>}
          <span>Diajukan {new Date(t.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
          {t.periode && <span>Periode {namaBulan(t.periode)}</span>}
          {t.prioritas && <span className={"rq-prio " + t.prioritas}>Prioritas {PRIORITAS[t.prioritas] ?? t.prioritas}</span>}
          <span className="rq-petugas">Ditangani oleh: <b>{t.petugas ?? "belum ada petugas"}</b></span>
        </div>
      </div>

      <div className="rq-d-isi">
        {t.status === "selesai" && !admin && (
          <div className="alert-box good">
            <span className="alert-ikon" aria-hidden>✓</span>
            <span><b>Request Anda sudah selesai ditindaklanjuti.</b> Baca hasilnya di bawah. Kalau angka masih belum sesuai, ajukan tiket baru.</span>
          </div>
        )}

        {t.hasil && (
          <div className="rq-hasil">
            <span className="km-ikon good"><Ikon nama="checkCircle" ukuran={18} /></span>
            <div>
              <span className="rq-hasil-lbl">Hasil tindak lanjut terkini</span>
              <p>{t.hasil}</p>
            </div>
          </div>
        )}

        <div className="rq-percakapan-kepala">
          <span className="km-label">Percakapan &amp; aktivitas tiket</span>
          <span className="faint small"><i className="titik-status good" aria-hidden /> Diperbarui otomatis</span>
        </div>
        <div className="rq-thread" ref={threadRef}>
          {d.pesan.map((m: Pesan, i: number) => {
            const saya = admin ? m.peran === "admin" : m.peran === "karyawan";
            return (
              <div key={i} className={"rq-msg" + (saya ? " saya" : "")}>
                <span className={"rq-avatar" + (m.peran === "admin" ? " admin" : "")} aria-hidden>{inisial(m.nama)}</span>
                <div className="rq-msg-isi">
                  <span className="rq-msg-meta">
                    <b>{m.nama}</b>
                    {m.peran === "admin" && <span className="rq-staf">Staf</span>}
                    <span>{new Date(m.created_at).toLocaleString("id-ID",
                      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <div className="rq-bubble">
                    {m.pesan}
                    {m.lampiran_url && (
                      <a className="msg-lampiran" href={m.lampiran_url}
                         target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.lampiran_url} alt={m.lampiran_nama ?? "Lampiran"} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {tertutup ? (
          <p className="rq-tutup-info">
            <Ikon nama="lock" ukuran={15} /> Tiket ini sudah ditutup. Ajukan tiket baru kalau masih ada selisih.
          </p>
        ) : (
          <>
            <div className="rq-balas">
              <input value={balasan} placeholder={`Tulis balasan untuk ${lawan}…`}
                     aria-label="Tulis balasan"
                     onChange={(e) => setBalasan(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") kirimSekarang(); }} />
              <button className="btn" disabled={!bisaKirim} onClick={kirimSekarang}>
                <Ikon nama="send" ukuran={16} /> Kirim
              </button>
            </div>
            <UnggahGambar nilai={lampiran} onUbah={setLampiran} sibuk={sibuk} onSibukUnggah={setNaik} />

            {admin ? (
              <div className="rq-admin">
                <div className="rq-admin-kepala">
                  <div>
                    <h3>Hasil tindak lanjut — bagian ini dibaca pemohon</h3>
                    <p className="muted small">Catatan ini tampil permanen di kartu ringkasan tiket milik pemohon.</p>
                  </div>
                  <span className="rq-staf besar">Admin output</span>
                </div>
                <textarea rows={3} value={hasil} onChange={(e) => setHasil(e.target.value)}
                          aria-label="Hasil tindak lanjut"
                          placeholder="Contoh: Setoran Rp 42.500.000 atas kontrak MTG-88213 sudah masuk batch Agustus." />
                <div className="rq-admin-aksi">
                  <label className="field">
                    <span>Perbarui status tiket</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <button className="btn" disabled={sibuk}
                          onClick={() => kirim(`/api/request/${t.id}`, { status, hasil }, "PATCH")}>
                    <Ikon nama="check" ukuran={16} tebal={2.2} /> Simpan perubahan
                  </button>
                </div>
              </div>
            ) : (
              <button className="linkdanger"
                      onClick={() => {
                        if (confirm(`Batalkan request ${t.nomor}?`))
                          kirim(`/api/request/${t.id}`, { batalkan: true }, "PATCH");
                      }}>
                Batalkan request ini
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------- form baru */

const MAKS_DESKRIPSI = 1000;

function FormBaru({ kategori, periodeTersedia, sibuk, galat, onKirim, onTutup }: any) {
  const [f, setF] = useState({
    kategori: kategori[0] ?? "", periode: periodeTersedia[0] ?? "",
    judul: "", deskripsi: "", prioritas: "normal", lampiran: "",
  });
  const [gambar, setGambar] = useState<Lampiran>(null);
  const [naik, setNaik] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  // Esc menutup modal; gulir halaman di belakangnya dikunci selama terbuka.
  // Nilai terbaru dibaca lewat ref supaya efeknya cukup dipasang sekali —
  // memasang ulang tiap render akan menyimpan "hidden" sebagai nilai asal
  // dan halaman tetap terkunci setelah modal ditutup.
  const tutupRef = useRef(onTutup);
  const naikRef = useRef(naik);
  tutupRef.current = onTutup;
  naikRef.current = naik;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !naikRef.current) tutupRef.current(); };
    document.addEventListener("keydown", esc);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = lama; };
  }, []);

  return (
    <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget && !naik) onTutup(); }}>
      <div className="modal rq-modal" role="dialog" aria-modal="true" aria-labelledby="judul-tiket-baru">
        <div className="modal-kepala">
          <span className="sd-ikon accent"><Ikon nama="ticket" ukuran={20} /></span>
          <div className="modal-judul">
            <h2 id="judul-tiket-baru">Buat tiket dukungan baru <span className="rq-staf besar">Helpdesk</span></h2>
            <p>Laporkan angka yang tidak sesuai, data yang tidak muncul, atau kendala akses aplikasi.</p>
          </div>
          <button type="button" className="pa-tutup" aria-label="Tutup dialog" disabled={naik} onClick={onTutup}>×</button>
        </div>

        <div className="modal-isi">
          {galat && (
            <div className="alert-box bad" role="alert">
              <span className="alert-ikon" aria-hidden>✕</span>
              <span><b>Belum bisa dikirim.</b> {galat}</span>
            </div>
          )}

          <div className="rq-form-grid">
            <label className="field">
              <span>Kategori permohonan *</span>
              <select value={f.kategori} onChange={(e) => set("kategori", e.target.value)}>
                {kategori.map((k: string) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <div className="field">
              <span>Tingkat prioritas *</span>
              <div className="wz-segmen rq-prio-segmen" role="radiogroup" aria-label="Tingkat prioritas">
                {Object.entries(PRIORITAS).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={f.prioritas === v}
                          className={(f.prioritas === v ? "on " : "") + v} onClick={() => set("prioritas", v)}>{l}</button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Periode data *</span>
              <select value={f.periode} onChange={(e) => set("periode", e.target.value)}>
                {periodeTersedia.map((p: string) => (
                  <option key={p} value={p}>{namaBulan(p)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Judul / subjek kendala *</span>
            <input value={f.judul} maxLength={120} onChange={(e) => set("judul", e.target.value)}
                   placeholder="Contoh: Pencapaian bucket 30 kurang Rp 42 juta" />
          </label>

          <label className="field">
            <span className="rq-label-baris">
              <span>Deskripsi rinci permasalahan *</span>
              <em className={"num" + (f.deskripsi.length > MAKS_DESKRIPSI * 0.9 ? " hampir" : "")}>
                {f.deskripsi.length.toLocaleString("id-ID")} / {MAKS_DESKRIPSI.toLocaleString("id-ID")} karakter
              </em>
            </span>
            <textarea rows={4} value={f.deskripsi} maxLength={MAKS_DESKRIPSI}
                      onChange={(e) => set("deskripsi", e.target.value)}
                      placeholder="Sebutkan nomor kontrak atau nama debitur, tanggal setoran, dan angka yang menurut Anda benar." />
            <small className="faint">Semakin spesifik, semakin cepat tim data menemukan barisnya.</small>
          </label>

          <div className="rq-field">
            <span className="rq-field-lbl">Unggah bukti pendukung (opsional)</span>
            <UnggahGambar varian="zona" nilai={gambar} onUbah={setGambar} sibuk={sibuk} onSibukUnggah={setNaik} />
          </div>

          <label className="field">
            <span>Atau tautan lampiran (opsional)</span>
            <input type="url" value={f.lampiran} onChange={(e) => set("lampiran", e.target.value)}
                   placeholder="https://drive.google.com/..." />
          </label>

          <div className="alert-box info">
            <span className="alert-ikon" aria-hidden>i</span>
            <span>
              <b>Penanganan:</b> request rata-rata dijawab tim data dalam 2 hari kerja. Pantau
              perkembangannya di halaman ini — tiket dengan pembaruan ditandai titik biru.
            </span>
          </div>
        </div>

        <div className="modal-kaki">
          <button type="button" className="btn ghost" disabled={naik} onClick={onTutup}>Batal</button>
          <button type="button" className="btn" disabled={sibuk || naik}
                  title={naik ? "Tunggu hingga unggahan gambar selesai" : undefined}
                  onClick={() => onKirim({
                    ...f,
                    // Gambar menang atas kolom tautan bila keduanya diisi:
                    // berkas yang benar-benar diunggah lebih pasti bisa dibuka
                    // tim data daripada tautan yang mungkin butuh izin akses.
                    lampiran: gambar?.url ?? f.lampiran,
                    lampiran_nama: gambar?.nama ?? null,
                  })}>
            <Ikon nama="send" ukuran={16} />
            {naik ? "Menunggu unggahan…" : sibuk ? "Mengirim…" : "Kirim tiket sekarang"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- tiket terkirim */

function TiketTerkirim({ t, onLihat, onTutup }: {
  t: { id: string; nomor: string; kategori: string; prioritas: string; periode: string; judul: string };
  onLihat: () => void; onTutup: () => void;
}) {
  const [tersalin, setTersalin] = useState(false);

  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") tutupRef.current(); };
    document.addEventListener("keydown", esc);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = lama; };
  }, []);

  return (
    <>
      <div className="toast-atas" role="status">
        <span className="km-ikon good"><Ikon nama="check" ukuran={18} tebal={2.4} /></span>
        <div>
          <b>Tiket {t.nomor} berhasil dibuat <span className="rq-status c-baru">Menunggu</span></b>
          <span>Laporan diteruskan ke tim data.</span>
        </div>
      </div>
      <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget) onTutup(); }}>
        <div className="modal rq-sukses" role="dialog" aria-modal="true" aria-labelledby="judul-terkirim">
          <button type="button" className="pa-tutup rq-sukses-x" aria-label="Tutup dialog" onClick={onTutup}>×</button>
          <div className="rq-sukses-atas">
            <span className="rq-sukses-ikon"><Ikon nama="check" ukuran={30} tebal={2.6} /></span>
            <h2 id="judul-terkirim">Tiket berhasil diajukan! <span className="wz-lencana good">Status: diterima</span></h2>
            <p>Permohonan Anda sudah masuk antrean dan akan ditanggapi tim data.</p>
          </div>
          <div className="modal-isi">
            <div className="rq-sukses-kartu">
              <div className="rq-sukses-nomor">
                <span className="km-label">Nomor tiket</span>
                <span className="rq-nomor-chip besar num">{t.nomor}</span>
                <button type="button" className="btn ghost sm"
                        onClick={() => { navigator.clipboard?.writeText(t.nomor).then(() => setTersalin(true)).catch(() => {}); }}>
                  <Ikon nama="copy" ukuran={14} /> {tersalin ? "Tersalin" : "Salin ID"}
                </button>
              </div>
              <dl>
                <div><dt>Judul</dt><dd>{t.judul}</dd></div>
                <div><dt>Kategori kendala</dt><dd>{t.kategori}</dd></div>
                <div><dt>Tingkat prioritas</dt><dd><i className={"titik-status " + (t.prioritas === "tinggi" ? "bad" : t.prioritas === "rendah" ? "netral" : "warn")} /> {PRIORITAS[t.prioritas] ?? t.prioritas}</dd></div>
                <div><dt>Periode data</dt><dd>{t.periode ? namaBulan(t.periode) : "—"}</dd></div>
              </dl>
            </div>
            <div className="alert-box info">
              <span className="alert-ikon" aria-hidden>i</span>
              <span>Pantau perkembangan dan balasan tim data langsung di halaman Request — tiket dengan pembaruan ditandai titik biru.</span>
            </div>
          </div>
          <div className="modal-kaki">
            <button type="button" className="btn ghost" onClick={onLihat}><Ikon nama="eye" ukuran={16} /> Lihat rincian tiket</button>
            <button type="button" className="btn" onClick={onTutup}><Ikon nama="check" ukuran={16} tebal={2.2} /> Selesai &amp; tutup</button>
          </div>
        </div>
      </div>
    </>
  );
}
