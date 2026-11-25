import { randomUUID } from "crypto";
import { q, sql } from "./db";

/**
 * Tabel parameter: nilai rupiah yang dicari dari kombinasi beberapa sumbu
 * (lihat db/schema-param-tabel-v34.sql).
 *
 * Editor bekerja dengan satu DOKUMEN utuh per versi tabel: sumbu, band, dan
 * sel disimpan sekaligus dalam satu transaksi. Band diberi kunci sementara
 * `k` di sisi layar; sel merujuk band lewat kunci itu, lalu server
 * menggantinya dengan id baru saat menyimpan. Dengan begitu menambah,
 * menghapus, atau mengubah sumbu tidak pernah meninggalkan sel yatim.
 */

export type Band = {
  k: string;
  label: string;
  nilai_teks: string[];
  nilai_min: number | null;
  nilai_max: number | null;
  min_inklusif: boolean;
  max_inklusif: boolean;
};

export type Dimensi = {
  k: string;
  kode: string;
  label: string;
  kolom_sumber: string | null;
  jenis: "kategori" | "rentang";
  band: Band[];
};

export type Sel = { band: string[]; nominal: number };

export type Dokumen = {
  id: string | null;
  kode: string;
  nama: string;
  produk: string | null;
  berlaku_mulai: string;
  keterangan: string | null;
  aktif: boolean;
  dimensi: Dimensi[];
  sel: Sel[];
};

export class ParamSalah extends Error {}

const POLA_KODE = /^[a-z][a-z0-9_]{0,60}$/;
const POLA_KODE_DIM = /^[a-z][a-z0-9_]{0,40}$/;
const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Daftar seluruh versi tabel, dengan ringkasan isi dan pemakainya. */
export async function daftarTabel() {
  return q<any>(
    `SELECT t.id, t.kode, t.nama, t.produk, to_char(t.berlaku_mulai, 'YYYY-MM-DD') AS berlaku_mulai,
            t.aktif, t.keterangan,
            (SELECT COUNT(*)::int FROM param_dimensi d WHERE d.tabel_id = t.id) AS jml_dimensi,
            (SELECT COUNT(*)::int FROM param_sel s WHERE s.tabel_id = t.id) AS jml_sel,
            (SELECT COUNT(*)::int FROM param_dimensi d
              WHERE d.tabel_id = t.id AND d.kolom_sumber IS NULL) AS dimensi_tanpa_kolom,
            (SELECT COALESCE(json_agg(kt.kolom ORDER BY kt.kolom), '[]'::json)
               FROM kolom_turunan kt WHERE kt.mode = 'tabel' AND kt.param_kode = t.kode) AS dipakai
       FROM param_tabel t
      ORDER BY t.kode, t.berlaku_mulai DESC`);
}

/** Satu versi tabel sebagai dokumen utuh. */
export async function muatDokumen(id: string): Promise<Dokumen | null> {
  const [t] = await q<any>(
    `SELECT id, kode, nama, produk, to_char(berlaku_mulai, 'YYYY-MM-DD') AS berlaku_mulai,
            keterangan, aktif
       FROM param_tabel WHERE id = $1`, [id]);
  if (!t) return null;

  const [dims, bands, sels] = await Promise.all([
    q<any>(`SELECT id, kode, label, kolom_sumber, jenis FROM param_dimensi
             WHERE tabel_id = $1 ORDER BY urutan`, [id]),
    q<any>(`SELECT b.* FROM param_band b JOIN param_dimensi d ON d.id = b.dimensi_id
             WHERE d.tabel_id = $1 ORDER BY b.urutan`, [id]),
    q<any>(`SELECT kunci, nominal FROM param_sel WHERE tabel_id = $1`, [id]),
  ]);

  const dimensi: Dimensi[] = dims.map((d) => ({
    k: d.id, kode: d.kode, label: d.label, kolom_sumber: d.kolom_sumber, jenis: d.jenis,
    band: bands.filter((b) => b.dimensi_id === d.id).map((b) => ({
      k: b.id, label: b.label, nilai_teks: b.nilai_teks ?? [],
      nilai_min: num(b.nilai_min), nilai_max: num(b.nilai_max),
      min_inklusif: b.min_inklusif, max_inklusif: b.max_inklusif,
    })),
  }));

  const sel: Sel[] = [];
  for (const s of sels) {
    const band = dimensi.map((d) => String(s.kunci?.[d.k] ?? ""));
    if (band.every(Boolean)) sel.push({ band, nominal: Number(s.nominal) });
  }

  return { ...t, produk: t.produk ?? null, keterangan: t.keterangan ?? null, dimensi, sel };
}

/** Dua band rentang tumpang tindih? Batas inklusif ikut diperhitungkan. */
function tumpang(a: Band, b: Band): boolean {
  // a berada seluruhnya di bawah b?
  const aDiBawah = a.nilai_max !== null && b.nilai_min !== null &&
    (a.nilai_max < b.nilai_min ||
     (a.nilai_max === b.nilai_min && !(a.max_inklusif && b.min_inklusif)));
  const bDiBawah = b.nilai_max !== null && a.nilai_min !== null &&
    (b.nilai_max < a.nilai_min ||
     (b.nilai_max === a.nilai_min && !(b.max_inklusif && a.min_inklusif)));
  return !(aDiBawah || bDiBawah);
}

/** Memeriksa dokumen dan mengembalikan versi bersihnya. */
async function periksa(doc: Dokumen): Promise<Dokumen> {
  const kode = String(doc.kode ?? "").trim().toLowerCase();
  if (!POLA_KODE.test(kode)) {
    throw new ParamSalah("Kode tabel hanya huruf kecil, angka, dan garis bawah (mis. insentif_penyelesaian_r2).");
  }
  const nama = String(doc.nama ?? "").trim();
  if (nama.length < 2) throw new ParamSalah("Nama tabel belum diisi.");
  const berlaku = String(doc.berlaku_mulai ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-01$/.test(berlaku)) throw new ParamSalah("Berlaku mulai harus tanggal 1 sebuah bulan.");

  const dims = Array.isArray(doc.dimensi) ? doc.dimensi : [];
  if (!dims.length) throw new ParamSalah("Tabel belum punya sumbu.");

  const katalog = new Set((await q<{ kolom: string }>(`SELECT kolom FROM mentah_kolom`)).map((r) => r.kolom));
  const kodeDim = new Set<string>();
  const semuaK = new Set<string>();

  const dimensi: Dimensi[] = dims.map((d, i) => {
    const nomor = `Sumbu ke-${i + 1}`;
    const kd = String(d.kode ?? "").trim().toLowerCase();
    if (!POLA_KODE_DIM.test(kd)) throw new ParamSalah(`${nomor}: kode hanya huruf kecil, angka, dan garis bawah.`);
    if (kodeDim.has(kd)) throw new ParamSalah(`${nomor}: kode "${kd}" dipakai lebih dari sekali.`);
    kodeDim.add(kd);
    const label = String(d.label ?? "").trim();
    if (!label) throw new ParamSalah(`${nomor}: label belum diisi.`);
    const jenis = d.jenis === "kategori" ? "kategori" : "rentang";
    const kolom = d.kolom_sumber ? String(d.kolom_sumber) : null;
    if (kolom && !katalog.has(kolom)) throw new ParamSalah(`${label}: kolom "${kolom}" tidak ada di katalog kolom.`);

    const band: Band[] = (Array.isArray(d.band) ? d.band : []).map((b, j) => {
      const k = String(b.k ?? "");
      if (!k || semuaK.has(k)) throw new ParamSalah(`${label}: band ke-${j + 1} tidak punya kunci yang unik.`);
      semuaK.add(k);
      const lb = String(b.label ?? "").trim();
      if (!lb) throw new ParamSalah(`${label}: band ke-${j + 1} belum diberi label.`);
      const teks = (Array.isArray(b.nilai_teks) ? b.nilai_teks : [])
        .map((x) => String(x).trim()).filter(Boolean);
      const mn = num(b.nilai_min), mx = num(b.nilai_max);
      if (jenis === "kategori" && !teks.length) {
        throw new ParamSalah(`${label} — ${lb}: isi minimal satu nilai teks yang dicocokkan.`);
      }
      if (jenis === "rentang") {
        if ((mn !== null && !Number.isFinite(mn)) || (mx !== null && !Number.isFinite(mx))) {
          throw new ParamSalah(`${label} — ${lb}: batas harus angka.`);
        }
        if (mn !== null && mx !== null && mn > mx) {
          throw new ParamSalah(`${label} — ${lb}: batas bawah lebih besar dari batas atas.`);
        }
      }
      return {
        k, label: lb,
        nilai_teks: jenis === "kategori" ? teks : [],
        nilai_min: jenis === "rentang" ? mn : null,
        nilai_max: jenis === "rentang" ? mx : null,
        min_inklusif: b.min_inklusif !== false,
        max_inklusif: b.max_inklusif === true,
      };
    });
    if (!band.length) throw new ParamSalah(`${label}: belum punya band.`);

    // Band yang tumpang tindih membuat satu nilai cocok di dua tempat --
    // mesin akan diam-diam memakai yang pertama. Ditolak di sini.
    if (jenis === "rentang") {
      for (let a = 0; a < band.length; a++) {
        for (let b = a + 1; b < band.length; b++) {
          if (tumpang(band[a], band[b])) {
            throw new ParamSalah(`${label}: band "${band[a].label}" dan "${band[b].label}" tumpang tindih.`);
          }
        }
      }
    } else {
      const lihat = new Map<string, string>();
      for (const b of band) for (const t of b.nilai_teks) {
        const kunci = t.toUpperCase();
        if (lihat.has(kunci)) {
          throw new ParamSalah(`${label}: nilai "${t}" ada di band "${lihat.get(kunci)}" dan "${b.label}".`);
        }
        lihat.set(kunci, b.label);
      }
    }
    return { k: String(d.k ?? randomUUID()), kode: kd, label, kolom_sumber: kolom, jenis, band };
  });

  // Sel: satu band per sumbu, urut sesuai sumbu. Kombinasi yang tidak
  // lengkap (mis. sisa dari band yang dihapus) dibuang; yang ganda dipakai
  // yang terakhir.
  const peta = new Map<string, Sel>();
  for (const s of Array.isArray(doc.sel) ? doc.sel : []) {
    const band = Array.isArray(s.band) ? s.band.map(String) : [];
    if (band.length !== dimensi.length) continue;
    if (!band.every((k, i) => dimensi[i].band.some((b) => b.k === k))) continue;
    const nominal = Number(s.nominal);
    if (!Number.isFinite(nominal) || nominal < 0) {
      throw new ParamSalah("Nilai sel harus angka 0 atau lebih.");
    }
    peta.set(band.join("|"), { band, nominal });
  }

  return {
    id: doc.id ? String(doc.id) : null, kode, nama,
    produk: doc.produk ? String(doc.produk).toUpperCase() : null,
    berlaku_mulai: berlaku,
    keterangan: doc.keterangan ? String(doc.keterangan).trim() || null : null,
    aktif: doc.aktif !== false,
    dimensi, sel: Array.from(peta.values()),
  };
}

/** Menyimpan satu versi tabel utuh dalam satu transaksi. Mengembalikan id. */
export async function simpanDokumen(masuk: Dokumen): Promise<string> {
  const doc = await periksa(masuk);

  const [bentrok] = await q<any>(
    `SELECT id FROM param_tabel WHERE kode = $1 AND berlaku_mulai = $2::date AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [doc.kode, doc.berlaku_mulai, doc.id]);
  if (bentrok) {
    throw new ParamSalah(`Tabel "${doc.kode}" sudah punya versi yang berlaku mulai ${doc.berlaku_mulai}.`);
  }

  const id = doc.id ?? randomUUID();
  if (doc.id) {
    const [ada] = await q<any>(`SELECT kode FROM param_tabel WHERE id = $1`, [doc.id]);
    if (!ada) throw new ParamSalah("Tabel tidak ditemukan.");
    if (ada.kode !== doc.kode) throw new ParamSalah("Kode tabel tidak bisa diubah setelah dibuat.");
  }

  // Id baru untuk setiap sumbu dan band; peta kunci layar -> id database.
  const idDim = new Map(doc.dimensi.map((d) => [d.k, randomUUID()]));
  const idBand = new Map<string, string>();
  for (const d of doc.dimensi) for (const b of d.band) idBand.set(b.k, randomUUID());

  const baris_dim = doc.dimensi.map((d, i) => ({
    id: idDim.get(d.k), urutan: i, kode: d.kode, label: d.label,
    kolom_sumber: d.kolom_sumber, jenis: d.jenis,
  }));
  const baris_band = doc.dimensi.flatMap((d) => d.band.map((b, j) => ({
    id: idBand.get(b.k), dimensi_id: idDim.get(d.k), urutan: j, label: b.label,
    nilai_teks: b.nilai_teks.length ? b.nilai_teks : null,
    nilai_min: b.nilai_min, nilai_max: b.nilai_max,
    min_inklusif: b.min_inklusif, max_inklusif: b.max_inklusif,
  })));
  const baris_sel = doc.sel.map((s) => ({
    kunci: Object.fromEntries(doc.dimensi.map((d, i) => [idDim.get(d.k), idBand.get(s.band[i])])),
    nominal: s.nominal,
  }));

  const perintah: any[] = doc.id
    ? [
        sql(`DELETE FROM param_sel WHERE tabel_id = $1`, [id]),
        sql(`DELETE FROM param_dimensi WHERE tabel_id = $1`, [id]),
        sql(`UPDATE param_tabel
                SET nama = $2, produk = $3, berlaku_mulai = $4::date, keterangan = $5,
                    aktif = $6, diperbarui = now()
              WHERE id = $1`,
            [id, doc.nama, doc.produk, doc.berlaku_mulai, doc.keterangan, doc.aktif]),
      ]
    : [
        sql(`INSERT INTO param_tabel (id, kode, nama, produk, berlaku_mulai, keterangan, aktif)
             VALUES ($1,$2,$3,$4,$5::date,$6,$7)`,
            [id, doc.kode, doc.nama, doc.produk, doc.berlaku_mulai, doc.keterangan, doc.aktif]),
      ];

  perintah.push(
    sql(`INSERT INTO param_dimensi (id, tabel_id, urutan, kode, label, kolom_sumber, jenis)
         SELECT x.id, $1, x.urutan, x.kode, x.label, x.kolom_sumber, x.jenis
           FROM jsonb_to_recordset($2::jsonb)
                AS x(id uuid, urutan int, kode text, label text, kolom_sumber text, jenis text)`,
        [id, JSON.stringify(baris_dim)]),
    sql(`INSERT INTO param_band (id, dimensi_id, urutan, label, nilai_teks,
                                 nilai_min, nilai_max, min_inklusif, max_inklusif)
         SELECT x.id, x.dimensi_id, x.urutan, x.label, x.nilai_teks,
                x.nilai_min, x.nilai_max, x.min_inklusif, x.max_inklusif
           FROM jsonb_to_recordset($1::jsonb)
                AS x(id uuid, dimensi_id uuid, urutan int, label text, nilai_teks text[],
                     nilai_min numeric, nilai_max numeric, min_inklusif boolean, max_inklusif boolean)`,
        [JSON.stringify(baris_band)]),
  );
  if (baris_sel.length) {
    perintah.push(
      sql(`INSERT INTO param_sel (tabel_id, kunci, nominal)
           SELECT $1, x.kunci, x.nominal
             FROM jsonb_to_recordset($2::jsonb) AS x(kunci jsonb, nominal numeric)`,
          [id, JSON.stringify(baris_sel)]));
  }

  await sql.transaction(perintah);
  return id;
}

/** Menyalin satu versi menjadi versi baru dengan tanggal berlaku lain. */
export async function salinVersi(id: string, berlakuMulai: string): Promise<string> {
  const doc = await muatDokumen(id);
  if (!doc) throw new ParamSalah("Tabel sumber tidak ditemukan.");
  return simpanDokumen({ ...doc, id: null, berlaku_mulai: berlakuMulai });
}

/** Menghapus satu versi. Versi terakhir dari kode yang dipakai kolom turunan ditolak. */
export async function hapusVersi(id: string) {
  const [t] = await q<any>(`SELECT kode FROM param_tabel WHERE id = $1`, [id]);
  if (!t) throw new ParamSalah("Tabel tidak ditemukan.");
  const [{ n }] = await q<any>(`SELECT COUNT(*)::int AS n FROM param_tabel WHERE kode = $1`, [t.kode]);
  const pemakai = await q<any>(
    `SELECT kolom FROM kolom_turunan WHERE mode = 'tabel' AND param_kode = $1`, [t.kode]);
  if (n <= 1 && pemakai.length) {
    throw new ParamSalah(
      `Ini versi terakhir tabel "${t.kode}" dan masih dipakai kolom turunan: ` +
      `${pemakai.map((p) => p.kolom).join(", ")}. Lepas dulu dari kolom turunannya.`);
  }
  await q(`DELETE FROM param_tabel WHERE id = $1`, [id]);
  return t.kode as string;
}
