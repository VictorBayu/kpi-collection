"use client";

import { useEffect, useState, useCallback } from "react";

type Tiket = {
  id: string; nomor: string; kategori: string; periode: string | null;
  judul: string; status: string; prioritas: string; hasil: string | null;
  created_at: string; updated_at: string;
  pemohon: string; pemohon_nik: string; petugas: string | null; pesan: number;
};
type Pesan = { peran: "karyawan" | "admin"; pesan: string; created_at: string; nama: string };

const LABEL: Record<string, string> = {
  baru: "Menunggu", diproses: "Diproses", butuh_info: "Butuh info",
  selesai: "Selesai", ditolak: "Ditolak",
};
const KELAS: Record<string, string> = {
  baru: "c-baru", diproses: "c-proses", butuh_info: "c-info",
  selesai: "c-selesai", ditolak: "c-tolak",
};

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

  useEffect(() => {
    if (!pilih) { setDetail(null); return; }
    fetch(`/api/request/${pilih}`).then((r) => r.json()).then(setDetail);
  }, [pilih]);

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
      if (pilih) setDetail(await fetch(`/api/request/${pilih}`).then((r) => r.json()));
      return d;
    } catch (e: any) {
      setGalat(e.message);
      return null;
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>{admin ? "Kelola request" : "Request saya"}</h2>
          <p>
            {admin
              ? `${stat.baru} tiket menunggu jawaban. Tiket yang belum disentuh muncul paling atas.`
              : "Ajukan koreksi kalau ada angka yang tidak sesuai catatan Anda. Rata-rata dijawab dalam 2 hari kerja."}
          </p>
        </div>
        {!admin && (
          <button className="btn" onClick={() => setBukaForm(!bukaForm)}>
            {bukaForm ? "Tutup formulir" : "+ Ajukan koreksi"}
          </button>
        )}
      </div>

      {galat && <div className="banner warn" role="alert"><b>Belum bisa dilanjutkan</b>{galat}</div>}

      {bukaForm && !admin && (
        <FormBaru kategori={kategori} periodeTersedia={periodeTersedia} sibuk={sibuk}
                  onKirim={async (body) => {
                    const d = await kirim("/api/request", body);
                    if (d) { setBukaForm(false); setPilih(d.id); }
                  }} />
      )}

      <div className="filterbar">
        {[["", `Semua · ${stat.total}`], ["baru", `Menunggu · ${stat.baru}`],
          ["diproses", "Diproses"], ["selesai", `Selesai · ${stat.selesai}`]].map(([v, t]) => (
          <button key={v} aria-pressed={saring === v} onClick={() => setSaring(v)}>{t}</button>
        ))}
        {admin && (
          <input className="cari" placeholder="Cari nomor tiket, nama, atau NIK"
                 value={cari} onChange={(e) => setCari(e.target.value)} />
        )}
      </div>

      <div className="split">
        <div className="tickets">
          {list.map((t) => (
            <button key={t.id} className="ticket" aria-selected={pilih === t.id}
                    onClick={() => setPilih(t.id)}>
              <div className="rowbetween">
                <span className="id">{t.nomor}</span>
                <span className={`chip ${KELAS[t.status]}`}>{LABEL[t.status]}</span>
              </div>
              <b className="judul">{t.judul}</b>
              <div className="faint">
                {admin ? `${t.pemohon} · ${t.pemohon_nik}` : t.kategori} ·{" "}
                {new Date(t.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </div>
            </button>
          ))}
          {!list.length && (
            <p className="empty">
              {saring || cari
                ? "Tidak ada tiket yang cocok dengan penyaringan ini."
                : admin ? "Belum ada tiket masuk." : "Belum ada request. Mulai dari tombol Ajukan koreksi."}
            </p>
          )}
        </div>

        <div className="card card-pad">
          {!detail
            ? <p className="empty">Pilih satu tiket di sebelah kiri untuk melihat percakapannya.</p>
            : <Detail d={detail} admin={admin} sibuk={sibuk} kirim={kirim} />}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- detail */

function Detail({ d, admin, sibuk, kirim }: any) {
  const t = d.tiket;
  const tertutup = ["selesai", "ditolak"].includes(t.status);
  const [balasan, setBalasan] = useState("");
  const [hasil, setHasil] = useState(t.hasil ?? "");
  const [status, setStatus] = useState(t.status);

  return (
    <>
      <div className="rowbetween start">
        <div>
          <span className="id">{t.nomor} · {t.kategori}</span>
          <h3>{t.judul}</h3>
          <p className="faint">
            {admin ? `${t.pemohon} (${t.pemohon_nik}) · ` : ""}
            Diajukan {new Date(t.created_at).toLocaleString("id-ID")}
            {t.petugas ? ` · ditangani ${t.petugas}` : ""}
          </p>
        </div>
        <span className={`chip ${KELAS[t.status]}`}>{LABEL[t.status]}</span>
      </div>

      {t.hasil && (
        <div className="resultbox">
          <b>Hasil tindak lanjut</b>
          {t.hasil}
        </div>
      )}

      <span className="eyebrow">Percakapan</span>
      <div className="thread">
        {d.pesan.map((m: Pesan, i: number) => {
          const saya = admin ? m.peran === "admin" : m.peran === "karyawan";
          return (
            <div key={i} className={saya ? "msgwrap me" : "msgwrap"}>
              <div className={saya ? "msg me" : "msg them"}>{m.pesan}</div>
              <span className="msgmeta">
                {m.nama} · {new Date(m.created_at).toLocaleString("id-ID",
                  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>

      {tertutup ? (
        <p className="faint mt">
          Tiket ini sudah ditutup. Ajukan tiket baru kalau masih ada selisih.
        </p>
      ) : (
        <>
          <div className="replybox">
            <input value={balasan} placeholder="Tulis balasan..."
                   onChange={(e) => setBalasan(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter" && balasan.trim()) {
                       kirim(`/api/request/${t.id}`, { pesan: balasan }); setBalasan("");
                     }
                   }} />
            <button className="btn" disabled={sibuk || !balasan.trim()}
                    onClick={() => { kirim(`/api/request/${t.id}`, { pesan: balasan }); setBalasan(""); }}>
              Kirim
            </button>
          </div>

          {admin ? (
            <div className="closebox">
              <label className="field">
                <span>Hasil tindak lanjut — bagian ini dibaca pemohon</span>
                <textarea rows={3} value={hasil} onChange={(e) => setHasil(e.target.value)}
                          placeholder="Contoh: Setoran Rp 42.500.000 atas kontrak MTG-88213 sudah masuk batch Agustus." />
              </label>
              <div className="actions">
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn" disabled={sibuk}
                        onClick={() => kirim(`/api/request/${t.id}`, { status, hasil }, "PATCH")}>
                  Simpan perubahan
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
    </>
  );
}

/* -------------------------------------------------------- form baru */

function FormBaru({ kategori, periodeTersedia, sibuk, onKirim }: any) {
  const [f, setF] = useState({
    kategori: kategori[0] ?? "", periode: periodeTersedia[0] ?? "",
    judul: "", deskripsi: "", prioritas: "normal", lampiran: "",
  });
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <div className="card card-pad mb">
      <h3>Ajukan koreksi data</h3>
      <div className="rowgap mt">
        <label className="field grow">
          <span>Kategori</span>
          <select value={f.kategori} onChange={(e) => set("kategori", e.target.value)}>
            {kategori.map((k: string) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Periode data</span>
          <select value={f.periode} onChange={(e) => set("periode", e.target.value)}>
            {periodeTersedia.map((p: string) => (
              <option key={p} value={p}>
                {new Date(p).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field mb">
        <span>Apa yang keliru?</span>
        <input value={f.judul} maxLength={120} onChange={(e) => set("judul", e.target.value)}
               placeholder="Contoh: Pencapaian bucket 30 kurang Rp 42 juta" />
      </label>

      <label className="field mb">
        <span>Jelaskan detailnya</span>
        <textarea rows={4} value={f.deskripsi} onChange={(e) => set("deskripsi", e.target.value)}
                  placeholder="Sebutkan nomor kontrak atau nama debitur, tanggal setoran, dan angka yang menurut Anda benar." />
        <small className="faint">Semakin spesifik, semakin cepat tim data menemukan barisnya.</small>
      </label>

      <label className="field mb">
        <span>Tautan lampiran (opsional)</span>
        <input type="url" value={f.lampiran} onChange={(e) => set("lampiran", e.target.value)}
               placeholder="https://drive.google.com/..." />
      </label>

      <button className="btn" disabled={sibuk} onClick={() => onKirim(f)}>
        {sibuk ? "Mengirim..." : "Kirim koreksi"}
      </button>
    </div>
  );
}
