import { rp, angka, nilai, tebakSatuan } from "@/lib/format";
import type { progresNik, ringkasHarian } from "@/lib/harian";

type Baris = Awaited<ReturnType<typeof progresNik>>[number];
type Ringkas = Awaited<ReturnType<typeof ringkasHarian>>;

/**
 * Rincian progres harian satu orang.
 *
 * Indikator dipisah menurut perannya, bukan disatukan dalam satu tabel
 * panjang. Alasannya bukan kerapian: indikator yang menilai KPI, yang
 * membayar nominal, yang menambah/mengurangi, dan yang cuma jadi bahan
 * syarat menuntut tindakan yang berbeda-beda. Dicampur jadi satu, pembaca
 * mengira semuanya sama-sama perlu dikejar.
 */

const JUDUL: Record<string, { judul: string; ket: string }> = {
  nominal: {
    judul: "Insentif bersyarat",
    ket: "Cair penuh bila semua syarat lolos; nol bila ada satu yang gagal.",
  },
  kpi: {
    judul: "Indikator KPI & insentif reguler",
    ket: "Menyumbang skor sesuai bobotnya masing-masing.",
  },
  reward: { judul: "Reward", ket: "Menambah nominal insentif." },
  penalty: { judul: "Penalty", ket: "Mengurangi nominal insentif." },
  tier: { judul: "Penentu tier", ket: "Menentukan tier, tidak ikut skor." },
  pendukung: {
    judul: "Angka pendukung",
    ket: "Tidak dinilai dan tidak dibayar — hanya bahan syarat.",
  },
};

const URUT = ["nominal", "kpi", "reward", "penalty", "tier", "pendukung"];

export default function RincianHarian({
  ringkas, baris,
}: { ringkas: Ringkas; baris: Baris[] }) {
  // 'reguler' adalah nilai lama yang setara 'kpi'; disatukan supaya tidak
  // muncul sebagai kelompok kembar yang membingungkan.
  const kelompok = new Map<string, Baris[]>();
  for (const b of baris) {
    const k = b.peran === "reguler" ? "kpi" : (b.peran || "kpi");
    kelompok.set(k, [...(kelompok.get(k) ?? []), b]);
  }

  const adaRincian = ringkas.dasar || ringkas.reward || ringkas.penalty;

  return (
    <>
      <div className="kartu-angka mb">
        <div className="angka-kotak">
          <span>Skor berjalan</span>
          <b className={ringkas.skor === null ? "" :
                        ringkas.skor >= 4 ? "baik" : ringkas.skor < 3 ? "buruk" : ""}>
            {ringkas.skor === null ? "—" : angka(ringkas.skor)}
          </b>
          <i>{ringkas.dinilai} indikator dinilai</i>
        </div>
        <div className="angka-kotak">
          <span>Di bawah KPI 3</span>
          <b className={ringkas.bawah ? "buruk" : ""}>{ringkas.bawah}</b>
          <i>perlu dikejar</i>
        </div>
        <div className="angka-kotak">
          <span>Proyeksi insentif</span>
          <b>{rp(ringkas.insentif)}</b>
          <i>belum final</i>
        </div>
        {adaRincian ? (
          <div className="angka-kotak">
            <span>Rincian</span>
            <b style={{ fontSize: 15 }}>
              {rp(ringkas.dasar)}
              {ringkas.reward ? ` + ${rp(ringkas.reward)}` : ""}
              {ringkas.penalty ? ` − ${rp(ringkas.penalty)}` : ""}
            </b>
            <i>pokok{ringkas.reward ? " + reward" : ""}{ringkas.penalty ? " − penalty" : ""}</i>
          </div>
        ) : null}
      </div>

      {URUT.filter((p) => kelompok.has(p)).map((peran) => {
        const isi = kelompok.get(peran)!;
        const info = JUDUL[peran] ?? { judul: peran, ket: "" };
        const nominalPeran = peran === "nominal";
        return (
          <section className="card mb" key={peran}>
            <div className="cardhead">
              <h3 style={{ fontSize: 14 }}>{info.judul}</h3>
              <p className="muted small">{info.ket}</p>
            </div>
            <table className="dk-tabel">
              <thead>
                <tr>
                  <th>Indikator</th>
                  <th className="r">Pencapaian</th>
                  {nominalPeran
                    ? <th className="r">Nominal</th>
                    : <><th className="r">Skor</th><th className="r">Bobot</th></>}
                </tr>
              </thead>
              <tbody>
                {isi.map((b, i) => {
                  const satuan = b.satuan ?? tebakSatuan(b.indikator, b.pencapaian);
                  const lv = b.skorKpi === null ? null
                    : b.skorKpi >= 4 ? 4 : b.skorKpi >= 3 ? 3 : 0;
                  return (
                    <tr key={i} className={lv === 0 ? "kurang" : ""}>
                      <td>
                        <div className="dk-nama">{b.indikator}</div>
                        {b.produk && <div className="dk-produk">{b.produk}</div>}
                        {nominalPeran && (
                          b.gerbangGagal
                            ? <div className="dk-gerbang gagal">Tidak cair — {b.gerbangGagal}</div>
                            : b.nominalBaris
                            ? <div className="dk-gerbang lolos">Semua syarat lolos</div>
                            : null
                        )}
                      </td>
                      <td className="r num dk-nilai">{nilai(b.pencapaian, satuan)}</td>
                      {nominalPeran ? (
                        <td className="r num">
                          <b className={b.nominalBaris ? "" : "faint"}>
                            {rp(b.nominalBaris ?? 0)}
                          </b>
                        </td>
                      ) : (
                        <>
                          <td className="r">
                            <b className={"dk-skor" + (lv === 0 ? " bahaya" : lv === 4 ? " baik" : "")}>
                              {b.skorKpi === null ? "—" : angka(b.skorKpi)}
                            </b>
                          </td>
                          <td className="r num faint">
                            {[b.bobot !== null && `KPI ${b.bobot}%`,
                              b.bobotInsentif !== null && `Ins ${b.bobotInsentif}%`]
                              .filter(Boolean).join(" · ") || "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      {!baris.length && (
        <div className="card card-pad">
          <p className="muted">
            Belum ada indikator terhitung untuk bulan berjalan. Ini terjadi bila
            jabatan · produk yang bersangkutan belum didaftarkan ke indikator
            mana pun, atau data API-nya belum ditarik.
          </p>
        </div>
      )}
    </>
  );
}
