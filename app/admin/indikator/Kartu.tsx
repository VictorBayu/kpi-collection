"use client";

import Pilih from "@/components/Pilih";

export type Syarat = { kolom: string; operator: string; nilai: string[] };
export type Pengakuan = { nilai: string; persen: number | string };
export type Komponen = {
  agregat: string;
  kolom: string | null;
  operator_sebelum: string | null;
  gabung_syarat: "dan" | "atau";
  syarat: Syarat[];
  /** Kolom penentu bobot pengakuan. Kosong = seluruh baris diakui penuh. */
  pengakuan_kolom?: string | null;
  pengakuan?: Pengakuan[];
};
export type Kolom = {
  kolom: string; label: string; jenis: string; agregat: boolean; kelompok: string | null;
};

/** Operator yang menampung banyak nilai sekaligus. */
export const BANYAK_NILAI = ["termasuk", "tidak_termasuk"];
/** Operator yang tidak butuh nilai apa pun. */
export const TANPA_NILAI = ["kosong", "terisi"];

const OP_TEKS = [
  ["sama", "sama dengan"], ["tidak_sama", "tidak sama dengan"],
  ["termasuk", "termasuk salah satu dari"], ["tidak_termasuk", "bukan salah satu dari"],
  ["mengandung", "mengandung"], ["kosong", "kosong"], ["terisi", "terisi"],
];
const OP_ANGKA = [
  ["sama", "sama dengan"], ["tidak_sama", "tidak sama dengan"],
  ["lebih", "lebih dari"], ["lebih_sama", "minimal"],
  ["kurang", "kurang dari"], ["kurang_sama", "maksimal"],
  ["antara", "antara"], ["kosong", "kosong"], ["terisi", "terisi"],
];
const OP_TANGGAL = [
  ["sama", "pada tanggal"], ["lebih", "setelah"], ["kurang", "sebelum"],
  ["antara", "antara"], ["kosong", "kosong"], ["terisi", "terisi"],
];

export function operatorUntuk(jenis: string) {
  const set = jenis === "angka" ? OP_ANGKA : jenis === "tanggal" ? OP_TANGGAL : OP_TEKS;
  return set.map(([nilai, label]) => ({ nilai, label }));
}

/**
 * Satu kartu komponen.
 *
 * Bentuk kartu dipilih ketimbang kanvas bersambung garis karena rumus KPI
 * di sini selalu rata — beberapa agregasi digabung operator secara
 * berurutan, tanpa percabangan. Kanvas menawarkan kebebasan yang tidak
 * terpakai, dengan ongkos berupa logika seret-sambung, pencegahan
 * perulangan, dan zoom-pan yang harus dibangun dan dipelihara sendiri.
 *
 * Urutan kartu ditentukan dengan menyeretnya, dan itulah urutan hitungnya:
 * apa yang terbaca di layar sama dengan apa yang dijalankan.
 */
export default function Kartu({
  k, indeks, kolom, sibuk, nilaiUnik, onUbah, onHapus,
  onSeretMulai, onSeretLewat, onJatuh, diangkat, sasaran,
}: {
  k: Komponen;
  indeks: number;
  kolom: Kolom[];
  sibuk: boolean;
  nilaiUnik: Record<string, string[]>;
  onUbah: (patch: Partial<Komponen>) => void;
  onHapus: () => void;
  onSeretMulai: () => void;
  onSeretLewat: () => void;
  onJatuh: () => void;
  diangkat: boolean;
  sasaran: boolean;
}) {
  const bisaAgregat = kolom.filter((c) => c.agregat);
  const opsiKolom = (daftar: Kolom[]) =>
    daftar.map((c) => ({ nilai: c.kolom, label: c.label, grup: c.kelompok ?? undefined }));

  const jenisDari = (kode: string) =>
    kolom.find((c) => c.kolom === kode)?.jenis ?? "teks";

  // Pengakuan dianggap aktif begitu barisnya ada, bukan begitu kolom
  // penentunya terisi — supaya admin bisa menambah baris dulu lalu memilih
  // kolomnya, tanpa panelnya berkedip hilang.
  const akuiAktif = (k.pengakuan?.length ?? 0) > 0;

  function ubahAkui(i: number, patch: Partial<Pengakuan>) {
    onUbah({
      pengakuan: (k.pengakuan ?? []).map((b, x) => (x === i ? { ...b, ...patch } : b)),
    });
  }

  function ubahSyarat(i: number, patch: Partial<Syarat>) {
    const baru = k.syarat.map((s, x) => (x === i ? { ...s, ...patch } : s));
    // Ganti kolom berarti jenisnya bisa berubah, dan operator lama
    // mungkin tidak berlaku lagi untuk jenis yang baru.
    if (patch.kolom) {
      const ops = operatorUntuk(jenisDari(patch.kolom));
      if (!ops.some((o) => o.nilai === baru[i].operator)) baru[i].operator = ops[0].nilai;
      baru[i].nilai = [];
    }
    onUbah({ syarat: baru });
  }

  return (
    <div className={"ikartu" + (diangkat ? " diangkat" : "") + (sasaran ? " sasaran" : "")}
         draggable={!sibuk}
         onDragStart={onSeretMulai}
         onDragOver={(e) => { e.preventDefault(); onSeretLewat(); }}
         onDrop={(e) => { e.preventDefault(); onJatuh(); }}>

      <span className="ikartu-grip" aria-hidden>⋮⋮</span>

      <div className="ikartu-isi">
        <div className="ikartu-atas">
          <span className="ikartu-no">Komponen {String.fromCharCode(65 + indeks)}</span>
          <button className="ikartu-x" title="Hapus komponen" onClick={onHapus}>×</button>
        </div>

        <div className="ikartu-rumus">
          <div className="i-agregat">
            <Pilih nilai={k.agregat} cari={false}
                   onPilih={(v) => onUbah({ agregat: v, kolom: v === "COUNT" ? k.kolom : k.kolom })}
                   opsi={[
                     { nilai: "SUM", label: "SUM" }, { nilai: "COUNT", label: "COUNT" },
                     { nilai: "COUNT_DISTINCT", label: "COUNT unik" },
                     { nilai: "AVG", label: "AVG" }, { nilai: "MIN", label: "MIN" },
                     { nilai: "MAX", label: "MAX" },
                   ]} />
          </div>
          <span className="faint small">dari</span>
          <div className="i-kolom">
            {/* COUNT menghitung baris tanpa kolom. COUNT unik butuh kolom,
                tapi boleh kolom apa pun — termasuk teks seperti nomor
                kontrak; membatasinya ke kolom angka membuat "jumlah kontrak
                unik" mustahil dipilih. Hanya SUM/AVG/MIN/MAX yang benar
                menuntut kolom angka. */}
            <Pilih nilai={k.kolom ?? ""} onPilih={(v) => onUbah({ kolom: v })}
                   placeholder={k.agregat === "COUNT" ? "semua baris" : "pilih kolom"}
                   opsi={opsiKolom(
                     k.agregat === "COUNT" || k.agregat === "COUNT_DISTINCT"
                       ? kolom : bisaAgregat)} />
          </div>
        </div>

        <div className="ikartu-syarat">
          {k.syarat.map((s, i) => {
            const jenis = jenisDari(s.kolom);
            const opsiNilai = nilaiUnik[s.kolom];
            return (
              <div className="isyarat" key={i}>
                <span className="isyarat-gabung">
                  {i === 0 ? "bila" : (
                    <button className="saring-toggle"
                            title="Ganti antara semua syarat / salah satu syarat"
                            onClick={() => onUbah({ gabung_syarat: k.gabung_syarat === "dan" ? "atau" : "dan" })}>
                      {k.gabung_syarat}
                    </button>
                  )}
                </span>

                <div className="isyarat-kolom">
                  <Pilih nilai={s.kolom} onPilih={(v) => ubahSyarat(i, { kolom: v })}
                         placeholder="kolom" opsi={opsiKolom(kolom)} />
                </div>

                <div className="isyarat-op">
                  <Pilih nilai={s.operator} cari={false}
                         onPilih={(v) => ubahSyarat(i, { operator: v, nilai: [] })}
                         opsi={operatorUntuk(jenis)} />
                </div>

                <div className="isyarat-nilai">
                  {TANPA_NILAI.includes(s.operator) ? (
                    <span className="faint small">tidak perlu nilai</span>
                  ) : BANYAK_NILAI.includes(s.operator) ? (
                    /* Nilai sebagai kumpulan cip. Inilah yang menampung
                       "OD Movement bernilai Out NPF, BTC, Tarik, atau
                       Lunas" tanpa perlu empat syarat terpisah. */
                    <div className="inilai-banyak">
                      {s.nilai.map((v, x) => (
                        <span className="cip on" key={x}>
                          {v}
                          <button title="Hapus nilai"
                                  onClick={() => ubahSyarat(i, { nilai: s.nilai.filter((_, y) => y !== x) })}>×</button>
                        </span>
                      ))}
                      <Pilih nilai="" bebas placeholder="+ tambah nilai"
                             onPilih={(v) => {
                               const bersih = v.trim();
                               if (bersih && !s.nilai.includes(bersih)) {
                                 ubahSyarat(i, { nilai: [...s.nilai, bersih] });
                               }
                             }}
                             opsi={(opsiNilai ?? [])
                               .filter((o) => !s.nilai.includes(o))
                               .map((o) => ({ nilai: o, label: o }))} />
                    </div>
                  ) : opsiNilai && jenis === "teks" ? (
                    <Pilih nilai={s.nilai[0] ?? ""} bebas placeholder="pilih atau ketik"
                           onPilih={(v) => ubahSyarat(i, { nilai: [v] })}
                           opsi={opsiNilai.map((o) => ({ nilai: o, label: o }))} />
                  ) : (
                    <input
                      type={jenis === "tanggal" ? "date" : "text"}
                      inputMode={jenis === "angka" ? "numeric" : "text"}
                      className={jenis === "angka" ? "num" : ""}
                      value={s.nilai[0] ?? ""} placeholder="nilai"
                      onChange={(e) => ubahSyarat(i, { nilai: [e.target.value, s.nilai[1] ?? ""] })} />
                  )}

                  {s.operator === "antara" && (
                    <input className="num" placeholder="sampai" value={s.nilai[1] ?? ""}
                           onChange={(e) => ubahSyarat(i, { nilai: [s.nilai[0] ?? "", e.target.value] })} />
                  )}
                </div>

                <button className="isyarat-x" title="Hapus syarat"
                        onClick={() => onUbah({ syarat: k.syarat.filter((_, x) => x !== i) })}>×</button>
              </div>
            );
          })}

          <button className="btn ghost sm"
                  onClick={() => onUbah({
                    syarat: [...k.syarat, { kolom: "", operator: "sama", nilai: [] }],
                  })}>
            + Syarat
          </button>
          {!k.syarat.length && (
            <span className="faint small" style={{ marginLeft: 8 }}>
              tanpa syarat = seluruh baris milik orang itu
            </span>
          )}

          {/* Bobot pengakuan — hanya masuk akal untuk agregat yang
              menjumlahkan nilai kolom, bukan yang menghitung baris. */}
          {["SUM", "AVG"].includes(k.agregat) && k.kolom && (
            <div className="akui">
              <div className="akui-kepala">
                <span className="eyebrow">Pengakuan sebagian</span>
                {!akuiAktif ? (
                  <button className="btn ghost sm" disabled={sibuk}
                          onClick={() => onUbah({
                            pengakuan_kolom: k.pengakuan_kolom ?? "",
                            pengakuan: [{ nilai: "", persen: 100 }],
                          })}>
                    + Atur pengakuan
                  </button>
                ) : (
                  <button className="btn ghost sm" disabled={sibuk}
                          onClick={() => onUbah({ pengakuan_kolom: null, pengakuan: [] })}>
                    Hapus pengakuan
                  </button>
                )}
              </div>

              {!akuiAktif ? (
                <p className="faint small" style={{ margin: 0 }}>
                  Tanpa pengaturan ini, seluruh baris yang lolos syarat diakui 100%.
                  Pakai bila tiap nilai diakui berbeda — mis. BTC 50%, Lunas 80%.
                </p>
              ) : (
                <>
                  <div className="akui-penentu">
                    <span className="faint small">Persen ditentukan oleh kolom</span>
                    <Pilih nilai={k.pengakuan_kolom ?? ""}
                           onPilih={(v) => onUbah({ pengakuan_kolom: v })}
                           placeholder="pilih kolom penentu"
                           opsi={opsiKolom(kolom)} />
                  </div>

                  {(k.pengakuan ?? []).map((b, i) => (
                    <div className="akui-baris" key={i}>
                      <Pilih nilai={String(b.nilai)}
                             onPilih={(v) => ubahAkui(i, { nilai: v })}
                             placeholder="nilai"
                             bebas
                             opsi={(nilaiUnik[k.pengakuan_kolom ?? ""] ?? [])
                               .map((v) => ({ nilai: v, label: v }))} />
                      <div className="akui-persen">
                        <input type="number" value={String(b.persen)} min={0} max={1000}
                               onChange={(e) => ubahAkui(i, { persen: e.target.value })} />
                        <span className="faint">%</span>
                      </div>
                      <button className="ibtn" disabled={sibuk}
                              onClick={() => onUbah({
                                pengakuan: (k.pengakuan ?? []).filter((_, x) => x !== i),
                              })}>×</button>
                    </div>
                  ))}

                  <div className="akui-kaki">
                    <button className="btn ghost sm" disabled={sibuk}
                            onClick={() => onUbah({
                              pengakuan: [...(k.pengakuan ?? []), { nilai: "", persen: 100 }],
                            })}>
                      + Nilai
                    </button>
                    <span className="faint small">
                      Nilai yang tidak didaftarkan di sini diakui 0%.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
