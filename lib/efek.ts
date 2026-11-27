import { q } from "./db";
import { nilai, rp } from "./format";

/**
 * Rincian indikator yang MEMBAYAR (reward, penalty, nominal bersyarat)
 * beserta poin-poin pendukung yang menentukannya.
 *
 * Satu reward biasanya bergantung pada beberapa indikator pendukung:
 * syarat kelayakan ("SR TT 1 AngKe ≥ 90", "jumlah bahan ≥ 5") dan penentu
 * besar nominal (total bahan kerja yang memilih band pita). Ditampilkan
 * sebagai baris-baris lepas, hubungan itu hilang — pembaca melihat
 * "107 unit" dan "Rp 815 jt" tanpa tahu keduanya bahan reward yang mana.
 * Di sini hubungan itu dirakit sekali, dipakai KPI Harian dan Data KPI.
 *
 * Angkanya DIBACA dari kpi_row (nominal_baris, gerbang_gagal) yang ditulis
 * mesin hitung, bukan dihitung ulang — tampilan tidak boleh punya versi
 * kebenarannya sendiri.
 */

export type PoinEfek = {
  jenis: "syarat" | "penentu";
  label: string;
  nilai: string;
  ket: string;
  status: "lolos" | "gagal" | "info";
};

export type Efek = {
  indikatorId: string;
  indikator: string;
  produk: string;
  peran: "reward" | "penalty" | "nominal";
  /** Rupiah yang diterima/dipotong baris ini; null bila jenisnya persen. */
  nominal: number | null;
  /** Persen dari insentif dasar (jenis persen); null bila rupiah. */
  persen: number | null;
  /** Ringkasan cara besarannya ditentukan, mis. "Rp500.000 tetap" atau "band ≥ 150 jt". */
  cara: string;
  ditahan: string | null;
  poin: PoinEfek[];
  /** Indikator pendukung yang dirujuk — disembunyikan dari daftar lepas. */
  rujukan: string[];
};

const OP: Record<string, string> = {
  lebih: ">", lebih_sama: "≥", kurang: "<", kurang_sama: "≤", sama: "=",
};

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

/** Format nilai indikator mengikuti definisinya (kali 100 = sudah persen). */
function fmt(v: number | null, satuan: string | null, kaliSeratus: boolean): string {
  if (v === null) return "tidak ada";
  if (kaliSeratus) return nilai(v, "persen100");
  if (satuan === "persen") return nilai(v, "persen");
  if (satuan === "unit") return nilai(v, "unit");
  return nilai(v, "rupiah");
}

function lulus(ukur: number | null, op: string, batas: number): boolean {
  if (ukur === null) return false;
  switch (op) {
    case "lebih": return ukur > batas;
    case "lebih_sama": return ukur >= batas;
    case "kurang": return ukur < batas;
    case "kurang_sama": return ukur <= batas;
    default: return ukur === batas;
  }
}

export async function efekNik(nik: string, periode: string): Promise<Efek[]> {
  const rows = await q<any>(
    `SELECT k.indikator_id, COALESCE(d.nama, k.indikator) AS indikator, k.produk, k.peran,
            k.jenis_nilai, k.nilai_efek, k.pencapaian, k.nominal_baris, k.gerbang_gagal,
            d.satuan, COALESCE(d.kali_seratus, false) AS kali_seratus,
            t.pemilih_id, pm.nama AS pemilih_nama, pm.satuan AS pemilih_satuan,
            COALESCE(pm.kali_seratus, false) AS pemilih_persen,
            (SELECT s.pencapaian FROM kpi_row s
              WHERE s.sumber = 'api' AND s.periode = k.periode AND s.nik = k.nik
                AND s.produk = k.produk AND s.indikator_id = t.pemilih_id
              LIMIT 1) AS pemilih_nilai,
            COALESCE((SELECT json_agg(json_build_object(
                        'min', n.nilai_min, 'max', n.nilai_max, 'nominal', n.nominal)
                        ORDER BY n.urutan)
                        FROM indikator_nominal n WHERE n.target_id = t.id), '[]'::json) AS pita,
            COALESCE((SELECT json_agg(json_build_object(
                        'nama', COALESCE(NULLIF(BTRIM(g.label), ''), gd.nama, d.nama, 'Syarat'),
                        'sumber_id', g.sumber_id, 'operator', g.operator, 'nilai', g.nilai,
                        'satuan', COALESCE(gd.satuan, d.satuan),
                        'persen', COALESCE(gd.kali_seratus, d.kali_seratus, false),
                        'ukur', (SELECT s.pencapaian FROM kpi_row s
                                  WHERE s.sumber = 'api' AND s.periode = k.periode
                                    AND s.nik = k.nik AND s.produk = k.produk
                                    AND s.indikator_id = COALESCE(g.sumber_id, k.indikator_id)
                                  LIMIT 1))
                        ORDER BY g.urutan)
                        FROM indikator_gerbang g
                        LEFT JOIN indikator_def gd ON gd.id = g.sumber_id
                       WHERE g.target_id = t.id), '[]'::json) AS syarat
       FROM kpi_row k
       JOIN indikator_target t
         ON t.indikator_id = k.indikator_id AND t.produk = k.produk
        AND t.alias = norm_jabatan(k.jabatan) AND t.periode = k.periode
       LEFT JOIN indikator_def d  ON d.id = k.indikator_id
       LEFT JOIN indikator_def pm ON pm.id = t.pemilih_id
      WHERE k.sumber = 'api' AND k.nik = $1 AND k.periode = $2::date
        AND k.peran IN ('reward','penalty','nominal')
      ORDER BY CASE k.peran WHEN 'nominal' THEN 0 WHEN 'reward' THEN 1 ELSE 2 END,
               COALESCE(d.nama, k.indikator)`,
    [nik, periode]);

  return rows.map((r) => {
    const peran = r.peran as Efek["peran"];
    const pita = (r.pita ?? []) as any[];
    const pakaiPita = peran === "nominal" || pita.length > 0;
    const ditahan: string | null = r.gerbang_gagal ?? null;
    const pencapaian = num(r.pencapaian);
    const efek = num(r.nilai_efek);

    let nominal: number | null = null;
    let persen: number | null = null;
    let cara = "";
    if (pakaiPita) {
      nominal = ditahan ? 0 : num(r.nominal_baris) ?? 0;
      const nilaiPemilih = r.pemilih_id ? num(r.pemilih_nilai) : pencapaian;
      if (pita.length === 1 && pita[0].min !== null && Number(pita[0].min) <= 0 && pita[0].max === null) {
        cara = `${rp(Number(pita[0].nominal))} tetap bila syarat lolos`;
      } else {
        const band = nilaiPemilih === null ? null : pita.find((b) =>
          (b.min === null || nilaiPemilih >= Number(b.min)) &&
          (b.max === null || nilaiPemilih < Number(b.max)));
        cara = band
          ? `band ${band.min === null ? "" : `≥ ${nilai(Number(band.min), "rupiah")}`}` +
            `${band.min !== null && band.max !== null ? " s/d " : ""}` +
            `${band.max === null ? "" : `< ${nilai(Number(band.max), "rupiah")}`} → ${rp(Number(band.nominal))}`
          : "tidak masuk band pita mana pun";
      }
    } else if (r.jenis_nilai === "persen") {
      persen = ditahan ? 0 : (efek ?? 0) * (pencapaian ?? 0);
      cara = `${nilai(efek ?? 0, "persen100")} × hasil hitung`;
    } else {
      nominal = ditahan ? 0 : (efek ?? 0) * (pencapaian ?? 0);
      cara = `${rp(efek ?? 0)} × ${fmt(pencapaian, r.satuan, r.kali_seratus)}`;
    }

    const poin: PoinEfek[] = [];
    const rujukan = new Set<string>();
    for (const g of (r.syarat ?? []) as any[]) {
      const ukur = num(g.ukur);
      const batas = Number(g.nilai);
      if (g.sumber_id) rujukan.add(String(g.sumber_id));
      poin.push({
        jenis: "syarat",
        label: g.nama,
        nilai: fmt(ukur, g.satuan, !!g.persen),
        ket: `syarat ${OP[g.operator] ?? g.operator} ${fmt(batas, g.satuan, !!g.persen)}`,
        status: lulus(ukur, g.operator, batas) ? "lolos" : "gagal",
      });
    }
    if (pakaiPita && r.pemilih_id) {
      rujukan.add(String(r.pemilih_id));
      poin.push({
        jenis: "penentu",
        label: r.pemilih_nama ?? "Penentu nominal",
        nilai: fmt(num(r.pemilih_nilai), r.pemilih_satuan, !!r.pemilih_persen),
        ket: "penentu besar nominal",
        status: "info",
      });
    }

    return {
      indikatorId: String(r.indikator_id),
      indikator: String(r.indikator),
      produk: String(r.produk ?? ""),
      peran, nominal, persen, cara, ditahan, poin,
      rujukan: [...rujukan],
    };
  });
}
