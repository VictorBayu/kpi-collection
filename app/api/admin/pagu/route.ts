import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Master pagu insentif per jabatan + produk.
 *
 * Nominal insentif sengaja tidak ditaruh di indikator. Nominal melekat pada
 * jabatan, bukan pada indikatornya: beberapa indikator dijumlahkan dulu jadi
 * satu skor insentif terbobot, baru skor itu dikalikan pagu. Menaruhnya di
 * indikator berarti mengulang angka pagu yang sama di tiap pendaftaran, dan
 * membuka peluang angkanya berbeda-beda tanpa sengaja.
 *
 * Rumus akhirnya: nominal = (skor insentif ÷ pembagi) × pagu, dan nol bila
 * skor di bawah ambang minimal.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [pagu, produk, jabatan] = await Promise.all([
    q<any>(
      `SELECT g.alias, g.produk, g.nominal, g.skor_minimal, g.pembagi, g.aktif,
              (SELECT COUNT(*)::int FROM app_user u
                WHERE u.aktif AND norm_jabatan(u.jabatan) = g.alias) AS pemakai
         FROM insentif_pagu g
        ORDER BY g.alias, g.produk`),

    q<any>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),

    // Hanya jabatan yang benar-benar punya indikator berbobot insentif.
    // Sisanya tidak akan pernah menghasilkan nominal, jadi menawarkannya
    // di sini hanya membuat daftar panjang tanpa guna.
    q<any>(
      `SELECT DISTINCT t.alias, t.produk
         FROM indikator_target t
        WHERE t.aktif AND t.bobot_insentif IS NOT NULL
        ORDER BY t.alias, t.produk`),
  ]);

  return Response.json({ pagu, produk, jabatan });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const alias = String(b.alias ?? "").trim().toUpperCase();
  const produk = String(b.produk ?? "").trim().toUpperCase();
  if (!alias) throw new HttpError(400, "Jabatan belum dipilih.");
  if (!produk) throw new HttpError(400, "Produk belum dipilih.");

  const nominal = Number(b.nominal ?? 0);
  const skorMin = Number(b.skor_minimal ?? 3);
  const pembagi = Number(b.pembagi ?? 5);

  if (!Number.isFinite(nominal) || nominal < 0) {
    throw new HttpError(400, "Nominal pagu harus angka positif.");
  }
  if (!Number.isFinite(pembagi) || pembagi <= 0) {
    throw new HttpError(400, "Pembagi harus lebih besar dari nol.");
  }

  await q(
    `INSERT INTO insentif_pagu (alias, produk, nominal, skor_minimal, pembagi, aktif)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (alias, produk) DO UPDATE
       SET nominal=EXCLUDED.nominal, skor_minimal=EXCLUDED.skor_minimal,
           pembagi=EXCLUDED.pembagi, aktif=EXCLUDED.aktif, updated_at=now()`,
    [alias, produk, nominal, skorMin, pembagi, b.aktif !== false]);

  await auditLog(admin.sub, "pagu.simpan", `${alias}/${produk}`, { nominal, skorMin });
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const alias = url.searchParams.get("alias");
  const produk = url.searchParams.get("produk");
  if (!alias || !produk) throw new HttpError(400, "Jabatan dan produk belum diisi.");

  await q(`DELETE FROM insentif_pagu WHERE alias=$1 AND produk=$2`, [alias, produk]);
  await auditLog(admin.sub, "pagu.hapus", `${alias}/${produk}`);
  return Response.json({ ok: true });
});
