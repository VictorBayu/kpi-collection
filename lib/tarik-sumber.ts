import { q, sql } from "./db";
import { satuSumber, POLA_NAMA, SumberSalah, type Sumber } from "./sumber";
import { tanggalHariIni } from "./tarik-api";

/**
 * Penarik untuk sumber API tambahan.
 *
 * Bedanya dengan lib/tarik-api.ts: penarik itu tahu persis bentuk satu
 * endpoint — 76 kolom inti, nama fieldnya, dan seluk-beluk pagingnya
 * ditulis di kode. Berkas ini sebaliknya tidak tahu apa-apa soal API yang
 * ditariknya; semua dibaca dari registri sumber_data yang diisi admin:
 * alamat, header, cara paging, jalur larik data di dalam respons, dan
 * pemetaan tiap kolom lewat field_api di katalog kolom.
 *
 * Konsekuensinya disengaja: menambah API ketiga tidak perlu menyentuh
 * berkas ini sama sekali.
 *
 * SEMUA ATAU TIDAK SAMA SEKALI, seperti penarik utama. Baris ditumpuk ke
 * meja sementara dulu; isinya baru dipindahkan kalau seluruh cabang dan
 * seluruh halamannya berhasil. Data setengah jalan yang diam-diam
 * menggantikan data kemarin jauh lebih berbahaya daripada penarikan yang
 * batal terang-terangan.
 */

const COBA_ULANG = 2;
const JEDA_MS = 800;
const SEKALIGUS = 4;
const BARIS_PER_INSERT = 100;
const MAKS_HALAMAN = 500;
const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

export type HasilTarikSumber = {
  berhasil: boolean;
  baris: number;
  cabangDiminta: number;
  cabangSukses: number;
  durasiMs: number;
  pesan: string | null;
};

type Baris = Record<string, any>;
type KolomSumber = { kolom: string; jenis: string; field_api: string | null };

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

const angka = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const teks = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
};

const tanggal = (v: any): string | null => {
  const s = teks(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * Menelusuri jalur bertitik di dalam respons, mis. "result.rows".
 *
 * Kosong berarti responsnya sendiri yang berupa larik. Kalau jalurnya
 * tidak ketemu, dicoba beberapa nama yang lazim sebelum menyerah — bukan
 * untuk menebak-nebak, tapi supaya admin yang belum mengisi jalur_data
 * tetap bisa menguji koneksinya lebih dulu.
 */
function telusuri(j: any, jalur: string | null): any {
  if (!jalur) return j;
  let kini = j;
  for (const bagian of jalur.split(".")) {
    if (kini === null || kini === undefined) return undefined;
    kini = kini[bagian];
  }
  return kini;
}

function bacaBaris(j: any, s: Sumber): Baris[] {
  const dariJalur = telusuri(j, s.jalur_data);
  if (Array.isArray(dariJalur)) return dariJalur;
  const cadangan = (Array.isArray(j) && j) || j?.data || j?.Data || j?.result || j?.rows;
  return Array.isArray(cadangan) ? cadangan : [];
}

/** URL satu permintaan, dirakit dari parameter yang didaftarkan admin. */
function alamat(s: Sumber, branchId: string | null, tgl: string, halaman: number): string {
  const u = new URL(s.url as string);
  if (s.param_cabang && branchId) u.searchParams.set(s.param_cabang, branchId);
  if (s.param_tanggal) u.searchParams.set(s.param_tanggal, tgl);
  if (s.param_halaman) u.searchParams.set(s.param_halaman, String(halaman));
  if (s.param_ukuran) u.searchParams.set(s.param_ukuran, String(s.ukuran_halaman));
  return u.toString();
}

async function ambilHalaman(
  s: Sumber, branchId: string | null, tgl: string, halaman: number,
): Promise<any> {
  const url = alamat(s, branchId, tgl, halaman);
  let galatTerakhir: unknown = null;

  for (let coba = 0; coba <= COBA_ULANG; coba++) {
    if (coba > 0) await tidur(JEDA_MS * coba);
    try {
      const res = await fetch(url, {
        method: s.metode,
        headers: {
          accept: "application/json",
          ...(s.metode === "POST" ? { "content-type": "application/json" } : {}),
          ...s.header,
        },
        body: s.metode === "POST"
          ? JSON.stringify({
              ...(s.badan ?? {}),
              ...(s.param_cabang && branchId ? { [s.param_cabang]: branchId } : {}),
              ...(s.param_tanggal ? { [s.param_tanggal]: tgl } : {}),
              ...(s.param_halaman ? { [s.param_halaman]: halaman } : {}),
              ...(s.param_ukuran ? { [s.param_ukuran]: s.ukuran_halaman } : {}),
            })
          : undefined,
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      galatTerakhir = e;
    }
  }

  throw new Error(
    `${branchId ? `Cabang ${branchId} ` : ""}halaman ${halaman} gagal setelah ` +
    `${COBA_ULANG + 1} percobaan: ` +
    (galatTerakhir instanceof Error ? galatTerakhir.message : String(galatTerakhir)),
  );
}

/**
 * Seluruh halaman satu cabang.
 *
 * Berhenti saat satu halaman mengembalikan lebih sedikit dari ukuran yang
 * diminta — tanda halaman terakhir. Tidak bergantung pada total_pages yang
 * disebut API: nilai itu pernah keliru pada API utama dan menyebabkan
 * hanya halaman pertama tiap cabang yang terambil selama berminggu-minggu.
 */
async function ambilSemuaHalaman(
  s: Sumber, branchId: string | null, tgl: string,
): Promise<Baris[]> {
  if (!s.param_halaman) {
    return bacaBaris(await ambilHalaman(s, branchId, tgl, 1), s);
  }

  const semua: Baris[] = [];
  for (let h = 1; h <= MAKS_HALAMAN; h++) {
    const baris = bacaBaris(await ambilHalaman(s, branchId, tgl, h), s);
    semua.push(...baris);
    if (baris.length < s.ukuran_halaman) break;
  }
  return semua;
}

async function kolomSumber(kode: string): Promise<KolomSumber[]> {
  const rows = await q<KolomSumber>(
    `SELECT kolom, jenis, field_api
       FROM mentah_kolom
      WHERE sumber = $1
        AND COALESCE(ditarik, true)
        AND NOT COALESCE(turunan, false)
      ORDER BY urutan, kolom`, [kode]);
  return rows.filter((r) => POLA_KOLOM.test(r.kolom));
}

const nilaiKolom = (r: Baris, k: KolomSumber) => {
  const v = r[k.field_api ?? k.kolom];
  return k.jenis === "angka" ? angka(v)
       : k.jenis === "tanggal" ? tanggal(v)
       : teks(v);
};

/**
 * Menarik satu sumber sampai tuntas lalu memindahkannya ke tabel resmi.
 *
 * Mengembalikan hasil, bukan melempar: pemanggilnya (layar admin atau
 * cron) perlu mencatat kegagalan pada baris sumbernya, bukan sekadar
 * membalas galat dan melupakannya.
 */
export async function tarikSumber(kode: string): Promise<HasilTarikSumber> {
  const mulai = Date.now();
  const s = await satuSumber(kode);

  const selesai = async (h: Omit<HasilTarikSumber, "durasiMs">) => {
    await q(
      `UPDATE sumber_data
          SET ditarik_pada = now(), baris_terakhir = $2, galat = $3
        WHERE kode = $1`,
      [kode, h.baris, h.berhasil ? null : h.pesan]);
    return { ...h, durasiMs: Date.now() - mulai };
  };

  if (!s) throw new SumberSalah(`Sumber "${kode}" tidak terdaftar.`);
  if (s.jenis !== "api") {
    throw new SumberSalah(
      `Sumber "${s.nama}" bukan sumber API, jadi tidak bisa ditarik otomatis.`);
  }
  if (!s.url) {
    return selesai({ berhasil: false, baris: 0, cabangDiminta: 0, cabangSukses: 0,
      pesan: "Alamat API belum diisi." });
  }
  if (!POLA_NAMA.test(s.tabel) || !POLA_NAMA.test(s.kunci_gabung)) {
    throw new SumberSalah("Nama tabel atau kunci gabung sumber tidak sah.");
  }

  const kolom = await kolomSumber(kode);
  if (!kolom.length) {
    return selesai({ berhasil: false, baris: 0, cabangDiminta: 0, cabangSukses: 0,
      pesan: "Belum ada kolom terdaftar untuk sumber ini. Tambahkan dulu di CRUD Kolom API." });
  }

  const fieldKunci = s.field_kunci ?? s.kunci_gabung;
  const tgl = tanggalHariIni();
  const staging = `${s.tabel}_staging`;

  const cabang = s.per_cabang
    ? (await q<{ branch_id: string }>(
        `SELECT branch_id FROM cabang_api WHERE aktif ORDER BY branch_id`))
        .map((c) => c.branch_id)
    : [null];

  if (!cabang.length) {
    return selesai({ berhasil: false, baris: 0, cabangDiminta: 0, cabangSukses: 0,
      pesan: "Belum ada kode cabang aktif di master." });
  }

  try {
    await q(`TRUNCATE ${staging}`);

    /**
     * Satu kontrak hanya boleh punya satu baris — penggabungan ke data
     * utama harus tidak pernah melipatgandakan baris (alasan yang sama
     * dengan keunikan di v15). Kalau API mengembalikan kontrak yang sama
     * dua kali, yang terakhir menang, sama seperti perilaku unggahan
     * Excel saat orang memperbaiki baris di bawahnya.
     */
    const perKontrak = new Map<string, any[]>();
    let sukses = 0;

    for (let i = 0; i < cabang.length; i += SEKALIGUS) {
      const grup = cabang.slice(i, i + SEKALIGUS);
      const hasil = await Promise.all(
        grup.map((bid) => ambilSemuaHalaman(s, bid, tgl)));

      for (const baris of hasil) {
        for (const r of baris) {
          const kunci = teks(r[fieldKunci]);
          if (!kunci) continue;
          perKontrak.set(kunci, kolom.map((k) => nilaiKolom(r, k)));
        }
      }
      sukses += grup.length;
    }

    const isi = [...perKontrak.entries()];
    const namaKolom = [s.kunci_gabung, ...kolom.map((k) => k.kolom)];
    const perParam = Math.floor(60000 / namaKolom.length);
    const perGrup = Math.max(1, Math.min(BARIS_PER_INSERT, perParam));

    for (let i = 0; i < isi.length; i += perGrup) {
      const grup = isi.slice(i, i + perGrup);
      const params: any[] = [];
      const tuple = grup.map(([kunci, nilai]) => {
        const dasar = params.length;
        params.push(kunci, ...nilai);
        return "(" + Array.from({ length: nilai.length + 1 },
          (_, x) => `$${dasar + x + 1}`).join(",") + ")";
      });
      await q(
        `INSERT INTO ${staging} (${namaKolom.map((c) => `"${c}"`).join(",")})
         VALUES ${tuple.join(",")}`, params);
    }

    /**
     * Pemindahan memakai UPSERT, bukan hapus-lalu-isi.
     *
     * Dengan begitu penanda aktif/nonaktif dan catatan yang disetel admin
     * pada satu kontrak tidak ikut hilang tiap kali data ditarik ulang.
     * Kontrak yang sudah tidak dikembalikan API dihapus di langkah kedua —
     * kalau dibiarkan, angka kontrak yang sudah selesai akan terus ikut
     * dihitung tanpa ada yang menyadarinya.
     */
    const setKolom = kolom.map((k) => `"${k.kolom}" = EXCLUDED."${k.kolom}"`).join(",");
    await sql.transaction([
      sql(
        `INSERT INTO ${s.tabel} (${namaKolom.map((c) => `"${c}"`).join(",")}, ditarik_pada)
         SELECT ${namaKolom.map((c) => `"${c}"`).join(",")}, now() FROM ${staging}
         ON CONFLICT ("${s.kunci_gabung}") DO UPDATE
            SET ${setKolom}, ditarik_pada = now()`),
      sql(
        `DELETE FROM ${s.tabel} t
          WHERE NOT EXISTS (
            SELECT 1 FROM ${staging} g WHERE g."${s.kunci_gabung}" = t."${s.kunci_gabung}")`),
      // Meja sementara dikosongkan di dalam transaksi yang sama, bukan
      // ditinggal berisi sampai tarikan berikutnya — salinan penuh data
      // yang tidak dipakai siapa pun hanya memakan ruang di Neon.
      sql(`TRUNCATE ${staging}`),
    ]);

    return selesai({
      berhasil: true, baris: isi.length,
      cabangDiminta: cabang.length, cabangSukses: sukses, pesan: null,
    });
  } catch (e) {
    return selesai({
      berhasil: false, baris: 0,
      cabangDiminta: cabang.length, cabangSukses: 0,
      pesan: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Mencoba satu permintaan saja lalu melaporkan apa yang terbaca.
 *
 * Dipakai tombol "Uji koneksi" di layar admin: menyimpan konfigurasi yang
 * salah lalu menunggu cron berikutnya untuk tahu bahwa jalur datanya
 * keliru adalah putaran umpan balik yang terlalu panjang.
 */
export async function ujiSumber(kode: string): Promise<{
  ok: boolean; jumlah: number; contoh: Baris | null; field: string[]; pesan: string | null;
}> {
  const s = await satuSumber(kode);
  if (!s) throw new SumberSalah(`Sumber "${kode}" tidak terdaftar.`);
  if (!s.url) return { ok: false, jumlah: 0, contoh: null, field: [], pesan: "Alamat API belum diisi." };

  const [cab] = s.per_cabang
    ? await q<{ branch_id: string }>(
        `SELECT branch_id FROM cabang_api WHERE aktif ORDER BY branch_id LIMIT 1`)
    : [{ branch_id: null as any }];

  try {
    const j = await ambilHalaman(s, cab?.branch_id ?? null, tanggalHariIni(), 1);
    const baris = bacaBaris(j, s);
    return {
      ok: baris.length > 0,
      jumlah: baris.length,
      contoh: baris[0] ?? null,
      field: baris[0] ? Object.keys(baris[0]) : [],
      pesan: baris.length
        ? null
        : "Permintaan berhasil tapi tidak ada baris terbaca — periksa isian Jalur data.",
    };
  } catch (e) {
    return {
      ok: false, jumlah: 0, contoh: null, field: [],
      pesan: e instanceof Error ? e.message : String(e),
    };
  }
}
