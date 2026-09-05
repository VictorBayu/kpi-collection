"use client";

import Link from "next/link";
import AmChart from "@/components/AmChart";
import PilihPeriode from "@/components/PilihPeriode";
import { rp, angka, namaPeriode } from "@/lib/format";

type Ringkas = {
  anggota: number; dinilai: number; skorRata: number | null;
  bawah: number; baik: number; insentif: number;
};
type Cabang = { cabang: string; orang: number; skor: number | null; bawah: number };
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
  periode, daftarPeriode, ringkas, cabang, sebaran, indikator, tren,
}: {
  periode: string; daftarPeriode: string[];
  ringkas: Ringkas; cabang: Cabang[]; sebaran: Sebaran[];
  indikator: Indikator[]; tren: Tren[];
}) {
  const warnaSkor = (am5: any, s: number | null) =>
    am5.color(s === null ? 0x8891a0 : s >= 4 ? 0x0f7a5a : s < 3 ? 0xc0332f : 0x3550c8);

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Dashboard Tim</h2>
          <p>
            Ringkasan pencapaian tim Anda pada periode {namaPeriode(periode)}.
            Hanya memuat orang yang boleh Anda lihat.
          </p>
        </div>
        <PilihPeriode daftar={daftarPeriode} aktif={periode} />
      </div>

      <div className="kartu-angka mb">
        <div className="angka-kotak">
          <span>Skor rata-rata tim</span>
          <b className={ringkas.skorRata === null ? ""
            : ringkas.skorRata >= 4 ? "baik" : ringkas.skorRata < 3 ? "buruk" : ""}>
            {ringkas.skorRata === null ? "—" : angka(ringkas.skorRata)}
          </b>
          <i>{ringkas.dinilai} dari {ringkas.anggota} orang dinilai</i>
        </div>
        <div className="angka-kotak">
          <span>Di bawah KPI 3</span>
          <b className={ringkas.bawah ? "buruk" : ""}>{ringkas.bawah}</b>
          <i>perlu dibantu</i>
        </div>
        <div className="angka-kotak">
          <span>Mencapai KPI 4+</span>
          <b className={ringkas.baik ? "baik" : ""}>{ringkas.baik}</b>
          <i>di atas target</i>
        </div>
        <div className="angka-kotak">
          <span>Total insentif tim</span>
          <b style={{ fontSize: 16 }}>{rp(ringkas.insentif)}</b>
          <i>periode ini</i>
        </div>
      </div>

      <section className="card mb">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Skor rata-rata per cabang</h3>
          <p className="muted small">
            Diurutkan dari tertinggi. Angka dalam kurung: jumlah orang di bawah KPI 3.
          </p>
        </div>
        <AmChart
          tinggi={Math.max(260, cabang.length * 38 + 90)}
          kunci={periode + cabang.length}
          kosong={!cabang.length}
          pesanKosong="Belum ada cabang dengan data pada periode ini."
          gambar={(root, am5) => {
            const xy = (window as any).am5xy;
            root.setThemes([(window as any).am5themes_Animated.new(root)]);
            const chart = root.container.children.push(
              xy.XYChart.new(root, { panX: false, panY: false, layout: root.verticalLayout }));

            const yAxis = chart.yAxes.push(xy.CategoryAxis.new(root, {
              categoryField: "cabang",
              renderer: xy.AxisRendererY.new(root, { minGridDistance: 18 }),
            }));
            yAxis.data.setAll(cabang.map((c) => ({ ...c, tip: "" })));

            const xAxis = chart.xAxes.push(xy.ValueAxis.new(root, {
              min: 0, max: 5, renderer: xy.AxisRendererX.new(root, {}),
            }));

            const seri = chart.series.push(xy.ColumnSeries.new(root, {
              xAxis, yAxis, valueXField: "skor", categoryYField: "cabang",
            }));
            seri.columns.template.setAll({
              height: am5.percent(66), cornerRadiusTR: 4, cornerRadiusBR: 4,
              tooltipText: "[bold]{cabang}[/]\n{orang} orang · skor {skor}\n{bawah} di bawah KPI 3",
            });
            seri.columns.template.adapters.add("fill", (_f: any, target: any) =>
              warnaSkor(am5, target.dataItem?.dataContext?.skor ?? null));
            seri.columns.template.adapters.add("stroke", (_f: any, target: any) =>
              warnaSkor(am5, target.dataItem?.dataContext?.skor ?? null));

            seri.data.setAll(cabang);
            seri.appear(700);
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

      <p className="muted small">
        Ingin melihat per orang? Buka <Link className="lnk" href="/tim">Tim saya</Link>.
      </p>
    </>
  );
}
