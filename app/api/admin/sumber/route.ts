import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import {
  daftarSumber, satuSumber, namaTabelSumber, POLA_NAMA,
} from "@/lib/sumber";
import { tarikSumber, ujiSumber } from "@/lib/tarik-sumber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Registri sumber data — tambah, ubah, uji, tarik, hapus.
 *
 * Mendaftarkan sumber berarti membuat TABEL FISIK barunya. Nama tabel
 * ditempel ke DDL, jadi ia tidak pernah datang dari masukan bebas: ia
 * diturunkan dari kode sumber yang sudah lolos pola ketat, lalu pola itu
 * diperiksa lagi tepat sebelum ditempel — sama seperti penjagaan nama
 * kolom di layar CRUD Kolom API.
 *
 * Tabelnya dibuat dengan kolom pengelola saja (kunci, aktif, catatan,
 * waktu tarik). Kolom isinya ditambahkan admin lewat CRUD Kolom API,
 * persis seperti kolom kustom pada sumber yang sudah ada — dengan begitu
 * bentuk akhir API kedua tidak perlu diketahui saat mendaftarkannya.
 */

const JENIS = ["api", "unggah"];

/** Kolom yang boleh diubah lewat layar, beserta cara membacanya. */
function bacaBadan(b: any) {
  const bersih = (v: any) => (v === "" || v === undefined ? null : v);
  return {
    nama: String(b.nama ?? "").trim(),
    jenis: String(b.jenis ?? "api"),
    kunci_gabung: String(b.kunci_gabung ?? "agreement_no").trim().toLowerCase(),
    field_kunci: bersih(b.field_kunci ? String(b.field_kunci).trim() : null),
    url: bersih(b.url ? String(b.url).trim() : null),
    metode: b.metode === "POST" ? "POST" : "GET",
    header: b.header && typeof b.header === "object" ? b.header : {},
    badan: b.badan && typeof b.badan === "object" ? b.badan : null,
    per_cabang: b.per_cabang !== false,
    param_cabang: bersih(b.param_cabang ? String(b.param_cabang).trim() : null),
    param_tanggal: bersih(b.param_tanggal ? String(b.param_tanggal).trim() : null),
    param_halaman: bersih(b.param_halaman ? String(b.param_halaman).trim() : null),
    param_ukuran: bersih(b.param_ukuran ? String(b.param_ukuran).trim() : null),
    ukuran_halaman: Math.min(5000, Math.max(1, Number(b.ukuran_halaman) || 300)),
    jalur_data: bersih(b.jalur_data ? String(b.jalur_data).trim() : null),
    jalur_total: bersih(b.jalur_total ? String(b.jalur_total).trim() : null),
    aktif: b.aktif !== false,
    urutan: Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 100,
    keterangan: bersih(b.keterangan ? String(b.keterangan).trim() : null),
  };
}

function periksa(d: ReturnType<typeof bacaBadan>) {
  if (d.nama.length < 2) throw new HttpError(400, "Nama sumber belum diisi.");
  if (!JENIS.includes(d.jenis)) throw new HttpError(400, "Jenis sumber tidak dikenal.");
  if (!POLA_NAMA.test(d.kunci_gabung)) {
    throw new HttpError(400, "Kunci gabung hanya boleh huruf kecil, angka, dan garis bawah.");
  }
  if (d.jenis === "api") {
    if (!d.url) throw new HttpError(400, "Sumber jenis API wajib punya alamat.");
    try {
      const u = new URL(d.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("skema");
    } catch {
      throw new HttpError(400, "Alamat API tidak sah. Sertakan https:// di depannya.");
    }
  }
}

/** Berapa kolom dan indikator yang bergantung pada satu sumber. */
async function pemakai(kode: string) {
  const [kolom, indikator] = await Promise.all([
    q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM mentah_kolom WHERE sumber = $1`, [kode]),
    q<{ nama: string }>(
      `SELECT nama FROM indikator_def WHERE sumber_kode = $1 ORDER BY nama LIMIT 20`, [kode]),
  ]);
  return { kolom: kolom[0]?.n ?? 0, indikator: indikator.map((r) => r.nama) };
}

export const GET = handler(async () => {
  await requireAdmin();
  const daftar = await daftarSumber();

  // Jumlah kolom dan baris tiap sumber dibaca sekali, bukan per baris di
  // layar: tanpa ini layar harus memanggil endpoint sekali per sumber.
  const kolom = await q<{ sumber: string; n: number }>(
    `SELECT COALESCE(sumber,'api') AS sumber, COUNT(*)::int AS n
       FROM mentah_kolom GROUP BY 1`);
  const petaKolom = new Map(kolom.map((k) => [k.sumber, k.n]));

  const isi: Record<string, number> = {};
  for (const s of daftar) {
    if (!POLA_NAMA.test(s.tabel)) continue;
    try {
      const [r] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${s.tabel}`);
      isi[s.kode] = r?.n ?? 0;
    } catch {
      // Tabelnya belum ada (sumber baru didaftarkan lalu gagal dibuat).
      // Ditampilkan sebagai nol, bukan menggagalkan seluruh layar.
      isi[s.kode] = -1;
    }
  }

  return Response.json({
    sumber: daftar.map((s) => ({
      ...s,
      jumlahKolom: petaKolom.get(s.kode) ?? 0,
      jumlahBaris: isi[s.kode] ?? 0,
    })),
  });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kode = String(b.kode ?? "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(kode)) {
    throw new HttpError(400,
      "Kode sumber hanya boleh huruf kecil, angka, dan garis bawah, diawali huruf (mis. api_bayar).");
  }
  if (await satuSumber(kode)) {
    throw new HttpError(400, `Sumber "${kode}" sudah terdaftar.`);
  }

  const d = bacaBadan(b);
  periksa(d);

  // Nama tabel diturunkan dari kode yang sudah lolos pola, lalu polanya
  // diperiksa sekali lagi di dalam namaTabelSumber sebelum ditempel.
  const tabel = namaTabelSumber(kode);

  /**
   * Kolom pengelola saja. Isinya ditambahkan lewat CRUD Kolom API.
   *
   * `aktif` wajib ada: klausa penggabungan selalu menyertakan
   * COALESCE(aktif, true), dan tabel tanpa kolom itu akan membuat setiap
   * perhitungan yang memakainya gagal.
   */
  for (const t of [tabel, `${tabel}_staging`]) {
    await q(
      `CREATE TABLE IF NOT EXISTS ${t} (
         id           BIGSERIAL PRIMARY KEY,
         "${d.kunci_gabung}" TEXT NOT NULL,
         aktif        BOOLEAN NOT NULL DEFAULT true,
         catatan      TEXT,
         ditarik_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
         diperbarui   TIMESTAMPTZ
       )`);
  }
  // Keunikan hanya pada tabel resmi: penggabungan satu-lawan-satu ke data
  // utama bergantung padanya. Meja sementara sengaja dibiarkan tanpa
  // keunikan supaya penarikan tidak gagal di tengah jalan hanya karena
  // API mengembalikan satu kontrak dua kali.
  await q(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${tabel}_kunci
       ON ${tabel} ("${d.kunci_gabung}")`);

  await q(
    `INSERT INTO sumber_data
       (kode, nama, jenis, tabel, kunci_gabung, field_kunci, url, metode, header, badan,
        per_cabang, param_cabang, param_tanggal, param_halaman, param_ukuran,
        ukuran_halaman, jalur_data, jalur_total, aktif, urutan, keterangan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,
             $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [kode, d.nama, d.jenis, tabel, d.kunci_gabung, d.field_kunci, d.url, d.metode,
     JSON.stringify(d.header), d.badan ? JSON.stringify(d.badan) : null,
     d.per_cabang, d.param_cabang, d.param_tanggal, d.param_halaman, d.param_ukuran,
     d.ukuran_halaman, d.jalur_data, d.jalur_total, d.aktif, d.urutan, d.keterangan]);

  await auditLog(admin.sub, "sumber.tambah", kode, { jenis: d.jenis, tabel });
  return Response.json({ ok: true, kode, tabel });
});

export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();
  const kode = String(b.kode ?? "");
  const lama = await satuSumber(kode);
  if (!lama) throw new HttpError(404, "Sumber tidak ditemukan.");

  const d = bacaBadan(b);
  // Sumber utama hanya boleh diubah keterangannya: tabel, kunci, dan cara
  // penarikannya dikenali oleh penarik lama yang menulis 76 kolom inti.
  if (lama.jenis === "utama") {
    await q(
      `UPDATE sumber_data SET nama = $2, keterangan = $3, urutan = $4 WHERE kode = $1`,
      [kode, d.nama || lama.nama, d.keterangan, d.urutan]);
    await auditLog(admin.sub, "sumber.ubah", kode, { utama: true });
    return Response.json({ ok: true });
  }

  periksa(d);
  if (d.kunci_gabung !== lama.kunci_gabung) {
    throw new HttpError(400,
      "Kunci gabung tidak bisa diubah setelah tabelnya dibuat. Daftarkan sumber baru bila kuncinya memang berbeda.");
  }

  await q(
    `UPDATE sumber_data
        SET nama=$2, jenis=$3, field_kunci=$4, url=$5, metode=$6, header=$7::jsonb,
            badan=$8::jsonb, per_cabang=$9, param_cabang=$10, param_tanggal=$11,
            param_halaman=$12, param_ukuran=$13, ukuran_halaman=$14,
            jalur_data=$15, jalur_total=$16, aktif=$17, urutan=$18, keterangan=$19
      WHERE kode=$1`,
    [kode, d.nama, d.jenis, d.field_kunci, d.url, d.metode,
     JSON.stringify(d.header), d.badan ? JSON.stringify(d.badan) : null,
     d.per_cabang, d.param_cabang, d.param_tanggal, d.param_halaman, d.param_ukuran,
     d.ukuran_halaman, d.jalur_data, d.jalur_total, d.aktif, d.urutan, d.keterangan]);

  await auditLog(admin.sub, "sumber.ubah", kode);
  return Response.json({ ok: true });
});

/** Uji koneksi atau tarik sekarang. */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();
  const kode = String(b.kode ?? "");

  if (b.aksi === "uji") {
    const hasil = await ujiSumber(kode);
    return Response.json(hasil);
  }
  if (b.aksi === "tarik") {
    const hasil = await tarikSumber(kode);
    await auditLog(admin.sub, "sumber.tarik", kode, { baris: hasil.baris });
    return Response.json(hasil);
  }
  throw new HttpError(400, "Aksi tidak dikenal.");
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kode = new URL(req.url).searchParams.get("kode") ?? "";
  const s = await satuSumber(kode);
  if (!s) throw new HttpError(404, "Sumber tidak ditemukan.");
  if (s.jenis === "utama") {
    throw new HttpError(400, "Sumber utama tidak bisa dihapus.");
  }

  const pakai = await pemakai(kode);
  if (pakai.kolom > 0) {
    throw new HttpError(400,
      `Masih ada ${pakai.kolom} kolom terdaftar pada sumber ini. Hapus kolomnya dulu lewat CRUD Kolom API.`);
  }
  if (pakai.indikator.length) {
    throw new HttpError(400,
      `Masih dipakai indikator: ${pakai.indikator.join(", ")}.`);
  }

  await q(`DELETE FROM sumber_data WHERE kode = $1`, [kode]);

  // Tabelnya sengaja TIDAK ikut dihapus. Menghapus tabel berisi data
  // historis karena satu klik di layar adalah kerugian yang tidak bisa
  // dibatalkan; baris registrinya cukup dibuang supaya sumbernya berhenti
  // dipakai, dan tabelnya bisa dibersihkan manual bila memang tak terpakai.
  await auditLog(admin.sub, "sumber.hapus", kode, { tabel: s.tabel });
  return Response.json({ ok: true, tabelTersisa: s.tabel });
});
