/**
 * Penerjemah rumus indikator menjadi SQL.
 *
 * Berkas ini memegang satu-satunya tempat di mana definisi buatan admin
 * berubah menjadi perintah database, jadi seluruh penjagaannya dipusatkan
 * di sini:
 *
 *   - Nama kolom TIDAK PERNAH datang dari masukan pengguna. Kolom hanya
 *     boleh berasal dari katalog `mentah_kolom`, dan dicocokkan ke daftar
 *     itu sebelum ditempel ke teks SQL.
 *   - Nilai TIDAK PERNAH ditempel ke teks SQL. Semuanya lewat parameter,
 *     termasuk isi larik pada operator "termasuk salah satu dari".
 *   - Operator dipetakan dari daftar tetap, bukan diteruskan apa adanya.
 *
 * Tanpa dua aturan pertama, seorang admin yang berniat jahat — atau kolom
 * yang salah ketik — bisa menyisipkan perintah sembarangan ke database.
 */

export type Syarat = {
  kolom: string;
  operator: string;
  nilai: string[];
};

/** Satu pasangan nilai → persen pengakuan, mis. { nilai: "BTC", persen: 50 }. */
export type Pengakuan = {
  nilai: string;
  persen: number;
};

export type Komponen = {
  agregat: string;
  kolom: string | null;
  operator_sebelum: string | null;
  gabung_syarat: "dan" | "atau";
  syarat: Syarat[];
  /** Kolom penentu bobot pengakuan (mis. od_movement). Kosong = diakui penuh. */
  pengakuan_kolom?: string | null;
  pengakuan?: Pengakuan[];
};

export type Rumus = {
  komponen: Komponen[];
  kali_seratus: boolean;
};

/** Agregat yang dikenal. Selain ini ditolak. */
const AGREGAT: Record<string, (k: string) => string> = {
  SUM: (k) => `SUM(${k})`,
  AVG: (k) => `AVG(${k})`,
  MIN: (k) => `MIN(${k})`,
  MAX: (k) => `MAX(${k})`,
  COUNT: (k) => (k ? `COUNT(${k})` : `COUNT(*)`),
  COUNT_DISTINCT: (k) => `COUNT(DISTINCT ${k})`,
};

const PENGHUBUNG = new Set(["+", "-", "*", "/"]);

export class RumusSalah extends Error {}

/**
 * Membangun potongan WHERE untuk satu syarat.
 *
 * Mengembalikan teks berisi placeholder ($1, $2, ...) dan menambahkan
 * nilainya ke `params`. Nomor placeholder mengikuti panjang params saat itu,
 * sehingga potongan-potongan bisa disusun berurutan tanpa saling menimpa.
 */
function potonganSyarat(s: Syarat, kolomSql: string, params: any[]): string {
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const satu = () => s.nilai[0] ?? "";

  switch (s.operator) {
    case "kosong":
      return `(${kolomSql} IS NULL OR ${kolomSql}::text = '')`;
    case "terisi":
      return `(${kolomSql} IS NOT NULL AND ${kolomSql}::text <> '')`;

    case "sama":
      return `${kolomSql}::text = ${p(satu())}`;
    case "tidak_sama":
      return `(${kolomSql} IS NULL OR ${kolomSql}::text <> ${p(satu())})`;

    // Inilah yang menampung "OD Movement bernilai Out NPF, BTC, Tarik,
    // atau Lunas". Seluruh larik masuk sebagai SATU parameter, jadi
    // jumlah nilainya tidak mengubah bentuk perintah.
    case "termasuk":
      return `${kolomSql}::text = ANY(${p(s.nilai)}::text[])`;
    case "tidak_termasuk":
      return `(${kolomSql} IS NULL OR NOT (${kolomSql}::text = ANY(${p(s.nilai)}::text[])))`;

    case "mengandung":
      return `${kolomSql}::text ILIKE ${p("%" + satu() + "%")}`;

    case "lebih":       return `${kolomSql} > ${p(satu())}`;
    case "lebih_sama":  return `${kolomSql} >= ${p(satu())}`;
    case "kurang":      return `${kolomSql} < ${p(satu())}`;
    case "kurang_sama": return `${kolomSql} <= ${p(satu())}`;

    case "antara":
      return `${kolomSql} BETWEEN ${p(s.nilai[0] ?? "")} AND ${p(s.nilai[1] ?? "")}`;

    default:
      throw new RumusSalah(`Operator "${s.operator}" tidak dikenal.`);
  }
}

/**
 * Satu komponen menjadi satu ekspresi agregat.
 *
 * Syaratnya dipasang lewat klausa FILTER, bukan CASE WHEN di dalam agregat.
 * Hasilnya sama, tapi FILTER membuat tiap komponen berdiri sendiri sehingga
 * beberapa komponen dengan syarat berbeda bisa dihitung dalam satu kali
 * pembacaan tabel.
 */
function potonganKomponen(
  k: Komponen,
  kolomSah: (kode: string) => string,
  params: any[],
): string {
  const buat = AGREGAT[k.agregat];
  if (!buat) throw new RumusSalah(`Agregat "${k.agregat}" tidak dikenal.`);

  if (k.agregat !== "COUNT" && !k.kolom) {
    throw new RumusSalah(`Agregat ${k.agregat} butuh kolom sumber.`);
  }

  const kolomSql = k.kolom ? kolomSah(k.kolom) : "";

  /**
   * Bobot pengakuan: kolom yang diagregasi dikalikan persen yang bergantung
   * pada nilai kolom penentu. Nilai dan persennya tetap lewat parameter —
   * aturan "tidak pernah menempel masukan pengguna ke SQL" berlaku sama di
   * sini. Nilai yang tidak terdaftar jatuh ke ELSE 0: menambah nilai baru
   * di data sumber tidak boleh diam-diam ikut terhitung penuh.
   */
  let diagregasi = kolomSql;
  const bobot = k.pengakuan ?? [];
  if (k.pengakuan_kolom && bobot.length) {
    if (!["SUM", "AVG"].includes(k.agregat)) {
      throw new RumusSalah(
        `Bobot pengakuan hanya bisa dipakai pada SUM atau AVG, bukan ${k.agregat}.`);
    }
    if (!k.kolom) throw new RumusSalah("Bobot pengakuan butuh kolom sumber.");

    const penentu = kolomSah(k.pengakuan_kolom);
    const cabang = bobot.map((b) => {
      if (!Number.isFinite(b.persen)) {
        throw new RumusSalah(`Persen pengakuan untuk "${b.nilai}" bukan angka.`);
      }
      params.push(b.nilai);
      const pNilai = `$${params.length}`;
      params.push(b.persen / 100);
      const pPersen = `$${params.length}`;
      return `WHEN ${penentu}::text = ${pNilai} THEN ${pPersen}::numeric`;
    });
    diagregasi = `(${kolomSql} * (CASE ${cabang.join(" ")} ELSE 0 END))`;
  }

  let ekspresi = buat(diagregasi);

  if (k.syarat.length) {
    const bagian = k.syarat.map((s) => potonganSyarat(s, kolomSah(s.kolom), params));
    const gabung = k.gabung_syarat === "atau" ? " OR " : " AND ";
    ekspresi += ` FILTER (WHERE ${bagian.join(gabung)})`;
  }

  return `COALESCE(${ekspresi}, 0)`;
}

/**
 * Rumus lengkap menjadi satu ekspresi SQL.
 *
 * Komponen dirangkai dari kiri ke kanan apa adanya — tanpa kurung, tanpa
 * prioritas perkalian atas penjumlahan. Ini keputusan sadar: rumus KPI di
 * sini selalu berbentuk rata, dan urutan yang mengikuti susunan kartu di
 * layar lebih mudah dipahami admin daripada aturan prioritas tersembunyi
 * yang membuat hasilnya berbeda dari yang terbaca.
 *
 * Pembagian dibungkus NULLIF supaya penyebut nol menghasilkan kosong, bukan
 * menggagalkan seluruh kueri.
 */
export function susunRumus(
  r: Rumus,
  kolomSah: (kode: string) => string,
  params: any[],
): string {
  if (!r.komponen.length) throw new RumusSalah("Rumus belum punya komponen.");

  let sql = potonganKomponen(r.komponen[0], kolomSah, params);

  for (let i = 1; i < r.komponen.length; i++) {
    const k = r.komponen[i];
    const op = k.operator_sebelum;
    if (!op || !PENGHUBUNG.has(op)) {
      throw new RumusSalah(`Komponen ke-${i + 1} belum punya operator penghubung.`);
    }
    const kanan = potonganKomponen(k, kolomSah, params);
    sql = op === "/"
      ? `(${sql}) / NULLIF(${kanan}, 0)`
      : `(${sql}) ${op} (${kanan})`;
  }

  if (r.kali_seratus) sql = `(${sql}) * 100`;
  return sql;
}

/**
 * Bentuk rumus sebagai kalimat, untuk ditampilkan di layar dan disimpan
 * sebagai catatan pada baris hasil. Tanpa ini, admin yang melihat angka
 * ganjil tidak punya cara memeriksa rumus mana yang menghasilkannya.
 */
export function bacaRumus(r: Rumus, labelKolom: (k: string) => string): string {
  const bagian = r.komponen.map((k, i) => {
    const inti = k.kolom ? `${k.agregat} ${labelKolom(k.kolom)}` : "COUNT baris";
    // Bobot pengakuan ikut ditulis supaya angka ganjil bisa ditelusuri
    // sampai ke persen yang menyebabkannya, bukan berhenti di nama kolom.
    const akui = k.pengakuan_kolom && k.pengakuan?.length
      ? ` {diakui menurut ${labelKolom(k.pengakuan_kolom)}: ` +
        k.pengakuan.map((b) => `${b.nilai} ${b.persen}%`).join(", ") + "}"
      : "";
    const syarat = k.syarat.length
      ? " [" + k.syarat.map((s) => `${labelKolom(s.kolom)} ${s.operator} ${s.nilai.join("/")}`)
          .join(k.gabung_syarat === "atau" ? " atau " : " dan ") + "]"
      : "";
    return (i === 0 ? "" : ` ${k.operator_sebelum} `) + inti + akui + syarat;
  });
  return bagian.join("") + (r.kali_seratus ? " × 100%" : "");
}
