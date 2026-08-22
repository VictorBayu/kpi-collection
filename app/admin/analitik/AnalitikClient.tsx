"use client";

import { useCallback, useMemo, useState } from "react";
import AmChart from "@/components/AmChart";
import Pilih from "@/components/Pilih";

type Alir = { from: string; to: string; value: number; skorRata: number };
type Radar = {
  indikator: string; skorRata: number; orang: number; cabang: number;
  skorMin: number; skorMaks: number;
};
type Area = { area: string; skorRata: number; orang: number; bawah: number };

type Props = {
  alir: Alir[];
  radar: Radar[];
  radarPerJabatan: Record<string, Radar[]>;
  jabatan: { jabatan: string; orang: number }[];
  area: Area[];
};

const WARNA_PITA: Record<string, string> = {
  "KPI 4 ke atas": "#1F8A5B",
  "KPI 3": "#2C5FE8",
  "Di bawah KPI 3": "#C2410C",
};

/**
 * Dasbor analitik KPI.
 *
 * Menjawab pertanyaan yang tidak terjawab tabel per cabang: pola apa yang
 * muncul kalau seluruh angka dilihat sekaligus. Tabel bagus untuk memeriksa
 * satu orang; ia buruk untuk melihat bahwa satu indikator lemah di hampir
 * semua cabang, karena di tabel hal itu tersebar jadi banyak angka kecil
 * yang terpisah-pisah.
 */
export default function AnalitikClient({
  alir, radar, radarPerJabatan, jabatan, area,
}: Props) {
  const [jabatanRadar, setJabatanRadar] = useState("");

  const radarTampil = useMemo(
    () => (jabatanRadar ? (radarPerJabatan[jabatanRadar] ?? []) : radar),
    [jabatanRadar, radar, radarPerJabatan]);

  /**
   * Sankey tiga tingkat: jabatan → produk → pita pencapaian.
   *
   * Tiga tingkat, bukan dua, supaya alirannya bisa ditelusuri. Dengan dua
   * tingkat, jabatan yang tampak buruk tidak ketahuan apakah buruk merata
   * di semua produk atau hanya jatuh di satu produk saja.
   */
  const gambarSankey = useCallback((root: any, am5: any) => {
    const seri = root.container.children.push(
      am5flowSankey(root, am5, alir));
    seri.appear(700, 100);
  }, [alir]);

  const gambarRadar = useCallback((root: any, am5: any) => {
    const data = radarTampil.map((r) => ({
      indikator: r.indikator,
      skor: r.skorRata,
      // Garis acuan KPI 3 digambar sebagai deret kedua, bukan sebagai
      // garis lurus tunggal: dengan sumbu melingkar, pembaca sulit
      // menaksir di mana angka 3 berada tanpa jejak yang mengelilingi.
      acuan: 3,
      orang: r.orang, cabang: r.cabang,
    }));

    const chart = root.container.children.push(
      am5radar.RadarChart.new(root, {
        panX: false, panY: false,
        wheelX: "none", wheelY: "none",
        radius: am5.percent(76),
        innerRadius: am5.percent(18),
      }));

    const sumbuX = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "indikator",
        renderer: am5radar.AxisRendererCircular.new(root, { minGridDistance: 30 }),
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
        stroke: am5.color(0x2C5FE8), fill: am5.color(0x2C5FE8),
        tooltip: am5.Tooltip.new(root, {
          labelText: "[bold]{categoryX}[/]\nSkor {valueY}\n{orang} orang · {cabang} cabang",
        }),
      }));
    seri.strokes.template.setAll({ strokeWidth: 2 });
    seri.fills.template.setAll({ visible: true, fillOpacity: 0.18 });
    seri.bullets.push(() =>
      am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, { radius: 4, fill: seri.get("fill") }),
      }));
    seri.data.setAll(data);
    seri.appear(700);
    chart.appear(700, 100);
  }, [radarTampil]);

  const gambarArea = useCallback((root: any, am5: any) => {
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false, panY: false, wheelX: "none", wheelY: "none",
        layout: root.verticalLayout,
      }));

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
          labelText: "[bold]{categoryY}[/]\nSkor rata-rata {valueX}\n{orang} orang · {bawah} di bawah KPI 3",
        }),
      }));
    seri.columns.template.setAll({ height: am5.percent(62), cornerRadiusBR: 4, cornerRadiusTR: 4 });
    // Warna mengikuti angkanya sendiri, bukan satu warna seragam: area
    // yang di bawah ambang harus langsung terlihat tanpa membaca sumbu.
    seri.columns.template.adapters.add("fill", (_f: any, sasaran: any) => {
      const v = sasaran.dataItem?.get("valueX") ?? 0;
      return am5.color(v >= 4 ? 0x1F8A5B : v < 3 ? 0xC2410C : 0x2C5FE8);
    });
    seri.columns.template.adapters.add("stroke", (_s: any, sasaran: any) => {
      const v = sasaran.dataItem?.get("valueX") ?? 0;
      return am5.color(v >= 4 ? 0x1F8A5B : v < 3 ? 0xC2410C : 0x2C5FE8);
    });
    seri.data.setAll(area);
    seri.appear(700);
    chart.appear(700, 100);
  }, [area]);

  const terlemah = radarTampil[0];
  const terkuat = radarTampil[radarTampil.length - 1];

  return (
    <>
      <section className="card mb">
        <div className="cardhead rowbetween">
          <div>
            <h3 style={{ fontSize: 15 }}>Alur jabatan → produk → pencapaian</h3>
            <p className="muted small">
              Tebal aliran = jumlah orang. Telusuri dari jabatan mana orangnya,
              memegang produk apa, lalu bermuara di pencapaian seperti apa.
            </p>
          </div>
        </div>
        <div className="card-pad">
          <AmChart gambar={gambarSankey} tinggi={Math.max(360, alir.length * 16)}
                   kunci="sankey" kosong={!alir.length}
                   pesanKosong="Belum ada data KPI di periode ini." />
        </div>
      </section>

      <div className="grafik-dua">
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Kekuatan indikator</h3>
            <p className="muted small">
              Skor rata-rata tiap indikator. Garis putus-putus adalah ambang KPI 3
              — titik yang jatuh di dalamnya berarti indikator itu lemah secara
              menyeluruh, bukan cuma di satu cabang.
            </p>
            <div className="mt" style={{ maxWidth: 260 }}>
              <Pilih nilai={jabatanRadar} onPilih={setJabatanRadar}
                     opsi={[{ nilai: "", label: "Semua jabatan (nasional)" },
                            ...jabatan.map((j) => ({
                              nilai: j.jabatan, label: j.jabatan, ket: `${j.orang} orang`,
                            }))]} />
            </div>
          </div>
          <div className="card-pad">
            <AmChart gambar={gambarRadar} tinggi={400}
                     kunci={`radar-${jabatanRadar}`} kosong={radarTampil.length < 3}
                     pesanKosong={radarTampil.length
                       ? "Radar butuh minimal tiga indikator agar bentuknya berarti."
                       : "Belum ada indikator dengan skor di periode ini."} />
          </div>
          {terlemah && terkuat && radarTampil.length >= 3 && (
            <div className="grafik-catatan">
              Paling lemah <b>{terlemah.indikator}</b> ({terlemah.skorRata}),
              paling kuat <b>{terkuat.indikator}</b> ({terkuat.skorRata}).
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Skor rata-rata per area</h3>
            <p className="muted small">
              Melengkapi radar: kalau radar menjawab indikator apa yang lemah,
              ini menjawab di mana lemahnya.
            </p>
          </div>
          <div className="card-pad">
            <AmChart gambar={gambarArea} tinggi={Math.max(300, area.length * 42)}
                     kunci="area" kosong={!area.length}
                     pesanKosong="Belum ada data area di periode ini." />
          </div>
        </section>
      </div>
    </>
  );
}

/** Pintasan ke modul global amCharts yang dimuat dari CDN. */
declare const am5xy: any;
declare const am5radar: any;
declare const am5flow: any;

/** Sankey dipisah supaya bagian panjangnya tidak menenggelamkan sisanya. */
function am5flowSankey(root: any, am5: any, alir: Alir[]) {
  const seri = am5flow.Sankey.new(root, {
    sourceIdField: "from", targetIdField: "to", valueField: "value",
    paddingRight: 120, nodeWidth: 12, nodePadding: 12,
  });

  seri.nodes.labels.template.setAll({
    fontSize: 11, maxWidth: 150, oversizedBehavior: "truncate",
  });

  // Aliran diwarnai menurut muaranya, bukan asalnya. Yang ingin dilihat
  // pembaca adalah ke mana orang bermuara — hijau, biru, atau merah —
  // dan pewarnaan dari asal justru menyamarkan itu.
  seri.links.template.setAll({ fillOpacity: 0.35, controlPointDistance: 0.35 });
  seri.links.template.adapters.add("fill", (bawaan: any, sasaran: any) => {
    const ke = sasaran.dataItem?.get("target")?.get("id");
    const warna = WARNA_PITA[ke as string];
    return warna ? am5.color(warna) : bawaan;
  });

  seri.links.template.set("tooltipText",
    "{sourceId} → {targetId}\n[bold]{value} orang[/]");

  seri.nodes.rectangles.template.setAll({ cornerRadiusTL: 3, cornerRadiusBL: 3,
                                          cornerRadiusTR: 3, cornerRadiusBR: 3 });
  seri.nodes.rectangles.template.adapters.add("fill", (bawaan: any, sasaran: any) => {
    const id = sasaran.dataItem?.get("id");
    const warna = WARNA_PITA[id as string];
    return warna ? am5.color(warna) : bawaan;
  });

  seri.data.setAll(alir);
  return seri;
}
