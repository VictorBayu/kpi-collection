import * as XLSX from "xlsx";
import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATAS_BARIS = 200_000;
const PER_INSERT = 500;
const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

/**
 * Unggahan data pendukung dari Excel.
 *
 * Berkasnya cukup berisi kolom AGREEMENT_NO ditambah kolom nilai apa pun
 * yang sudah didaftarkan sebagai kolom data pendukung. Pencocokan header
 * dilakukan longgar (huruf besar/kecil dan spasi diabaikan) terhadap nama
 * kolom maupun labelnya, karena tim data menamai kolomnya di Excel dengan
 * gaya yang berbeda-beda dan menolak berkas hanya karena "Agreement No"
 * ditulis "AgreementNo" bukan penjagaan, hanya gangguan.
 *
 * Baris tanpa nomor kontrak dibuang, bukan disimpan dengan kunci kosong:
 * baris semacam itu tidak akan pernah cocok dengan data utama dan hanya
 * membuat jumlah baris terlihat lebih besar daripada yang sebenarnya
 * terpakai.
 */

const rapi = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function kolomPendukung() {
  const rows = await q<{ kolom: string; label: string; jenis: string }>(
    `SELECT kolom, label, jenis FROM mentah_kolom
      WHERE COALESCE(sumber,'api') = 'pendukung' AND COALESCE(aktif,true)`);
  return rows.filter((r) => POLA_KOLOM.test(r.kolom));
}

const angka = (v: any): number | null => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  // Format Indonesia: titik ribuan, koma desimal.
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
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

export const GET = handler(async () => {
  await requireAdmin();
  const [kolom, riwayat, ringkas] = await Promise.all([
    kolomPendukung(),
    q<any>(`SELECT id, nama_file, kolom_diisi, baris_masuk, baris_tolak, dibuat_pada
              FROM pendukung_unggah ORDER BY dibuat_pada DESC LIMIT 15`),
    q<any>(`SELECT COUNT(*)::int AS baris, MAX(ditarik_pada) AS terakhir
              FROM data_pendukung`),
  ]);
  return Response.json({ kolom, riwayat, ringkas: ringkas[0] ?? {} });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");

  const kolom = await kolomPendukung();
  if (!kolom.length) {
    throw new HttpError(400,
      "Belum ada kolom data pendukung yang terdaftar. Tambahkan dulu di menu Kolom Data API.");
  }

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new HttpError(400, "Berkas tidak punya lembar data.");

  const mentah = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!mentah.length) throw new HttpError(400, "Lembar data kosong.");
  if (mentah.length > BATAS_BARIS) {
    throw new HttpError(400,
      `Berkas berisi ${mentah.length} baris, melebihi batas ${BATAS_BARIS}.`);
  }

  // Petakan header berkas ke kolom terdaftar, longgar terhadap gaya penulisan.
  const header = Object.keys(mentah[0] ?? {});
  const petaHeader = new Map(header.map((h) => [rapi(h), h]));

  const cariHeader = (...kandidat: string[]) => {
    for (const k of kandidat) {
      const h = petaHeader.get(rapi(k));
      if (h) return h;
    }
    return null;
  };

  const hKunci = cariHeader("agreement_no", "agreementno", "no kontrak", "nomor kontrak");
  if (!hKunci) {
    throw new HttpError(400,
      'Kolom "AGREEMENT_NO" tidak ditemukan di berkas. Pastikan ada kolom nomor kontrak.');
  }

  const terpakai = kolom
    .map((k) => ({ ...k, header: cariHeader(k.kolom, k.label) }))
    .filter((k) => k.header);
  if (!terpakai.length) {
    throw new HttpError(400,
      `Tidak ada kolom yang cocok. Kolom pendukung terdaftar: ${kolom.map((k) => k.label).join(", ")}.`);
  }

  const konversi = (jenis: string, v: any) =>
    jenis === "angka" ? angka(v) : jenis === "tanggal" ? tanggal(v) : teks(v);

  // Baris terakhir menang bila nomor kontrak muncul lebih dari sekali —
  // sama seperti perilaku Excel saat orang memperbaiki baris di bawahnya.
  const perKontrak = new Map<string, any[]>();
  let ditolak = 0;
  for (const r of mentah) {
    const kunci = teks(r[hKunci]);
    if (!kunci) { ditolak++; continue; }
    perKontrak.set(kunci, terpakai.map((k) => konversi(k.jenis, r[k.header!])));
  }

  const namaKolom = terpakai.map((k) => `"${k.kolom}"`).join(",");
  const setKolom = terpakai.map((k) => `"${k.kolom}" = EXCLUDED."${k.kolom}"`).join(",");
  const baris = [...perKontrak.entries()];

  for (let i = 0; i < baris.length; i += PER_INSERT) {
    const grup = baris.slice(i, i + PER_INSERT);
    const params: any[] = [];
    const tuple = grup.map(([kunci, nilai]) => {
      const dasar = params.length;
      params.push(kunci, ...nilai);
      return "(" + Array.from({ length: nilai.length + 1 },
        (_, x) => `$${dasar + x + 1}`).join(",") + ")";
    });

    await q(
      `INSERT INTO data_pendukung (agreement_no,${namaKolom}) VALUES ${tuple.join(",")}
       ON CONFLICT (agreement_no) DO UPDATE
         SET ${setKolom}, ditarik_pada = now()`,
      params);
  }

  await q(
    `INSERT INTO pendukung_unggah (nama_file, kolom_diisi, baris_masuk, baris_tolak, oleh)
     VALUES ($1,$2,$3,$4,$5)`,
    [file.name, terpakai.map((k) => k.kolom), baris.length, ditolak, admin.sub]);

  await auditLog(admin.sub, "pendukung.unggah", file.name,
    { baris: baris.length, ditolak });

  return Response.json({
    ok: true, masuk: baris.length, ditolak,
    kolom: terpakai.map((k) => k.label),
  });
});
