import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { MENU, PETA_MENU } from "@/lib/menu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pengelolaan peran dan hak akses menunya.
 *
 * Katalog menu tidak disimpan di database — ia bagian dari aplikasi
 * (lib/menu.ts). Yang disimpan hanya pasangan peran-menu. Karena itu GET
 * mengirim katalog sekalian, supaya layar admin tidak perlu menebak menu
 * apa saja yang ada.
 */

const kodeSah = (s: string) => /^[a-z][a-z0-9_]{1,30}$/.test(s);

export const GET = handler(async () => {
  await requireAdmin();

  const [peran, hak, pakai] = await Promise.all([
    q<any>(`SELECT kode, nama, keterangan, bawaan, urutan, aktif
              FROM peran ORDER BY urutan, nama`),
    q<any>(`SELECT peran_kode, menu_kode FROM peran_menu`),
    q<any>(`SELECT peran, COUNT(*)::int AS jml FROM app_user GROUP BY peran`),
  ]);

  const jml = new Map(pakai.map((p) => [p.peran, p.jml]));

  return Response.json({
    katalog: MENU.map((m) => ({
      kode: m.kode, label: m.label, href: m.href, grup: m.grup ?? null,
    })),
    peran: peran.map((p) => ({
      ...p,
      pengguna: jml.get(p.kode) ?? 0,
      menu: hak.filter((h) => h.peran_kode === p.kode).map((h) => h.menu_kode),
    })),
  });
});

/** Tambah atau ubah satu peran beserta hak menunya. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kode = String(b.kode ?? "").trim().toLowerCase();
  const nama = String(b.nama ?? "").trim();
  const baru = b.baru === true;

  if (!kodeSah(kode)) {
    throw new HttpError(400,
      "Kode peran hanya boleh huruf kecil, angka, dan garis bawah (mis. manajemen_ho).");
  }
  if (nama.length < 2) throw new HttpError(400, "Nama peran belum diisi.");

  // Menu yang tidak dikenal katalog ditolak, bukan diabaikan diam-diam —
  // kode menu yang salah ketik akan terlihat sebagai galat, bukan sebagai
  // hak akses yang hilang tanpa penjelasan.
  const menu: string[] = Array.isArray(b.menu) ? b.menu.map(String) : [];
  const asing = menu.filter((m) => !PETA_MENU.has(m));
  if (asing.length) throw new HttpError(400, `Kode menu tidak dikenal: ${asing.join(", ")}`);

  const [ada] = await q<any>(`SELECT kode, bawaan FROM peran WHERE kode = $1`, [kode]);
  if (baru && ada) throw new HttpError(400, `Peran "${kode}" sudah ada.`);

  await q(
    `INSERT INTO peran (kode, nama, keterangan, urutan, aktif)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (kode) DO UPDATE
       SET nama = EXCLUDED.nama, keterangan = EXCLUDED.keterangan,
           urutan = EXCLUDED.urutan, aktif = EXCLUDED.aktif`,
    [kode, nama, b.keterangan ? String(b.keterangan).trim() : null,
     Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 0,
     b.aktif !== false]);

  // Hak menu ditulis ulang seluruhnya: layar mengirim keadaan akhir yang
  // diinginkan, jadi selisihnya tidak perlu dihitung di sini.
  await q(`DELETE FROM peran_menu WHERE peran_kode = $1`, [kode]);
  for (const m of menu) {
    await q(`INSERT INTO peran_menu (peran_kode, menu_kode) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`, [kode, m]);
  }

  await auditLog(admin.sub, "peran.simpan", kode, { menu: menu.length });
  return Response.json({ ok: true, kode });
});

/**
 * Hapus peran. Ditolak bila peran bawaan atau masih dipakai pengguna —
 * menghapusnya akan membuat akun kehilangan peran dan gagal masuk.
 */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kode = new URL(req.url).searchParams.get("kode") ?? "";

  const [p] = await q<any>(`SELECT kode, nama, bawaan FROM peran WHERE kode = $1`, [kode]);
  if (!p) throw new HttpError(404, "Peran tidak ditemukan.");
  if (p.bawaan) {
    throw new HttpError(400,
      `"${p.nama}" adalah peran bawaan dan tidak bisa dihapus. Hak menunya tetap boleh diatur.`);
  }

  const [{ jml }] = await q<any>(
    `SELECT COUNT(*)::int AS jml FROM app_user WHERE peran = $1`, [kode]);
  if (jml > 0) {
    throw new HttpError(400,
      `Peran ini masih dipakai ${jml} pengguna. Pindahkan mereka ke peran lain dulu.`);
  }

  await q(`DELETE FROM peran WHERE kode = $1`, [kode]);
  await auditLog(admin.sub, "peran.hapus", kode);
  return Response.json({ ok: true });
});
