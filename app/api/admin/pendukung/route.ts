import * as XLSX from "xlsx";
import { requireMenu, handler, HttpError } from "@/lib/auth";
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

const PER_HAL = 5;

export const GET = handler(async (req) => {
  await requireMenu("admin_pendukung");
  const url = new URL(req.url);
  const hal = Math.max(0, Number(url.searchParams.get("hal") ?? 0) || 0);
  const cari = (url.searchParams.get("cari") ?? "").trim();
  const saring = url.searchParams.get("saring") ?? "";

  const kolom = await kolomPendukung();

  // Kolom nilai ikut dikirim apa adanya supaya layar bisa menampilkan
  // isinya tanpa perlu tahu di muka kolom apa saja yang terdaftar —
  // daftarnya memang berubah sesuai yang didaftarkan admin.
  const pilihKolom = kolom.map((k) => `"${k.kolom}"`).join(",");
  const syarat: string[] = [];
  const params: any[] = [];

  if (cari) {
    params.push(`%${cari}%`);
    syarat.push(`agreement_no ILIKE $${params.length}`);
  }
  if (saring === "aktif") syarat.push("COALESCE(aktif,true)");
  if (saring === "nonaktif") syarat.push("NOT COALESCE(aktif,true)");
  const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";

  const [baris, jml, riwayat, ringkas] = await Promise.all([
    q<any>(
      `SELECT id, agreement_no, COALESCE(aktif,true) AS aktif, catatan,
              ditarik_pada${pilihKolom ? "," + pilihKolom : ""}
         FROM data_pendukung ${where}
        ORDER BY ditarik_pada DESC, id DESC
        LIMIT ${PER_HAL} OFFSET ${hal * PER_HAL}`, params),
    q<any>(`SELECT COUNT(*)::int AS n FROM data_pendukung ${where}`, params),
    q<any>(
      `SELECT u.id, u.nama_file, u.kolom_diisi, u.baris_masuk, u.baris_tolak, u.dibuat_pada,
              COUNT(d.id)::int AS baris_aktif
         FROM pendukung_unggah u
         LEFT JOIN data_pendukung d ON d.unggah_id = u.id
        GROUP BY u.id ORDER BY u.dibuat_pada DESC LIMIT 10`),
    q<any>(`SELECT COUNT(*)::int AS baris,
                   COUNT(*) FILTER (WHERE COALESCE(aktif,true))::int AS aktif,
                   MAX(ditarik_pada) AS terakhir
              FROM data_pendukung`),
  ]);

  return Response.json({
    kolom, baris, riwayat,
    total: jml[0]?.n ?? 0, perHal: PER_HAL,
    ringkas: ringkas[0] ?? {},
  });
});

/** Ubah satu baris: status pakai/tidak, catatan, dan nilai kolomnya. */
export const PUT = handler(async (req) => {
  const admin = await requireMenu("admin_pendukung");
  const b = await req.json();
  const id = Number(b.id);
  if (!Number.isFinite(id)) throw new HttpError(400, "Baris tidak dikenal.");

  const kolom = await kolomPendukung();
  const set: string[] = ["aktif = $2", "catatan = $3", "diperbarui = now()"];
  const params: any[] = [id, b.aktif !== false,
    b.catatan ? String(b.catatan).trim() : null];

  // Hanya kolom yang benar-benar terdaftar yang boleh disentuh; nama
  // kolomnya ditempel ke SQL, jadi ia diambil dari katalog — tidak pernah
  // dari kunci yang dikirim layar.
  for (const k of kolom) {
    if (!(k.kolom in (b.nilai ?? {}))) continue;
    const v = b.nilai[k.kolom];
    params.push(v === "" || v === null || v === undefined ? null : v);
    set.push(`"${k.kolom}" = $${params.length}${k.jenis === "angka" ? "::numeric" : ""}`);
  }

  await q(`UPDATE data_pendukung SET ${set.join(", ")} WHERE id = $1`, params);
  await auditLog(admin.sub, "pendukung.ubah", String(id));
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const admin = await requireMenu("admin_pendukung");
  const url = new URL(req.url);

  // Membersihkan seluruh isi sekaligus — dipakai saat berkas yang salah
  // terlanjur diunggah dan lebih cepat memulai dari kosong.
  if (url.searchParams.get("semua") === "1") {
    const hasil = await q<{ id: number }>(`DELETE FROM data_pendukung RETURNING id`);
    await auditLog(admin.sub, "pendukung.kosongkan", undefined, { dihapus: hasil.length });
    return Response.json({ ok: true, dihapus: hasil.length });
  }

  // Hapus satu kontrak langsung lewat nomornya, tanpa perlu mencarinya
  // dulu di tabel — dipakai saat admin sudah tahu persis nomor kontrak
  // mana yang salah masuk.
  const agreementNo = url.searchParams.get("agreement_no");
  if (agreementNo) {
    const hasil = await q<{ id: number }>(
      `DELETE FROM data_pendukung WHERE UPPER(agreement_no) = UPPER($1) RETURNING id`,
      [agreementNo.trim()]);
    if (!hasil.length) throw new HttpError(404, `Nomor kontrak "${agreementNo}" tidak ditemukan.`);
    await auditLog(admin.sub, "pendukung.hapus", agreementNo.trim());
    return Response.json({ ok: true, dihapus: hasil.length });
  }

  // Hapus seluruh baris yang isinya masih berasal dari satu batch unggahan.
  //
  // "Masih berasal dari" itu kuncinya: karena unggahan memakai UPSERT,
  // unggah_id sebuah baris selalu menunjuk ke unggahan PALING BARU yang
  // menyentuhnya. Kalau batch lama dihapus tapi sebagian kontraknya sudah
  // ditimpa unggahan berikutnya, kontrak itu TIDAK ikut terhapus — isinya
  // sekarang memang bukan lagi milik batch lama itu.
  const unggahId = Number(url.searchParams.get("unggah_id"));
  if (Number.isFinite(unggahId) && unggahId > 0) {
    const hasil = await q<{ id: number }>(
      `DELETE FROM data_pendukung WHERE unggah_id = $1 RETURNING id`, [unggahId]);
    await auditLog(admin.sub, "pendukung.hapus_batch", String(unggahId),
      { dihapus: hasil.length });
    return Response.json({ ok: true, dihapus: hasil.length });
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) throw new HttpError(400, "Baris tidak dikenal.");
  await q(`DELETE FROM data_pendukung WHERE id = $1`, [id]);
  await auditLog(admin.sub, "pendukung.hapus", String(id));
  return Response.json({ ok: true });
});

export const POST = handler(async (req) => {
  const admin = await requireMenu("admin_pendukung");
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

  // Riwayat dibuat DULU, sebelum baris-barisnya, supaya tiap baris yang
  // masuk bisa langsung menyimpan id unggahannya. Itu yang dipakai fitur
  // "hapus berdasarkan batch" untuk tahu baris mana milik unggahan mana.
  const [ung] = await q<{ id: number }>(
    `INSERT INTO pendukung_unggah (nama_file, kolom_diisi, baris_masuk, baris_tolak, oleh)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [file.name, terpakai.map((k) => k.kolom), baris.length, ditolak, admin.sub]);

  for (let i = 0; i < baris.length; i += PER_INSERT) {
    const grup = baris.slice(i, i + PER_INSERT);
    const params: any[] = [ung.id];
    const tuple = grup.map(([kunci, nilai]) => {
      const dasar = params.length;
      params.push(kunci, ...nilai);
      return "($1," + Array.from({ length: nilai.length + 1 },
        (_, x) => `$${dasar + x + 1}`).join(",") + ")";
    });

    await q(
      `INSERT INTO data_pendukung (unggah_id, agreement_no,${namaKolom}) VALUES ${tuple.join(",")}
       ON CONFLICT (agreement_no) DO UPDATE
         SET ${setKolom}, unggah_id = EXCLUDED.unggah_id, ditarik_pada = now()`,
      params);
  }

  await auditLog(admin.sub, "pendukung.unggah", file.name,
    { baris: baris.length, ditolak });

  return Response.json({
    ok: true, masuk: baris.length, ditolak,
    kolom: terpakai.map((k) => k.label),
  });
});
