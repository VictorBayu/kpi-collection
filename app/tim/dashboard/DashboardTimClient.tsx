"use client";

import Link from "next/link";
import AmChart from "@/components/AmChart";
import PilihPeriode from "@/components/PilihPeriode";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik } from "@/components/JudulHalaman";
import { rp, angka, namaPeriode } from "@/lib/format";

type Ringkas = {
  anggota: number; dinilai: number; skorRata: number | null;
  bawah: number; baik: number; insentif: number;
};
type Radar = {
  indikator: string[];
  anggota: { nik: string; nama: string; nilai: Record<string, number> }[];
};
type Perhatian = {
  nik: string; nama: string; jabatan: string | null; cabang: string | null;
  skor: number | null; terlemah: string | null; skorTerlemah: number | null;
};
type Sebaran = { pita: number; orang: number; cabang: string };
type Indikator = { indikator: string; skor: number | null; orang: number; bawah: number };
type Tren = { periode: string; skor: number | null; orang: number };

/**
 * Dasbor tim untuk atasan.
 *
 * Memakai grafik yang sama dengan dasbor admin supaya atasan yang sudah
 * terbiasa membacanya tidak perlu belajar tampilan kedua. Warna batang
 * mengikuti ambang KPI — merah di bawah 3, hijau mulai 4 — karena itulah
 * pertanyaan pertama yang selalu diajukan atasan saat membuka dasbor:
 * siapa yang sedang di bawah.
 */
export default function DashboardTimClient({
  periode, daftarPeriode, ringkas, sebaran, indikator, tren, radar, perhatian,
}: {
  periode: string; daftarPeriode: string[];
  ringkas: Ringkas; sebaran: Sebaran[]; indikator: Indikator[];
  tren: Tren[]; radar: Radar; perhatian: Perhatian[];
}) {
  // Warna deret radar diambil dari satu palet tetap dan diulang. Warna acak
  // membuat orang yang sama berganti warna tiap muat ulang, sehingga
  // membandingkan dua kunjungan jadi mustahil.
  const PALET = [0x3550c8, 0x0f7a5a, 0xa45b12, 0xc0332f,
                 0x7a5bc0, 0x1d7f9e, 0x8a6d1f, 0x4a5768];
  const warnaSkor = (am5: any, s: number | null) =>
    am5.color(s === null ? 0x8891a0 : s >= 4 ? 0x0f7a5a : s < 3 ? 0xc0332f : 0x3550c8);

  return (
    <>
      <JudulHalaman
        eyebrow="Dashboard Tim"
        nada="tegas"
        judul="Dashboard Tim"
        deskripsi={`Ringkasan pencapaian tim Anda pada periode ${namaPeriode(periode)}. Hanya memuat orang yang boleh Anda lihat.`}
        aksi={<PilihPeriode daftar={daftarPeriode} aktif={periode} />}
      />

      <div className="km-grid">
        <KartuMetrik label="Skor rata-rata tim"
                     nilai={ringkas.skorRata === null ? "—" : angka(ringkas.skorRata)}
                     catatan={`${ringkas.dinilai} dari ${ringkas.anggota} orang dinilai`}
                     ikon={<Ikon nama={ringkas.skorRata !== null && ringkas.skorRata < 3 ? "trendDown" : "chart"} ukuran={20} />}
                     nada={ringkas.skorRata !== null && ringkas.skorRata < 3 ? "bad"
                       : ringkas.skorRata !== null && ringkas.skorRata >= 4 ? "good" : "netral"} />
        <KartuMetrik label="Di bawah KPI 3" nilai={ringkas.bawah} satuan="orang"
                     catatan="perlu dibantu"
                     ikon={<Ikon nama="alert" ukuran={20} />} nada={ringkas.bawah ? "bad" : "good"} />
        <KartuMetrik label="Mencapai KPI 4+" nilai={ringkas.baik} satuan="orang"
                     catatan="di atas target"
                     ikon={<Ikon nama="checkCircle" ukuran={20} />} nada={ringkas.baik ? "good" : "netral"} />
        <KartuMetrik label="Total insentif tim" nilai={rp(ringkas.insentif)}
                     catatan="periode ini"
                     ikon={<Ikon nama="wallet" ukuran={20} />} />
      </div>

      <section className="card mb">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Perbandingan anggota per indikator</h3>
          <p className="muted small">
            Delapan anggota dengan skor terendah pada indikator yang paling banyak
            dinilai. Semakin ke tepi semakin baik; lekukan ke dalam menandai
            indikator yang tertinggal.
          </p>
        </div>
        <AmChart
          tinggi={430}
          kunci={periode + "radar" + radar.anggota.length}
          kosong={!radar.anggota.length || radar.indikator.length < 3}
          pesanKosong="Butuh minimal tiga indikator dinilai untuk menggambar radar."
          gambar={(root, am5) => {
            const rad = (window as any).am5radar;
            const xy = (window as any).am5xy;
            root.setThemes([(window as any).am5themes_Animated.new(root)]);

            const chart = root.container.children.push(
              rad.RadarChart.new(root, {
                panX: false, panY: false,
                innerRadius: am5.percent(22), radius: am5.percent(72),
              }));

            const xAxis = chart.xAxes.push(xy.CategoryAxis.new(root, {
              categoryField: "indikator",
              renderer: rad.AxisRendererCircular.new(root, { minGridDistance: 40 }),
            }));
            xAxis.get("renderer").labels.template.setAll({
              fontSize: 11, maxWidth: 110, oversizedBehavior: "wrap", textAlign: "center",
            });
            xAxis.data.setAll(radar.indikator.map((i) => ({ indikator: i })));

            const yAxis = chart.yAxes.push(xy.ValueAxis.new(root, {
              min: 0, max: 5,
              renderer: rad.AxisRendererRadial.new(root, {}),
            }));

            radar.anggota.forEach((a, i) => {
              const warna = am5.color(PALET[i % PALET.length]);
              const seri = chart.series.push(rad.RadarLineSeries.new(root, {
                name: a.nama, xAxis, yAxis,
                valueYField: "skor", categoryXField: "indikator",
                stroke: warna, fill: warna,
                tooltip: am5.Tooltip.new(root, {
                  labelText: "[bold]" + a.nama + "[/]\n{categoryX}: {valueY}",
                }),
              }));
              seri.strokes.template.setAll({ strokeWidth: 2 });
              // Isi dibuat sangat tipis: delapan lapis isi pekat saling
              // menutupi sampai tak ada yang terbaca.
              seri.fills.template.setAll({ visible: true, fillOpacity: 0.06 });
              seri.bullets.push(() =>
                am5.Bullet.new(root, {
                  sprite: am5.Circle.new(root, { radius: 3, fill: warna }),
                }));
              seri.data.setAll(radar.indikator.map((ind) => ({
                indikator: ind,
                skor: a.nilai[ind] ?? null,
              })));
              seri.appear(600);
            });

            const legenda = chart.children.push(
              am5.Legend.new(root, {
                centerX: am5.percent(50), x: am5.percent(50),
                marginTop: 12, layout: root.gridLayout,
              }));
            legenda.labels.template.setAll({ fontSize: 11.5 });
            legenda.data.setAll(chart.series.values);
          }}
        />
      </section>

      <div className="dua-kolom mb">
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 14 }}>Sebaran skor anggota</h3>
            <p className="muted small">Berapa orang berada di tiap rentang skor.</p>
          </div>
          <AmChart
            tinggi={300} kunci={periode + "sebaran"} kosong={!sebaran.length}
            gambar={(root, am5) => {
              const xy = (window as any).am5xy;
              root.setThemes([(window as any).am5themes_Animated.new(root)]);
              const chart = root.container.children.push(
                xy.XYChart.new(root, { panX: false, panY: false }));

              const xAxis = chart.xAxes.push(xy.CategoryAxis.new(root, {
                categoryField: "label",
                renderer: xy.AxisRendererX.new(root, { minGridDistance: 22 }),
              }));
              const data = sebaran.map((s) => ({
                ...s, label: angka(s.pita, 1),
              }));
              xAxis.data.setAll(data);

              const yAxis = chart.yAxes.push(xy.ValueAxis.new(root, {
                min: 0, renderer: xy.AxisRendererY.new(root, {}),
              }));

              const seri = chart.series.push(xy.ColumnSeries.new(root, {
                xAxis, yAxis, valueYField: "orang", categoryXField: "label",
              }));
              seri.columns.template.setAll({
                width: am5.percent(70), cornerRadiusTL: 4, cornerRadiusTR: 4,
                tooltipText: "[bold]Skor {label}[/]\n{orang} orang\n{cabang}",
              });
              seri.columns.template.adapters.add("fill", (_f: any, target: any) =>
                warnaSkor(am5, target.dataItem?.dataContext?.pita ?? null));
              seri.columns.template.adapters.add("stroke", (_f: any, target: any) =>
                warnaSkor(am5, target.dataItem?.dataContext?.pita ?? null));

              seri.data.setAll(data);
              seri.appear(700);
            }}
          />
        </section>

        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 14 }}>Tren skor tim</h3>
            <p className="muted small">Rata-rata beberapa periode terakhir.</p>
          </div>
          <AmChart
            tinggi={300} kunci={"tren" + tren.length} kosong={tren.length < 2}
            pesanKosong="Butuh minimal dua periode untuk menggambar tren."
            gambar={(root, am5) => {
              const xy = (window as any).am5xy;
              root.setThemes([(window as any).am5themes_Animated.new(root)]);
              const chart = root.container.children.push(
                xy.XYChart.new(root, { panX: false, panY: false }));

              const data = tren.map((t) => ({ ...t, label: namaPeriode(t.periode) }));
              const xAxis = chart.xAxes.push(xy.CategoryAxis.new(root, {
                categoryField: "label",
                renderer: xy.AxisRendererX.new(root, { minGridDistance: 30 }),
              }));
              xAxis.data.setAll(data);

              const yAxis = chart.yAxes.push(xy.ValueAxis.new(root, {
                min: 0, max: 5, renderer: xy.AxisRendererY.new(root, {}),
              }));

              const seri = chart.series.push(xy.LineSeries.new(root, {
                xAxis, yAxis, valueYField: "skor", categoryXField: "label",
                stroke: am5.color(0x3550c8),
                tooltip: am5.Tooltip.new(root, {
                  labelText: "[bold]{label}[/]\nSkor {skor} · {orang} orang",
                }),
              }));
              seri.strokes.template.setAll({ strokeWidth: 2.5 });
              seri.bullets.push(() =>
                am5.Bullet.new(root, {
                  sprite: am5.Circle.new(root, { radius: 4, fill: am5.color(0x3550c8) }),
                }));
              seri.data.setAll(data);
              seri.appear(700);
            }}
          />
        </section>
      </div>

      <section className="card mb">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Indikator paling menahan skor</h3>
          <p className="muted small">
            Diurutkan dari rata-rata terendah — ini yang paling berdampak bila dibenahi.
          </p>
        </div>
        <table className="dk-tabel">
          <thead>
            <tr>
              <th>Indikator</th>
              <th className="r">Rata-rata</th>
              <th className="r">Orang dinilai</th>
              <th className="r">Di bawah KPI 3</th>
            </tr>
          </thead>
          <tbody>
            {indikator.map((i) => (
              <tr key={i.indikator} className={(i.skor ?? 9) < 3 ? "kurang" : ""}>
                <td><b>{i.indikator}</b></td>
                <td className="r">
                  <b className={"dk-skor" + ((i.skor ?? 9) < 3 ? " bahaya"
                    : (i.skor ?? 0) >= 4 ? " baik" : "")}>
                    {i.skor === null ? "—" : angka(i.skor)}
                  </b>
                </td>
                <td className="r num">{i.orang}</td>
                <td className={"r num " + (i.bawah ? "" : "faint")}>{i.bawah}</td>
              </tr>
            ))}
            {!indikator.length && (
              <tr><td colSpan={4} className="empty">Belum ada indikator dinilai.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card mb">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Paling perlu perhatian</h3>
          <p className="muted small">
            Anggota dengan skor terendah, beserta indikator yang paling menahannya.
          </p>
        </div>
        <table className="dk-tabel">
          <thead>
            <tr>
              <th>Nama</th><th>Indikator terlemah</th>
              <th className="r">Skor</th>
            </tr>
          </thead>
          <tbody>
            {perhatian.map((p) => (
              <tr key={p.nik} className={(p.skor ?? 9) < 3 ? "kurang" : ""}>
                <td>
                  <Link className="lnk" href={`/tim?nik=${encodeURIComponent(p.nik)}`}>
                    <b>{p.nama}</b>
                  </Link>
                  <div className="faint num">
                    {p.nik} · {p.jabatan ?? "—"}{p.cabang ? ` · ${p.cabang}` : ""}
                  </div>
                </td>
                <td className={p.terlemah ? "" : "faint"}>
                  {p.terlemah ?? "—"}
                  {p.skorTerlemah !== null && (
                    <span className="faint"> · {angka(p.skorTerlemah)}</span>
                  )}
                </td>
                <td className="r">
                  <b className={"dk-skor" + ((p.skor ?? 9) < 3 ? " bahaya"
                    : (p.skor ?? 0) >= 4 ? " baik" : "")}>
                    {p.skor === null ? "—" : angka(p.skor)}
                  </b>
                </td>
              </tr>
            ))}
            {!perhatian.length && (
              <tr><td colSpan={3} className="empty">
                Belum ada anggota dengan skor pada periode ini.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="muted small">
        Ingin melihat rincian per orang? Buka <Link className="lnk" href="/tim">Tim saya</Link>.
      </p>
    </>
  );
}
