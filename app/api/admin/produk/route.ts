import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kode produk dipakai sebagai kunci, jadi bentuknya diseragamkan. */
const keKode = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Master produk dan pemetaan jabatan → produk.
 *
 * Produk dijadikan data, bukan teks bebas, karena satu salah ketik ("R 2"
 * alih-alih "R2") membuat indikator berhenti mencocokkan tanpa pesan galat
 * apa pun — angkanya cuma jadi nol dan tidak ada yang tahu kenapa.
 *
 * Pemetaannya menempel pada ALIAS jabatan, bukan jabatan pokok, karena
 * justru alias yang membedakan cakupan produk: "FC TT R2" dan "FC TT R4"
 * sama-sama jabatan pokok "FC TT" tapi menangani produk yang berbeda.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [produk, jabatan, pemetaan] = await Promise.all([
    q<any>(`SELECT kode, nama, urutan, aktif FROM produk_master ORDER BY urutan, kode`),

    // Alias diambil dari dua tempat: yang sudah terdaftar sebagai alias,
    // dan jabatan pengguna yang belum pernah dibuatkan aliasnya. Tanpa
    // yang kedua, jabatan baru tidak akan pernah muncul untuk dipetakan.
    q<any>(
      `WITH semua AS (
         SELECT alias, jabatan FROM jabatan_alias
         UNION
         SELECT DISTINCT norm_jabatan(jabatan), norm_jabatan(jabatan)
           FROM app_user
          WHERE jabatan IS NOT NULL AND btrim(jabatan) <> ''
            AND norm_jabatan(jabatan) NOT IN (SELECT alias FROM jabatan_alias)
       )
       SELECT s.alias, s.jabatan,
              (SELECT COUNT(*)::int FROM app_user u
                WHERE u.aktif AND norm_jabatan(u.jabatan) = s.alias) AS pemakai
         FROM semua s
        ORDER BY s.alias`),

    q<any>(`SELECT alias, produk FROM jabatan_produk ORDER BY alias, produk`),
  ]);

  return Response.json({ produk, jabatan, pemetaan });
});

/** Tambah atau ubah satu produk. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kodeAsli = keKode(b.kodeAsli);
  const kode = keKode(b.kode);
  const nama = String(b.nama ?? "").trim();

  if (!kode) throw new HttpError(400, "Kode produk belum diisi.");
  if (!nama) throw new HttpError(400, "Nama produk belum diisi.");

  if (kodeAsli && kodeAsli !== kode) {
    // Kode berubah: karena dirujuk jabatan_produk dan indikator_target
    // lewat ON UPDATE CASCADE, penggantiannya ikut merambat sendiri.
    const [ada] = await q<any>(`SELECT 1 FROM produk_master WHERE kode = $1`, [kode]);
    if (ada) throw new HttpError(400, `Kode ${kode} sudah dipakai produk lain.`);
    await q(`UPDATE produk_master SET kode=$2, nama=$3, urutan=$4, aktif=$5, updated_at=now()
              WHERE kode=$1`,
      [kodeAsli, kode, nama, Number(b.urutan ?? 0), b.aktif !== false]);
  } else {
    await q(
      `INSERT INTO produk_master (kode, nama, urutan, aktif) VALUES ($1,$2,$3,$4)
       ON CONFLICT (kode) DO UPDATE
         SET nama=EXCLUDED.nama, urutan=EXCLUDED.urutan,
             aktif=EXCLUDED.aktif, updated_at=now()`,
      [kode, nama, Number(b.urutan ?? 0), b.aktif !== false]);
  }

  await auditLog(admin.sub, "produk.simpan", kode, { kodeAsli, nama });
  return Response.json({ ok: true });
});

/**
 * Mengganti seluruh daftar produk satu jabatan sekaligus.
 *
 * Diganti utuh, bukan ditambah/dikurangi satu per satu, supaya keadaan
 * akhirnya persis seperti yang terlihat di layar — tidak ada sisa
 * pemetaan lama yang tertinggal karena permintaan hapus gagal terkirim.
 */
export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const alias = String(b.alias ?? "").trim().toUpperCase();
  if (!alias) throw new HttpError(400, "Jabatan belum dipilih.");

  const daftar: string[] = Array.isArray(b.produk)
    ? Array.from(new Set(b.produk.map(keKode).filter(Boolean)))
    : [];

  if (daftar.length) {
    const sah = await q<any>(
      `SELECT kode FROM produk_master WHERE kode = ANY($1::text[])`, [daftar]);
    if (sah.length !== daftar.length) {
      throw new HttpError(400, "Ada produk yang tidak terdaftar di master.");
    }
  }

  await q(`DELETE FROM jabatan_produk WHERE alias = $1`, [alias]);
  if (daftar.length) {
    await q(
      `INSERT INTO jabatan_produk (alias, produk)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [alias, daftar]);
  }

  await auditLog(admin.sub, "jabatan_produk.simpan", alias, { produk: daftar });
  return Response.json({ ok: true });
});

/** Menonaktifkan produk. Tidak dihapus karena masih dirujuk baris KPI lama. */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kode = keKode(new URL(req.url).searchParams.get("kode"));
  if (!kode) throw new HttpError(400, "Kode produk belum diisi.");

  const [dipakai] = await q<any>(
    `SELECT COUNT(*)::int AS n FROM indikator_target WHERE produk = $1`, [kode]);
  if (dipakai.n > 0) {
    throw new HttpError(400,
      `Produk ${kode} masih dipakai ${dipakai.n} pendaftaran indikator. ` +
      `Lepaskan dulu dari indikatornya.`);
  }

  await q(`DELETE FROM jabatan_produk WHERE produk = $1`, [kode]);
  await q(`UPDATE produk_master SET aktif = FALSE, updated_at = now() WHERE kode = $1`, [kode]);
  await auditLog(admin.sub, "produk.nonaktif", kode);
  return Response.json({ ok: true });
});
