"use client";

import { useCallback, useMemo, useState } from "react";
import AmChart from "@/components/AmChart";
import Pilih from "@/components/Pilih";

type Komposisi = {
  label: string; jabatan: string;
  orang: number; kpi4: number; kpi3: number; bawah: number;
  skorRata: number; persenBawah: number;
};
type Radar = {
  indikator: string; skorRata: number; orang: number; cabang: number;
  skorMin: number; skorMaks: number;
};
type Area = { area: string; skorRata: number; orang: number; bawah: number };
type Tren = {
  periode: string; skorRata: number; orang: number;
  bawah: number; insentif: number; persenBawah: number;
};
type Sebaran = { pita: number; label: string; orang: number };
type Cabang = { cabang: string; skorRata: number; orang: number; bawah: number };
type Biaya = { cabang: string; skorRata: number; orang: number; insentif: number; perOrang: number };

type Props = {
  komposisi: Komposisi[];
  radar: Radar[];
  radarPerJabatan: Record<string, Radar[]>;
  jabatan: { jabatan: string; orang: number }[];
  area: Area[];
  tren: Tren[];
  sebaran: Sebaran[];
  ujung: { terbaik: Cabang[]; terburuk: Cabang[]; jumlahCabang: number };
  biaya: Biaya[];
};

const HIJAU = 0x1F8A5B, BIRU = 0x2C5FE8, MERAH = 0xC2410C;
const warnaSkor = (v: number) => (v >= 4 ? HIJAU : v < 3 ? MERAH : BIRU);

const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const labelPeriode = (iso: string) => {
  const [th, bl] = iso.split("-");
  return `${BULAN[Number(bl) - 1] ?? bl} ${th.slice(2)}`;
};

declare const am5xy: any;
declare const am5radar: any;

/**
 * Dasbor analitik KPI.
 *
 * Disusun mengikuti urutan pertanyaan yang biasanya diajukan berturut-turut:
 * ke mana arahnya (tren), seperti apa sebarannya, siapa yang bermasalah
 * (jabatan, area, cabang), indikator apa penyebabnya, dan apakah uang yang
 * dikeluarkan sepadan.
 */
export default function AnalitikClient({
  komposisi, radar, radarPerJabatan, jabatan, area, tren, sebaran, ujung, biaya,
}: Props) {
  const [jabatanRadar, setJabatanRadar] = useState("");
  const [urutKomposisi, setUrutKomposisi] = useState<"bawah" | "skor" | "orang">("bawah");

  const radarTampil = useMemo(
    () => (jabatanRadar ? (radarPerJabatan[jabatanRadar] ?? []) : radar),
    [jabatanRadar, radar, radarPerJabatan]);

  const komposisiUrut = useMemo(() => {
    const d = komposisi.slice();
    if (urutKomposisi === "bawah") d.sort((a, b) => a.persenBawah - b.persenBawah);
    else if (urutKomposisi === "skor") d.sort((a, b) => a.skorRata - b.skorRata);
    else d.sort((a, b) => a.orang - b.orang);
    return d;   // amCharts sumbu Y menggambar dari bawah, jadi urutan dibalik sendiri
  }, [komposisi, urutKomposisi]);

  /* ---------------------------------------------------------------
     Tren skor: garis skor + batang jumlah orang di bawah KPI 3
     --------------------------------------------------------------- */
  const gambarTren = useCallback((root: any, am5: any) => {
    const data = tren.map((t) => ({ ...t, label: labelPeriode(t.periode) }));

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false, panY: false, wheelX: "none", wheelY: "none",
        layout: root.verticalLayout,
      }));
    chart.set("cursor", am5xy.XYCursor.new(root, { behavior: "none" }));

    const sumbuX = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "label",
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 40 }),
        tooltip: am5.Tooltip.new(root, {}),
      }));
    sumbuX.data.setAll(data);

    const sumbuKiri = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 5, strictMinMax: true,
        renderer: am5xy.AxisRendererY.new(root, {}),
      }));
    const sumbuKanan = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, renderer: am5xy.AxisRendererY.new(root, { opposite: true }),
      }));

    const batang = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Di bawah KPI 3", xAxis: sumbuX, yAxis: sumbuKanan,
        valueYField: "bawah", categoryXField: "label",
      }));
    batang.columns.template.setAll({
      fill: am5.color(MERAH), stroke: am5.color(MERAH),
      fillOpacity: 0.18, strokeOpacity: 0, width: am5.percent(46),
      tooltipText: "{bawah} orang di bawah KPI 3 ({persenBawah}%)",
    });
    batang.data.setAll(data);

    const garis = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: "Skor rata-rata", xAxis: sumbuX, yAxis: sumbuKiri,
        valueYField: "skorRata", categoryXField: "label",
        stroke: am5.color(BIRU),
        tooltip: am5.Tooltip.new(root, {
          labelText:
            "[bold]{label}[/]\nSkor rata-rata: [bold]{skorRata}[/]\n" +
            "{orang} karyawan · {bawah} di bawah KPI 3\nInsentif: Rp {insentif.formatNumber('#,###')}",
        }),
      }));
    garis.strokes.template.setAll({ strokeWidth: 3 });
    garis.bullets.push(() =>
      am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, {
          radius: 5, fill: am5.color(BIRU), stroke: am5.color(0xffffff), strokeWidth: 2,
        }),
      }));
    garis.data.setAll(data);

    chart.set("scrollbarX", undefined);
    garis.appear(700); batang.appear(700); chart.appear(700, 100);
  }, [tren]);

  /* ---------------------------------------------------------------
     Komposisi pencapaian per jabatan (pengganti Sankey)
     --------------------------------------------------------------- */
  const gambarKomposisi = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false, panY: false, wheelX: "none", wheelY: "none",
        layout: root.verticalLayout,
      }));

    const sumbuY = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "label",
        renderer: am5xy.AxisRendererY.new(root, { minGridDistance: 14 }),
      }));
    sumbuY.get("renderer").labels.template.setAll({ fontSize: 11 });
    sumbuY.data.setAll(komposisiUrut);

    // Sumbu persen, bukan jumlah orang: jabatan berisi 90 orang dan 6 orang
    // harus bisa dibandingkan tingkat masalahnya, bukan ukurannya.
    const sumbuX = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 100, strictMinMax: true, calculateTotals: true,
        renderer: am5xy.AxisRendererX.new(root, {}),
      }));

    const buat = (medan: string, nama: string, warna: number) => {
      const s = chart.series.push(
        am5xy.ColumnSeries.new(root, {
          name: nama, xAxis: sumbuX, yAxis: sumbuY,
          valueXField: medan, categoryYField: "label",
          stacked: true, valueXShow: "valueXTotalPercent",
        }));
      s.columns.template.setAll({
        fill: am5.color(warna), stroke: am5.color(warna), strokeOpacity: 0,
        height: am5.percent(64),
        tooltipText:
          `[bold]{categoryY}[/]\n${nama}: [bold]{valueX} orang[/] ` +
          "({valueXTotalPercent.formatNumber('#.')}%)\n" +
          "Total {orang} orang · skor rata-rata {skorRata}",
      });
      s.data.setAll(komposisiUrut);
      s.appear(600);
      return s;
    };

    buat("bawah", "Di bawah KPI 3", MERAH);
    buat("kpi3", "KPI 3", BIRU);
    buat("kpi4", "KPI 4 ke atas", HIJAU);

    const legenda = chart.children.push(
      am5.Legend.new(root, { centerX: am5.p50, x: am5.p50 }));
    legenda.data.setAll(chart.series.values);

    chart.appear(700, 100);
  }, [komposisiUrut]);

  /* ---------------------------------------------------------------
     Radar indikator — atau batang bila indikatornya terlalu sedikit
     --------------------------------------------------------------- */
  const gambarRadar = useCallback((root: any, am5: any) => {
    const data = radarTampil.map((r) => ({
      indikator: r.indikator, skor: r.skorRata, acuan: 3,
      orang: r.orang, cabang: r.cabang, min: r.skorMin, maks: r.skorMaks,
    }));

    const isiTooltip =
      "[bold]{categoryX}[/]\nSkor rata-rata: [bold]{skor}[/]\n" +
      "Rentang {min}–{maks}\n{orang} orang · {cabang} cabang";

    const chart = root.container.children.push(
      am5radar.RadarChart.new(root, {
        panX: false, panY: false, wheelX: "none", wheelY: "none",
        radius: am5.percent(74), innerRadius: am5.percent(20),
      }));

    const sumbuX = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "indikator",
        renderer: am5radar.AxisRendererCircular.new(root, { minGridDistance: 26 }),
        tooltip: am5.Tooltip.new(root, {}),
      }));
    sumbuX.get("renderer").labels.template.setAll({
      fontSize: 11, textType: "adjusted", radius: 8,
    });
    sumbuX.data.setAll(data);

    const sumbuY = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 5, strictMinMax: true,
        renderer: am5radar.AxisRendererRadial.new(root, {}),
      }));
    sumbuY.get("renderer").labels.template.setAll({ fontSize: 10 });

    const acuan = chart.series.push(
      am5radar.RadarLineSeries.new(root, {
        name: "Ambang KPI 3", xAxis: sumbuX, yAxis: sumbuY,
        valueYField: "acuan", categoryXField: "indikator",
        stroke: am5.color(0x9AA6BF),
      }));
    acuan.strokes.template.setAll({ strokeWidth: 1, strokeDasharray: [4, 3] });
    acuan.data.setAll(data);

    const seri = chart.series.push(
      am5radar.RadarLineSeries.new(root, {
        name: "Skor rata-rata", xAxis: sumbuX, yAxis: sumbuY,
        valueYField: "skor", categoryXField: "indikator",
        stroke: am5.color(BIRU), fill: am5.color(BIRU),
        tooltip: am5.Tooltip.new(root, { labelText: isiTooltip }),
      }));
    seri.strokes.template.setAll({ strokeWidth: 2 });
    seri.fills.template.setAll({ visible: true, fillOpacity: 0.18 });
    seri.bullets.push(() =>
      am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, { radius: 4, fill: seri.get("fill") }),
      }));
    seri.data.setAll(data);
    seri.appear(700); chart.appear(700, 100);
  }, [radarTampil]);

  /**
   * Batang pengganti radar.
   *
   * Radar butuh minimal tiga sumbu untuk membentuk bidang; dengan satu atau
   * dua indikator bentuknya jadi garis yang menyesatkan. Jabatan semacam
   * itu tetap perlu terlihat, jadi digambar sebagai batang biasa alih-alih
   * disembunyikan.
   */
  const gambarRadarBatang = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false, panY: false, wheelX: "none", wheelY: "none",
      }));

    const sumbuY = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "indikator",
        renderer: am5xy.AxisRendererY.new(root, { minGridDistance: 20 }),
      }));
    sumbuY.get("renderer").labels.template.setAll({ fontSize: 11 });
    sumbuY.data.setAll(radarTampil);

    const sumbuX = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 5, strictMinMax: true,
        renderer: am5xy.AxisRendererX.new(root, {}),
      }));

    const seri = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis: sumbuX, yAxis: sumbuY,
        valueXField: "skorRata", categoryYField: "indikator",
        tooltip: am5.Tooltip.new(root, {
          labelText:
            "[bold]{categoryY}[/]\nSkor rata-rata: [bold]{valueX}[/]\n" +
            "Rentang {skorMin}–{skorMaks}\n{orang} orang · {cabang} cabang",
        }),
      }));
    seri.columns.template.setAll({ height: am5.percent(58), cornerRadiusBR: 4, cornerRadiusTR: 4 });
    seri.columns.template.adapters.add("fill", (_f: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.get("valueX") ?? 0)));
    seri.columns.template.adapters.add("stroke", (_s: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.get("valueX") ?? 0)));
    seri.data.setAll(radarTampil);

    // Garis ambang KPI 3 supaya batang punya acuan, sama seperti di radar.
    const jangkar = sumbuX.createAxisRange(sumbuX.makeDataItem({ value: 3 }));
    jangkar.get("grid").setAll({
      stroke: am5.color(0x9AA6BF), strokeWidth: 1,
      strokeDasharray: [4, 3], strokeOpacity: 1,
    });
    jangkar.get("label").setAll({ text: "KPI 3", fontSize: 10, fill: am5.color(0x6B7A99) });

    seri.appear(700); chart.appear(700, 100);
  }, [radarTampil]);

  /* --------------------------------------------------------------- */
  const gambarArea = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" }));

    const sumbuY = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "area",
        renderer: am5xy.AxisRendererY.new(root, { minGridDistance: 18 }),
      }));
    sumbuY.get("renderer").labels.template.setAll({ fontSize: 11 });
    sumbuY.data.setAll(area);

    const sumbuX = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 5, strictMinMax: true,
        renderer: am5xy.AxisRendererX.new(root, {}),
      }));

    const seri = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis: sumbuX, yAxis: sumbuY,
        valueXField: "skorRata", categoryYField: "area",
        tooltip: am5.Tooltip.new(root, {
          labelText:
            "[bold]{categoryY}[/]\nSkor rata-rata: [bold]{valueX}[/]\n" +
            "{orang} karyawan · {bawah} di bawah KPI 3",
        }),
      }));
    seri.columns.template.setAll({ height: am5.percent(62), cornerRadiusBR: 4, cornerRadiusTR: 4 });
    seri.columns.template.adapters.add("fill", (_f: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.get("valueX") ?? 0)));
    seri.columns.template.adapters.add("stroke", (_s: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.get("valueX") ?? 0)));
    seri.data.setAll(area);
    seri.appear(700); chart.appear(700, 100);
  }, [area]);

  /* --------------------------------------------------------------- */
  const gambarSebaran = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" }));

    const sumbuX = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "label",
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 24 }),
      }));
    sumbuX.get("renderer").labels.template.setAll({ fontSize: 10 });
    sumbuX.data.setAll(sebaran);

    const sumbuY = chart.yAxes.push(
      am5xy.ValueAxis.new(root, { min: 0, renderer: am5xy.AxisRendererY.new(root, {}) }));

    const seri = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis: sumbuX, yAxis: sumbuY,
        valueYField: "orang", categoryXField: "label",
        tooltip: am5.Tooltip.new(root, {
          labelText: "Skor {categoryX}\n[bold]{valueY} karyawan[/]",
        }),
      }));
    seri.columns.template.setAll({ width: am5.percent(80), cornerRadiusTL: 4, cornerRadiusTR: 4 });
    seri.columns.template.adapters.add("fill", (_f: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.dataContext?.pita ?? 0)));
    seri.columns.template.adapters.add("stroke", (_s: any, t: any) =>
      am5.color(warnaSkor(t.dataItem?.dataContext?.pita ?? 0)));
    seri.data.setAll(sebaran);
    seri.appear(700); chart.appear(700, 100);
  }, [sebaran]);

  /* --------------------------------------------------------------- */
  const gambarBiaya = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" }));

    const sumbuX = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, max: 5, strictMinMax: true,
        renderer: am5xy.AxisRendererX.new(root, {}),
      }));
    const sumbuY = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0, renderer: am5xy.AxisRendererY.new(root, {}),
        numberFormat: "#a",
      }));

    const seri = chart.series.push(
      am5xy.LineSeries.new(root, {
        xAxis: sumbuX, yAxis: sumbuY,
        valueXField: "skorRata", valueYField: "perOrang",
      }));
    // Hanya titik, tanpa garis penghubung: urutan datanya tidak berarti apa-apa.
    seri.strokes.template.setAll({ strokeOpacity: 0 });

    // Tooltip dipasang pada bulatannya, bukan pada serinya. Tooltip di
    // level seri mengikuti posisi kursor sepanjang sumbu dan menampilkan
    // titik terdekat menurut sumbu X saja — pada sebaran, titik itu
    // hampir selalu bukan titik yang benar-benar ditunjuk, sehingga
    // keterangannya tidak cocok dengan yang dilihat.
    seri.bullets.push(() => {
      const titik = am5.Circle.new(root, {
        radius: 6, fillOpacity: 0.7, strokeOpacity: 0,
        fill: am5.color(BIRU),
        tooltipText:
          "[bold]{cabang}[/]\nSkor rata-rata: [bold]{skorRata}[/]\n" +
          "Insentif per orang: Rp {perOrang.formatNumber('#,###')}\n" +
          "Total insentif: Rp {insentif.formatNumber('#,###')}\n{orang} karyawan",
      });
      // Titik yang ditunjuk dibesarkan dan dipertegas: di gerombolan yang
      // rapat, tooltip saja tidak cukup memberi tahu itu milik titik mana.
      titik.states.create("hover", {
        radius: 9, fillOpacity: 1,
        strokeOpacity: 1, stroke: am5.color(0xffffff), strokeWidth: 2,
      });
      return am5.Bullet.new(root, { sprite: titik });
    });
    seri.data.setAll(biaya);

    // Garis ambang KPI 3: pemisah antara "layak dibayar" dan "perlu ditanya".
    const jangkar = sumbuX.createAxisRange(sumbuX.makeDataItem({ value: 3 }));
    jangkar.get("grid").setAll({
      stroke: am5.color(MERAH), strokeWidth: 1,
      strokeDasharray: [4, 3], strokeOpacity: 0.8,
    });
    jangkar.get("label").setAll({ text: "KPI 3", fontSize: 10, fill: am5.color(MERAH) });

    // Sengaja tanpa XYCursor: garis bantunya menarik tooltip mengikuti
    // sumbu, bukan titik yang ditunjuk, dan itu justru yang bikin
    // keterangannya tidak cocok dengan titik yang dilihat.
    seri.appear(700); chart.appear(700, 100);
  }, [biaya]);

  const terlemah = radarTampil[0];
  const terkuat = radarTampil[radarTampil.length - 1];
  const radarCukup = radarTampil.length >= 3;

  return (
    <>
      {/* --- tren --- */}
      <section className="card mb">
        <div className="cardhead">
          <h3 style={{ fontSize: 15 }}>Tren skor dan beban perbaikan</h3>
          <p className="muted small">
            Garis biru: skor rata-rata nasional. Batang merah: jumlah karyawan
            di bawah KPI 3. Arahnya lebih penting daripada angka satu bulan.
          </p>
        </div>
        <div className="card-pad">
          <AmChart gambar={gambarTren} tinggi={300} kunci="tren"
                   kosong={tren.length < 2}
                   pesanKosong="Tren butuh minimal dua periode. Grafik ini akan terisi sendiri seiring bertambahnya bulan." />
        </div>
      </section>

      {/* --- komposisi jabatan --- */}
      <section className="card mb">
        <div className="cardhead rowbetween">
          <div>
            <h3 style={{ fontSize: 15 }}>Komposisi pencapaian per jabatan</h3>
            <p className="muted small">
              Setiap batang satu jabatan, dibagi menurut proporsi pencapaiannya.
              Dibaca dalam persen supaya jabatan besar dan kecil bisa
              dibandingkan tingkat masalahnya, bukan ukurannya.
            </p>
          </div>
          <div style={{ width: 190 }}>
            <Pilih nilai={urutKomposisi} cari={false}
                   onPilih={(v) => setUrutKomposisi(v as typeof urutKomposisi)}
                   opsi={[
                     { nilai: "bawah", label: "Urut: paling bermasalah" },
                     { nilai: "skor", label: "Urut: skor terendah" },
                     { nilai: "orang", label: "Urut: jumlah orang" },
                   ]} />
          </div>
        </div>
        <div className="card-pad">
          {/* Tinggi per batang dipatok kecil (26px). Dengan 34px, dua belas
              jabatan sudah memenuhi seluruh layar dan grafik terasa
              menggantung tanpa ujung; angka ini muat sekitar lima belas
              batang dalam satu layar penuh. */}
          <AmChart gambar={gambarKomposisi}
                   tinggi={Math.max(260, komposisiUrut.length * 26 + 64)}
                   kunci={`komposisi-${urutKomposisi}`} kosong={!komposisi.length}
                   pesanKosong="Belum ada data KPI di periode ini." />
        </div>
      </section>

      <div className="grafik-dua">
        {/* --- radar indikator --- */}
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Kekuatan indikator</h3>
            <p className="muted small">
              Skor rata-rata tiap indikator. Garis putus-putus adalah ambang
              KPI 3 — yang jatuh di dalamnya lemah secara menyeluruh, bukan
              cuma di satu cabang.
            </p>
            <div className="mt" style={{ maxWidth: 280 }}>
              <Pilih nilai={jabatanRadar} onPilih={setJabatanRadar}
                     opsi={[{ nilai: "", label: "Semua jabatan (nasional)" },
                            ...jabatan.map((j) => ({
                              nilai: j.jabatan, label: j.jabatan, ket: `${j.orang} orang`,
                            }))]} />
            </div>
          </div>
          <div className="card-pad">
            <AmChart gambar={radarCukup ? gambarRadar : gambarRadarBatang}
                     tinggi={radarCukup ? 400 : Math.max(160, radarTampil.length * 60 + 80)}
                     kunci={`radar-${jabatanRadar}-${radarCukup}`}
                     kosong={!radarTampil.length}
                     pesanKosong="Belum ada indikator dengan skor di periode ini." />
          </div>
          {radarTampil.length > 0 && (
            <div className="grafik-catatan">
              {radarTampil.length === 1 ? (
                <>Jabatan ini hanya punya satu indikator: <b>{terlemah.indikator}</b> ({terlemah.skorRata}).</>
              ) : (
                <>
                  Paling lemah <b>{terlemah.indikator}</b> ({terlemah.skorRata}),
                  paling kuat <b>{terkuat.indikator}</b> ({terkuat.skorRata}).
                  {!radarCukup && " Ditampilkan sebagai batang karena radar butuh minimal tiga indikator."}
                </>
              )}
            </div>
          )}
        </section>

        {/* --- sebaran skor --- */}
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Sebaran skor karyawan</h3>
            <p className="muted small">
              Rata-rata menyembunyikan bentuk. Satu gunung di tengah menuntut
              tindakan yang sangat berbeda dari dua gunung di ujung yang
              berlawanan.
            </p>
          </div>
          <div className="card-pad">
            <AmChart gambar={gambarSebaran} tinggi={300} kunci="sebaran"
                     kosong={!sebaran.length}
                     pesanKosong="Belum ada data skor di periode ini." />
          </div>
        </section>
      </div>

      <div className="grafik-dua">
        {/* --- per area --- */}
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Skor rata-rata per area</h3>
            <p className="muted small">
              Kalau radar menjawab indikator apa yang lemah, ini menjawab
              di mana lemahnya.
            </p>
          </div>
          <div className="card-pad">
            <AmChart gambar={gambarArea} tinggi={Math.max(280, area.length * 40)}
                     kunci="area" kosong={!area.length}
                     pesanKosong="Belum ada data area di periode ini." />
          </div>
        </section>

        {/* --- biaya vs skor --- */}
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Insentif per orang dibanding skor</h3>
            <p className="muted small">
              Satu titik satu cabang. Titik di kiri-atas — insentif tinggi tapi
              skor di bawah ambang — adalah yang paling perlu ditanyakan.
            </p>
          </div>
          <div className="card-pad">
            <AmChart gambar={gambarBiaya} tinggi={320} kunci="biaya"
                     kosong={biaya.length < 2}
                     pesanKosong="Butuh minimal dua cabang berisi tiga karyawan atau lebih." />
          </div>
        </section>
      </div>

      {/* --- ujung cabang --- */}
      <div className="grafik-dua">
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Cabang perlu perhatian</h3>
            <p className="muted small">
              Skor terendah dari {ujung.jumlahCabang} cabang berisi tiga
              karyawan atau lebih.
            </p>
          </div>
          <TabelCabang data={ujung.terburuk} />
        </section>
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Cabang terbaik</h3>
            <p className="muted small">
              Yang pantas ditiru — dan ditanya apa yang mereka lakukan berbeda.
            </p>
          </div>
          <TabelCabang data={ujung.terbaik} />
        </section>
      </div>
    </>
  );
}

function TabelCabang({ data }: { data: Cabang[] }) {
  return (
    <table className="rapat">
      <thead>
        <tr>
          <th>Cabang</th>
          <th className="r">Karyawan</th>
          <th className="r">Di bawah KPI 3</th>
          <th className="r">Skor</th>
        </tr>
      </thead>
      <tbody>
        {data.map((c) => (
          <tr key={c.cabang}>
            <td><b>{c.cabang}</b></td>
            <td className="r num faint">{c.orang}</td>
            <td className="r num">{c.bawah > 0 ? c.bawah : "—"}</td>
            <td className="r">
              <span className={"skorpill " + (c.skorRata >= 4 ? "hi" : c.skorRata < 3 ? "lo" : "")}>
                {c.skorRata.toFixed(2)}
              </span>
            </td>
          </tr>
        ))}
        {!data.length && (
          <tr><td colSpan={4} className="empty">Belum cukup data cabang.</td></tr>
        )}
      </tbody>
    </table>
  );
}
