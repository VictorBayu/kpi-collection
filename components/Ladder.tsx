import { nilai, selisih } from "@/lib/format";

type Props = {
  v: number | null; t3: number | null; t4: number | null; t5: number | null;
  satuan: string; ringkas?: boolean;
};

/**
 * Tangga target: menempatkan pencapaian di antara ambang KPI 3, 4, dan 5.
 * Jarak antar ambang sengaja dibuat tetap (20% / 55% / 90%) supaya
 * tingkat lebih mudah dibaca daripada skala linear yang bisa menipu.
 */
export function posisi(v: number, t3: number, t4: number, t5: number) {
  if (v < t3) return Math.max(2, (v / t3) * 20);
  if (v < t4) return 20 + ((v - t3) / (t4 - t3)) * 35;
  if (v < t5) return 55 + ((v - t4) / (t5 - t4)) * 35;
  return Math.min(99, 90 + ((v - t5) / t5) * 40);
}

export const tingkat = (v: number, t3: number, t4: number, t5: number) =>
  v >= t5 ? 5 : v >= t4 ? 4 : v >= t3 ? 3 : 0;

export function kalimatJarak(v: number, t3: number, t4: number, t5: number, satuan: string) {
  const lv = tingkat(v, t3, t4, t5);
  if (lv >= 5) return `Sudah melewati target tertinggi, lebih ${selisih(v - t5, satuan)} di atas KPI 5.`;
  const berikut = lv >= 4 ? t5 : lv >= 3 ? t4 : t3;
  const label = lv >= 4 ? "KPI 5" : lv >= 3 ? "KPI 4" : "KPI 3";
  return `Kurang ${selisih(berikut - v, satuan)} lagi untuk mencapai ${label}.`;
}

export default function Ladder({ v, t3, t4, t5, satuan, ringkas }: Props) {
  if (v === null || t3 === null || t4 === null || t5 === null) {
    return <p className="faint">Target belum lengkap untuk indikator ini, posisi tidak bisa ditampilkan.</p>;
  }
  const p = posisi(v, t3, t4, t5);
  const lv = tingkat(v, t3, t4, t5);
  const warna = lv >= 5 ? "good" : lv >= 4 ? "" : "warn";

  return (
    <div className="ladder">
      <div className="ladder-track">
        <i className={`fill ${warna}`} style={{ width: `${p}%` }} />
        {[20, 55, 90].map((x) => <b key={x} className="notch" style={{ left: `${x}%` }} />)}
        <span className="marker" style={{ left: `${p}%` }}><i /></span>
      </div>
      <div className="ladder-labels">
        {([["KPI 3", t3, 20], ["KPI 4", t4, 55], ["KPI 5", t5, 90]] as const).map(([n, val, x]) => (
          <span key={n} style={{ left: `${x}%` }}>
            {ringkas ? n.split(" ")[1] : n}
            {!ringkas && <b>{nilai(val, satuan)}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}
