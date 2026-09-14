import { q } from "./db";
import {
  daftarSumber, sumberUtama, penunjukKolom, gabungUntuk, type Sumber,
} from "./sumber";
import { RumusSalah, type Syarat } from "./rumus";

/**
 * Kolom turunan: kolom yang nilainya dihitung dari kolom lain.
 *
 * Berkas ini menyusun ekspresi CASE WHEN lalu menuliskan hasilnya ke kolom
 * fisik di data_mentah. Sama seperti lib/rumus.ts, di sinilah definisi
 * buatan admin berubah menjadi perintah database, jadi penjagaannya
 * dipusatkan di sini:
 *
 *   - Nama kolom hanya boleh berasal dari katalog `mentah_kolom`.
 *   - Nilai selalu lewat parameter, tidak pernah ditempel.
 *   - Mode SQL disaring token demi token: apa pun yang bukan kolom
 *     terdaftar, angka, teks berkutip, atau kata kunci yang diizinkan akan
 *     ditolak sebelum menyentuh database.
 */

export type CabangTurunan = {
  syarat: Syarat[];
  gabung: "dan" | "atau";
  nilai: string;
};

export type Turunan = {
  kolom: string;
  jenis: string;
  sumber: string;
  mode: "visual" | "sql";
  aturan: CabangTurunan[];
  nilai_lain: string | null;
  ekspresi_sql: string | null;
};

const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

/**
 * Kata kunci yang boleh muncul di mode SQL.
 *
 * Sengaja sesempit mungkin: cukup untuk menyatakan percabangan dan
 * aritmetika, tapi tidak cukup untuk membaca tabel lain, memanggil fungsi
 * sembarang, atau menyisipkan perintah kedua. Tidak ada SELECT, tidak ada
 * FROM, tidak ada tanda titik koma.
 */
const KATA_SAH = new Set([
  "case", "when", "then", "else", "end",
  "and", "or", "not", "is", "null", "in", "between", "like",
  "coalesce", "nullif", "greatest", "least",
  "abs", "round", "floor", "ceil",
  "true", "false",
]);

/** Fungsi yang boleh dipanggil — sama dengan yang ada di KATA_SAH. */
const SIMBOL_SAH = /^[(),+\-*/<>=!%.'"]+$/;

/**
 * Memeriksa ekspresi mode SQL.
 *
 * Pendekatannya daftar-putih: ekspresi dipecah jadi token, dan setiap
 * token harus salah satu dari — kolom terdaftar, angka, teks berkutip
 * tunggal, kata kunci yang diizinkan, atau simbol operator. Satu token
 * asing sudah cukup untuk menolak seluruh ekspresi. Cara ini lebih aman
 * daripada mencari pola berbahaya, karena yang tidak terpikirkan otomatis
 * ikut tertolak alih-alih lolos.
 */
export function periksaEkspresi(ekspresi: string, kolomSah: Set<string>): string[] {
  const salah: string[] = [];
  const teks = String(ekspresi ?? "");

  if (!teks.trim()) return ["Ekspresi masih kosong."];
  if (teks.includes(";")) salah.push('Tanda titik koma (";") tidak diizinkan.');
  if (/--|\/\*/.test(teks)) salah.push("Komentar SQL tidak diizinkan.");
  if (teks.length > 4000) salah.push("Ekspresi terlalu panjang (maksimal 4000 karakter).");

  // Teks berkutip dikeluarkan dulu agar isinya tidak ikut diperiksa sebagai
  // token — nama kota di dalam kutip bukan kolom yang harus terdaftar.
  const tanpaTeks = teks.replace(/'([^']|'')*'/g, " 'teks' ");

  const token = tanpaTeks.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(\.\d+)?|[^\sA-Za-z0-9_]/g) ?? [];
  for (const t of token) {
    if (/^\d/.test(t)) continue;                       // angka
    if (SIMBOL_SAH.test(t)) continue;                  // operator/tanda kurung
    const kecil = t.toLowerCase();
    if (KATA_SAH.has(kecil)) continue;                 // kata kunci
    if (kolomSah.has(kecil)) continue;                 // kolom terdaftar
    if (kecil === "teks") continue;                    // sisa penggantian di atas
    salah.push(`"${t}" bukan kolom terdaftar maupun kata kunci yang diizinkan.`);
  }
  return [...new Set(salah)];
}

/** Potongan WHERE satu syarat — cerminan potonganSyarat di lib/rumus.ts. */
function potongan(s: Syarat, kolomSql: string, params: any[]): string {
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const satu = () => s.nilai[0] ?? "";
  switch (s.operator) {
    case "kosong":        return `(${kolomSql} IS NULL OR ${kolomSql}::text = '')`;
    case "terisi":        return `(${kolomSql} IS NOT NULL AND ${kolomSql}::text <> '')`;
    case "sama":          return `${kolomSql}::text = ${p(satu())}`;
    case "tidak_sama":    return `(${kolomSql} IS NULL OR ${kolomSql}::text <> ${p(satu())})`;
    case "termasuk":      return `${kolomSql}::text = ANY(${p(s.nilai)}::text[])`;
    case "tidak_termasuk":
      return `(${kolomSql} IS NULL OR NOT (${kolomSql}::text = ANY(${p(s.nilai)}::text[])))`;
    case "mengandung":    return `${kolomSql}::text ILIKE ${p("%" + satu() + "%")}`;
    case "lebih":         return `${kolomSql} > ${p(satu())}`;
    case "lebih_sama":    return `${kolomSql} >= ${p(satu())}`;
    case "kurang":        return `${kolomSql} < ${p(satu())}`;
    case "kurang_sama":   return `${kolomSql} <= ${p(satu())}`;
    case "antara":
      return `${kolomSql} BETWEEN ${p(s.nilai[0] ?? "")} AND ${p(s.nilai[1] ?? "")}`;
    default:
      throw new RumusSalah(`Operator "${s.operator}" tidak dikenal.`);
  }
}

type Katalog = {
  /** kolom -> kode sumber, sesuai registri sumber_data */
  sumber: Map<string, string>;
  peta: Map<string, Sumber>;
  utama: Sumber;
};

async function katalog(): Promise<Katalog> {
  const [rows, daftar] = await Promise.all([
    q<{ kolom: string; sumber: string }>(
      `SELECT kolom, COALESCE(sumber,'api') AS sumber FROM mentah_kolom`),
    daftarSumber(),
  ]);
  return {
    sumber: new Map(rows.map((r) => [r.kolom, r.sumber])),
    peta: new Map(daftar.map((s) => [s.kode, s])),
    utama: sumberUtama(daftar),
  };
}

/** Nama kolom berkualifikasi tabel, sekaligus mencatat sumber yang dipakai. */
function penunjuk(kat: Katalog, kode: string, dipakai: Set<string>): string {
  const s = kat.sumber.get(kode);
  if (!s) throw new RumusSalah(`Kolom "${kode}" tidak ada di katalog.`);
  dipakai.add(s);
  return penunjukKolom(kode, s, kat.utama.kode);
}

/** Ekspresi CASE WHEN dari definisi mode visual. */
function ekspresiVisual(
  t: Turunan, kat: Katalog, params: any[], dipakai: Set<string>,
): string {
  if (!t.aturan.length) throw new RumusSalah("Kolom turunan belum punya satu pun aturan.");

  const cabang = t.aturan.map((c) => {
    if (!c.syarat.length) throw new RumusSalah("Ada aturan yang belum punya syarat.");
    const bagian = c.syarat.map((s) =>
      potongan(s, penunjuk(kat, s.kolom, dipakai), params));
    const gabung = c.gabung === "atau" ? " OR " : " AND ";
    params.push(c.nilai);
    return `WHEN ${bagian.join(gabung)} THEN $${params.length}`;
  });

  params.push(t.nilai_lain ?? null);
  return `CASE ${cabang.join(" ")} ELSE $${params.length} END`;
}

/**
 * Menghitung ulang satu kolom turunan untuk seluruh baris data mentah.
 *
 * Dijalankan seusai menarik data, atau saat admin menekan Hitung ulang.
 * Kegagalan satu kolom dicatat di barisnya sendiri dan tidak menghentikan
 * kolom lain — satu definisi yang keliru tidak boleh membuat seluruh
 * proses berhenti.
 */
export async function hitungTurunan(t: Turunan): Promise<number> {
  if (!POLA_KOLOM.test(t.kolom)) throw new RumusSalah("Nama kolom turunan tidak sah.");
  const kat = await katalog();
  const dipakai = new Set<string>();
  const params: any[] = [];

  let ekspresi: string;
  if (t.mode === "sql") {
    const salah = periksaEkspresi(t.ekspresi_sql ?? "", new Set(kat.sumber.keys()));
    if (salah.length) throw new RumusSalah(salah.join(" "));
    // Kolom di ekspresi ditulis tanpa awalan tabel oleh admin; di sini
    // diberi awalan sesuai sumbernya masing-masing.
    ekspresi = (t.ekspresi_sql ?? "").replace(
      /[A-Za-z_][A-Za-z0-9_]*/g,
      (m) => {
        const kecil = m.toLowerCase();
        if (!kat.sumber.has(kecil) || KATA_SAH.has(kecil)) return m;
        return penunjuk(kat, kecil, dipakai);
      });
  } else {
    ekspresi = ekspresiVisual(t, kat, params, dipakai);
  }

  const tipe = t.jenis === "angka" ? "::numeric"
             : t.jenis === "tanggal" ? "::date" : "::text";

  // Kolom turunan hanya boleh berada di data utama: menuliskannya ke sumber
  // tambahan akan membuat penggabungan berputar pada dirinya sendiri.
  if ((kat.sumber.get(t.kolom) ?? kat.utama.kode) !== kat.utama.kode) {
    throw new RumusSalah("Kolom turunan harus berada di sumber data utama.");
  }

  /**
   * Penggabungan memakai LEFT JOIN lewat baris bayangan, bukan
   * `UPDATE ... FROM <tabel sumber>` langsung.
   *
   * Bentuk langsung itu bersifat INNER JOIN: kontrak yang belum ada di
   * sumber tambahan tidak akan tersentuh sama sekali, sehingga kolom
   * turunannya tetap kosong alih-alih memakai cabang ELSE. Kekeliruan itu
   * sangat sulit disadari — kolomnya terisi untuk sebagian besar baris,
   * dan yang kosong terlihat seperti data yang memang belum lengkap.
   *
   * Klausa gabungnya dirakit dari registri, jadi kolom turunan yang
   * memakai API kedua ikut bekerja tanpa perubahan di sini.
   */
  const gabung = gabungUntuk(dipakai, kat.peta, kat.utama, "src");
  const sql = gabung
    ? `UPDATE ${kat.utama.tabel} dm
          SET "${t.kolom}" = (${ekspresi})${tipe}
         FROM ${kat.utama.tabel} src${gabung}
        WHERE src.id = dm.id`
    : `UPDATE ${kat.utama.tabel} dm SET "${t.kolom}" = (${ekspresi})${tipe}`;

  const hasil = await q<any>(sql + ` RETURNING 1`, params);
  return hasil.length;
}

/** Seluruh kolom turunan yang terdaftar. */
export async function daftarTurunan(): Promise<Turunan[]> {
  const rows = await q<any>(
    `SELECT t.kolom, t.mode, t.aturan, t.nilai_lain, t.ekspresi_sql,
            m.jenis, COALESCE(m.sumber,'api') AS sumber
       FROM kolom_turunan t
       JOIN mentah_kolom m ON m.kolom = t.kolom
      ORDER BY t.kolom`);
  return rows.map((r) => ({
    kolom: r.kolom, jenis: r.jenis, sumber: r.sumber,
    mode: r.mode, aturan: r.aturan ?? [],
    nilai_lain: r.nilai_lain, ekspresi_sql: r.ekspresi_sql,
  }));
}

/**
 * Menghitung ulang seluruh kolom turunan.
 *
 * Mengembalikan ringkasan alih-alih melempar, karena pemanggilnya
 * (penarikan API) perlu tetap menyelesaikan pekerjaannya walau ada satu
 * definisi yang keliru.
 */
export async function hitungSemuaTurunan() {
  let berhasil = 0;
  const gagal: { kolom: string; pesan: string }[] = [];

  for (const t of await daftarTurunan()) {
    try {
      const baris = await hitungTurunan(t);
      berhasil++;
      await q(
        `UPDATE kolom_turunan
            SET dihitung_pada = now(), baris_terisi = $2, galat = NULL
          WHERE kolom = $1`, [t.kolom, baris]);
    } catch (e: any) {
      const pesan = e?.message ?? "Gagal menghitung.";
      gagal.push({ kolom: t.kolom, pesan });
      await q(
        `UPDATE kolom_turunan
            SET dihitung_pada = now(), galat = $2 WHERE kolom = $1`,
        [t.kolom, pesan]);
    }
  }
  return { berhasil, gagal };
}
