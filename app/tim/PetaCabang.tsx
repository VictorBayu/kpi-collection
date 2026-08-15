import Link from "next/link";
import { rp, rpSingkat, angka } from "@/lib/format";

type Anggota = {
  nik: string; nama: string; jabatan: string | null;
  jabatanMaster: string | null; cabang: string | null;
  level: string | null; terlemah: string | null;
  skor: number; insentif: number;
};

/**
 * Peta kinerja per cabang untuk AM dan ACH.
 *
 * Daftar datar berisi 80+ orang lintas sembilan cabang praktis tidak bisa
 * dipakai untuk memantau: tidak kelihatan cabang mana yang tertinggal.
 * Di sini tiap cabang jadi satu kartu dengan angka kunci di depan, diurutkan
 * dari yang paling perlu perhatian, sehingga satu tangkapan layar sudah
 * cukup untuk laporan mingguan.
 *
 * Pengelompokan dilakukan di server dari data yang sudah diambil — tidak
 * ada kueri tambahan.
 */
export default function PetaCabang({
  anggota, periode,
}: { anggota: Anggota[]; periode: string }) {
  // Kelompokkan per cabang
  const peta = new Map<string, Anggota[]>();
  for (const a of anggota) {
    const c = a.cabang || "(tanpa cabang)";
    const arr = peta.get(c) ?? [];
    arr.push(a);
    peta.set(c, arr);
  }

  const cabang = Array.from(peta.entries()).map(([nama, isi]) => {
    const rata = isi.reduce((s, x) => s + x.skor, 0) / Math.max(1, isi.length);
    const dibawah = isi.filter((x) => x.skor < 3).length;
    const insentif = isi.reduce((s, x) => s + x.insentif, 0);
    // Atasan cabang ditampilkan terpisah supaya penanggung jawabnya jelas
    const pimpinan = isi.filter((x) =>
      x.level === "manager_3" || x.level === "manager_2" || x.level === "manager_1");
    return {
      nama, isi: isi.slice().sort((a, b) => a.skor - b.skor),
      orang: isi.length, rata, dibawah, insentif, pimpinan,
    };
  }).sort((a, b) => a.rata - b.rata);   // paling perlu perhatian di atas

  const totalOrang = anggota.length;
  const totalDibawah = anggota.filter((a) => a.skor < 3).length;

  return (
    <section className="petacabang">
      <div className="pc-ikhtisar">
        <span>
          <b>{cabang.length}</b> cabang · <b>{totalOrang}</b> orang ·{" "}
          <b className={totalDibawah ? "angka-bahaya" : ""}>{totalDibawah}</b> di bawah KPI 3
        </span>
        <span className="faint">Diurutkan dari rata-rata terendah</span>
      </div>

      <div className="pc-grid">
        {cabang.map((c) => {
          const persenBawah = Math.round((c.dibawah / Math.max(1, c.orang)) * 100);
          const status = c.rata >= 4 ? "baik" : c.rata < 3 ? "bahaya" : "sedang";
          return (
            <details className={"pc-kartu " + status} key={c.nama}>
              <summary className="pc-head">
                <span className="pc-judul">
                  <b>{c.nama}</b>
                  <span className="faint">
                    {c.orang} orang
                    {c.pimpinan.length > 0 && ` · ${c.pimpinan.map((p) => p.jabatan).join(", ")}`}
                  </span>
                </span>

                <span className="pc-angka">
                  <span className="pc-skor">{angka(c.rata)}</span>
                  <span className="pc-label faint">rata-rata</span>
                </span>

                <span className="pc-angka">
                  <span className={"pc-bawah" + (c.dibawah ? " ada" : "")}>{c.dibawah}</span>
                  <span className="pc-label faint">di bawah 3</span>
                </span>

                <span className="pc-angka pc-uang">
                  <span className="pc-insentif">{rpSingkat(c.insentif)}</span>
                  <span className="pc-label faint">insentif</span>
                </span>

                <span className="pc-meter" aria-hidden>
                  <i style={{ width: `${persenBawah}%` }} />
                </span>
              </summary>

              <div className="pc-isi">
                <table className="pc-tabel">
                  <thead>
                    <tr>
                      <th>Nama</th><th>Jabatan</th>
                      <th>Indikator terlemah</th>
                      <th className="r">Skor</th><th className="r">Insentif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.isi.map((a) => (
                      <tr key={a.nik} className={a.skor < 3 ? "kurang" : ""}>
                        <td>
                          <b>{a.nama}</b>
                          <div className="faint num">{a.nik}</div>
                        </td>
                        <td className="faint num">{a.jabatan ?? "—"}</td>
                        <td className={a.terlemah ? "" : "faint"}>{a.terlemah ?? "—"}</td>
                        <td className="r num">
                          <b className={a.skor < 3 ? "angka-bahaya" : a.skor >= 4 ? "angka-baik" : ""}>
                            {angka(a.skor)}
                          </b>
                        </td>
                        <td className="r num">{rp(a.insentif)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>

      <p className="faint mt tanpa-cetak">
        Klik satu cabang untuk melihat daftar orangnya.{" "}
        <Link href={`/tim?periode=${periode}&tampilan=detail`} className="lnk">
          Detail semua indikator
        </Link>{" "}
        bila perlu menelusuri sampai per indikator.
      </p>
    </section>
  );
}
