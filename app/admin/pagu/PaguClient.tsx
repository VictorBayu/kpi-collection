"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";

type Pagu = {
  alias: string; produk: string; nominal: string;
  skor_minimal: string; pembagi: string; mekanisme: string;
  aktif: boolean; pemakai: number;
};

const rp = (v: number) =>
  "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });

/**
 * Master pagu insentif.
 *
 * Menjawab satu pertanyaan yang tidak bisa dijawab pembangun indikator:
 * berapa rupiah yang didapat seseorang bila skor insentifnya sekian.
 * Skornya berasal dari gabungan beberapa indikator, sedangkan nominalnya
 * melekat pada jabatan — jadi keduanya memang tempatnya berbeda.
 *
 * Baris contoh perhitungan ditampilkan langsung di bawah tiap isian,
 * karena rumus "skor ÷ pembagi × pagu" mudah disalahpahami saat hanya
 * dibaca sebagai tiga angka terpisah di dalam tabel.
 */
export default function PaguClient() {
  const [pagu, setPagu] = useState<Pagu[]>([]);
  const [produk, setProduk] = useState<{ kode: string; nama: string }[]>([]);
  const [saran, setSaran] = useState<{ alias: string; produk: string }[]>([]);
  const [semuaJabatan, setSemuaJabatan] = useState<{ alias: string }[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [baru, setBaru] = useState<Pagu | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/pagu", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    // Galat dari server sebelumnya tenggelam jadi daftar kosong tanpa
    // pesan apa pun — admin melihat "belum ada data" padahal sebenarnya
    // permintaannya gagal (mis. skema database belum sinkron).
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat data pagu."); setMuat(false); return; }
    setPagu((j.pagu ?? []).map((p: any) => ({
      ...p,
      nominal: String(p.nominal ?? 0),
      skor_minimal: String(p.skor_minimal ?? 3),
      pembagi: String(p.pembagi ?? 5),
      mekanisme: ["tier", "bersyarat"].includes(p.mekanisme) ? p.mekanisme : "pagu",
    })));
    setProduk(j.produk ?? []);
    setSaran(j.jabatan ?? []);
    setSemuaJabatan(j.semuaJabatan ?? []);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  async function simpan(p: Pagu) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/pagu", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  const terlihat = pagu.filter((p) => !cari.trim() ||
    p.alias.toLowerCase().includes(cari.trim().toLowerCase()) ||
    p.produk.toLowerCase().includes(cari.trim().toLowerCase()));

  // Pasangan yang sudah punya indikator berbobot insentif tapi belum
  // punya pagu. Tanpa pagu, skornya terhitung tapi nominalnya tidak
  // pernah terbentuk — kegagalan yang tidak menimbulkan pesan galat.
  const belumBerpagu = saran.filter(
    (s) => !pagu.some((p) => p.alias === s.alias && p.produk === s.produk));

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Pagu Insentif</h2>
          <p>
            Nominal maksimal per jabatan dan produk. Nominal yang dibayarkan =
            (skor insentif ÷ pembagi) × pagu, dan nol bila skor di bawah minimal.
          </p>
        </div>
        <button className="btn sm"
                onClick={() => setBaru({
                  alias: "", produk: produk[0]?.kode ?? "", nominal: "3000000",
                  skor_minimal: "3", pembagi: "5", mekanisme: "pagu",
                  aktif: true, pemakai: 0,
                })}>
          + Tambah pagu
        </button>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      {belumBerpagu.length > 0 && (
        <div className="alert warn mb">
          <b>{belumBerpagu.length} pasangan belum punya pagu.</b> Indikatornya
          sudah berbobot insentif, tapi tanpa pagu nominalnya tidak akan
          terbentuk:{" "}
          {belumBerpagu.slice(0, 6).map((s) => `${s.alias}/${s.produk}`).join(", ")}
          {belumBerpagu.length > 6 && `, dan ${belumBerpagu.length - 6} lainnya`}.
        </div>
      )}

      {baru && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Pagu baru</b>
            <button className="panel-x" onClick={() => setBaru(null)}>×</button>
          </div>
          <div className="panel-badan">
            <div className="pagu-medan">
              <label>
                <span className="faint small">Jabatan</span>
                <Pilih nilai={baru.alias} bebas placeholder="Pilih jabatan"
                       onPilih={(v) => setBaru({ ...baru, alias: v.toUpperCase() })}
                       opsi={Array.from(new Set(
                         [...semuaJabatan, ...saran].map((s) => s.alias)))
                         .map((a) => ({ nilai: a, label: a }))} />
              </label>
              <label>
                <span className="faint small">Produk</span>
                <Pilih nilai={baru.produk} cari={false}
                       onPilih={(v) => setBaru({ ...baru, produk: v })}
                       opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
              </label>
              <label>
                <span className="faint small">Mekanisme</span>
                <Pilih nilai={baru.mekanisme} cari={false}
                       onPilih={(v) => setBaru({ ...baru, mekanisme: v })}
                       opsi={[
                         { nilai: "pagu", label: "Rumus pagu", ket: "skor ÷ pembagi × pagu" },
                         { nilai: "tier", label: "Tabel tier", ket: "tier orang × tier cabang → nominal" },
                         { nilai: "bersyarat", label: "Nominal bersyarat",
                           ket: "dari indikator berperan Nominal bersyarat" },
                       ]} />
              </label>
              {baru.mekanisme === "tier" || baru.mekanisme === "bersyarat" ? null : (
                <>
                  <label>
                    <span className="faint small">Pagu (Rp)</span>
                    <input className="num" inputMode="numeric" value={baru.nominal}
                           onChange={(e) => setBaru({ ...baru, nominal: e.target.value })} />
                  </label>
                  <label>
                    <span className="faint small">Skor minimal</span>
                    <input className="num" inputMode="decimal" value={baru.skor_minimal}
                           onChange={(e) => setBaru({ ...baru, skor_minimal: e.target.value })} />
                  </label>
                  <label>
                    <span className="faint small">Pembagi</span>
                    <input className="num" inputMode="decimal" value={baru.pembagi}
                           onChange={(e) => setBaru({ ...baru, pembagi: e.target.value })} />
                  </label>
                </>
              )}
            </div>
            {baru.mekanisme === "bersyarat" ? (
              <p className="faint small">
                Nominalnya datang dari indikator yang perannya disetel{" "}
                <b>Nominal bersyarat</b> di{" "}
                <Link className="lnk" href="/admin/indikator">Create Indicator</Link>:
                cair penuh bila semua syarat lolos, nol bila ada yang gagal.
                Tidak ada pagu, skor minimal, maupun pembagi yang perlu diisi
                di sini karena besarnya tidak mengikuti skor.
              </p>
            ) : baru.mekanisme === "tier" ? (
              <p className="faint small">
                Nominalnya dicari dari{" "}
                <Link className="lnk" href="/admin/tier">Tabel Tier Insentif</Link>{" "}
                berdasar tier (dari indikator berperan "Penentu tier") dan kelas
                cabang orangnya. Isi tabel itu setelah pagu ini disimpan.
              </p>
            ) : (
              <p className="faint small">
                Contoh: skor {baru.pembagi || 5} penuh menghasilkan{" "}
                {rp(Number(baru.nominal) || 0)}; skor {baru.skor_minimal || 3} menghasilkan{" "}
                {rp(Math.round((Number(baru.skor_minimal) || 0) /
                  (Number(baru.pembagi) || 5) * (Number(baru.nominal) || 0)))}.
              </p>
            )}
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !baru.alias || !baru.produk}
                      onClick={async () => { if (await simpan(baru)) setBaru(null); }}>
                Simpan pagu
              </button>
              <button className="btn ghost sm" onClick={() => setBaru(null)}>Batal</button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="saring-bar-rapi">
          <KotakCari nilai={cari} onUbah={setCari} lebar={300}
                     placeholder="Cari jabatan atau produk" />
          <span className="faint small" style={{ marginLeft: "auto" }}>
            {pagu.length} pagu terdaftar
          </span>
        </div>

        <table className="rapat tbl-pagu">
          <colgroup>
            <col /><col style={{ width: 88 }} /><col style={{ width: 110 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 108 }} /><col style={{ width: 96 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Jabatan</th><th>Produk</th>
              <th>Mekanisme</th>
              <th className="r">Pagu</th>
              <th className="r">Skor minimal</th>
              <th className="r">Pembagi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terlihat.map((p, i) => {
              const ubah = (patch: Partial<Pagu>) =>
                setPagu(pagu.map((x) =>
                  x.alias === p.alias && x.produk === p.produk ? { ...x, ...patch } : x));
              // Kedua mekanisme ini nominalnya tidak berasal dari pagu/skor,
              // jadi ketiga kolom angka diganti tautan ke tempat aslinya
              // diatur — bukan dibiarkan kosong dan membingungkan.
              const tier = p.mekanisme === "tier";
              const bersyarat = p.mekanisme === "bersyarat";
              return (
                <tr key={p.alias + p.produk}>
                  <td>
                    <b>{p.alias}</b>
                    <div className="faint small">{p.pemakai} pemakai</div>
                  </td>
                  <td><span className="cip on">{p.produk}</span></td>
                  <td>
                    <Pilih nilai={p.mekanisme} cari={false}
                           onPilih={(v) => { ubah({ mekanisme: v }); simpan({ ...p, mekanisme: v }); }}
                           opsi={[
                             { nilai: "pagu", label: "Rumus pagu" },
                             { nilai: "tier", label: "Tabel tier" },
                             { nilai: "bersyarat", label: "Nominal bersyarat" },
                           ]} />
                  </td>
                  {tier || bersyarat ? (
                    <td colSpan={3}>
                      <Link className="lnk small"
                            href={bersyarat ? "/admin/indikator" : "/admin/tier"}>
                        {bersyarat
                          ? "Diatur pada indikator berperan Nominal bersyarat →"
                          : "Diatur di Tabel Tier Insentif →"}
                      </Link>
                    </td>
                  ) : (
                    <>
                      <td>
                        <input className="num r" inputMode="numeric" value={p.nominal}
                               onChange={(e) => ubah({ nominal: e.target.value })}
                               onBlur={() => simpan(p)} />
                      </td>
                      <td>
                        <input className="num r" inputMode="decimal" value={p.skor_minimal}
                               onChange={(e) => ubah({ skor_minimal: e.target.value })}
                               onBlur={() => simpan(p)} />
                      </td>
                      <td>
                        <input className="num r" inputMode="decimal" value={p.pembagi}
                               onChange={(e) => ubah({ pembagi: e.target.value })}
                               onBlur={() => simpan(p)} />
                      </td>
                    </>
                  )}
                  <td className="r">
                    <button className="isyarat-x" title={`Hapus pagu ${p.alias}`}
                            disabled={sibuk}
                            onClick={async () => {
                              if (!confirm(`Hapus pagu ${p.alias} · ${p.produk}?`)) return;
                              setSibuk(true);
                              try {
                                await fetch(
                                  `/api/admin/pagu?alias=${encodeURIComponent(p.alias)}&produk=${encodeURIComponent(p.produk)}`,
                                  { method: "DELETE" });
                                await segarkan();
                              } finally { setSibuk(false); }
                            }}>×</button>
                  </td>
                </tr>
              );
            })}
            {!terlihat.length && (
              <tr><td colSpan={7} className="empty">
                {muat ? "Memuat…" : cari ? "Tidak ada yang cocok."
                  : "Belum ada pagu. Tanpa pagu, skor insentif tidak menghasilkan nominal."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="faint small mt">
        Bobot insentif tiap indikator diatur di{" "}
        <Link className="lnk" href="/admin/indikator">Create Indicator</Link>.
        Perubahan pagu baru berlaku pada penghitungan berikutnya.
      </p>
    </>
  );
}
