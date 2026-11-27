import Ikon from "./Ikon";
import { rp, nilai } from "@/lib/format";
import type { Efek } from "@/lib/efek";

/**
 * Daftar indikator yang membayar (reward, penalty, nominal bersyarat),
 * masing-masing dengan poin pendukungnya di dalam kartunya sendiri.
 *
 * Tidak memakai state, jadi bisa dirender dari komponen server (Data KPI)
 * maupun klien (KPI Harian).
 */

const LABEL: Record<Efek["peran"], string> = {
  reward: "Reward", penalty: "Penalty", nominal: "Nominal bersyarat",
};

function besaran(e: Efek): string {
  if (e.persen !== null) return nilai(e.persen, "persen100");
  const v = e.nominal ?? 0;
  return e.peran === "penalty" && v ? `− ${rp(v)}` : rp(v);
}

export default function KartuEfek({
  efek, judul = "Reward & insentif tambahan",
}: { efek: Efek[]; judul?: string }) {
  if (!efek.length) return null;
  const banyakProduk = new Set(efek.map((e) => e.produk)).size > 1;
  const total = efek.reduce((a, e) =>
    a + (e.nominal === null ? 0 : e.peran === "penalty" ? -e.nominal : e.nominal), 0);
  const cair = efek.filter((e) => !e.ditahan && (e.nominal ?? e.persen ?? 0) !== 0).length;

  return (
    <section className="card mb ef-grup">
      <div className="ef-grup-kepala">
        <span className="hr-grup-ikon ik-reward"><Ikon nama="wallet" ukuran={18} /></span>
        <div>
          <h3>{judul}</h3>
          <p className="muted small">
            Tiap kartu memuat poin-poin yang menentukannya: syarat kelayakan dan penentu besar nominal.
          </p>
        </div>
        <div className="ef-grup-total">
          <span className="km-label">{cair} dari {efek.length} berlaku</span>
          <b className={"num" + (total < 0 ? " bad" : total > 0 ? " good" : "")}>{rp(total)}</b>
        </div>
      </div>

      <ul className="ef-daftar">
        {efek.map((e, i) => {
          const berlaku = !e.ditahan && (e.nominal ?? e.persen ?? 0) !== 0;
          return (
            <li key={i} className={"ef-item " + (e.ditahan ? "ditahan" : berlaku ? "berlaku" : "nol")}>
              <div className="ef-kepala">
                <div className="ef-judul">
                  <span className="ef-nama">{e.indikator}</span>
                  <span className={"ef-peran " + e.peran}>{LABEL[e.peran]}</span>
                  {banyakProduk && e.produk && <span className="ef-produk">{e.produk}</span>}
                  <div className="ef-cara">{e.cara}</div>
                </div>
                <div className="ef-hasil">
                  <b className="num">{besaran(e)}</b>
                  <span className={"ef-status " + (e.ditahan ? "bad" : berlaku ? "good" : "netral")}>
                    {e.ditahan ? "Ditahan" : berlaku ? "Berlaku" : "Belum ada"}
                  </span>
                </div>
              </div>

              {e.poin.length > 0 && (
                <ul className="ef-poin">
                  {e.poin.map((p, j) => (
                    <li key={j} className={p.status}>
                      <span className="ef-tanda" aria-hidden>
                        {p.status === "lolos" ? "✓" : p.status === "gagal" ? "✕" : "•"}
                      </span>
                      <span className="ef-poin-label">{p.label}</span>
                      <span className="ef-poin-ket">{p.ket}</span>
                      <b className="ef-poin-nilai num">{p.nilai}</b>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
