import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KELAS = ["large", "medium", "small"];

/**
 * Tabel tier insentif: nominal dicari lewat tier (dari indikator berperan
 * "Penentu tier") disilang kelas cabang, dipakai jabatan+produk yang
 * mekanismenya diset "tier" di Pagu Insentif — alternatif dari rumus pagu
 * biasa untuk jabatan yang nominalnya memang tidak berbentuk skor linear.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [tier, produk, jabatan] = await Promise.all([
    q<any>(
      `SELECT alias, produk, tier, kelas, nominal
         FROM insentif_tier ORDER BY alias, produk, tier, kelas`),
    q<any>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),
    // Hanya jabatan+produk yang memang diset memakai mekanisme tier di
    // Pagu Insentif — di luar itu tabel ini tidak pernah dibaca.
    q<any>(
      `SELECT alias, produk FROM insentif_pagu
        WHERE mekanisme = 'tier' AND aktif ORDER BY alias, produk`),
  ]);

  return Response.json({ tier, produk, jabatan });
});

export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const alias = String(b.alias ?? "").trim().toUpperCase();
  const produk = String(b.produk ?? "").trim().toUpperCase();
  const tier = Number(b.tier);
  const kelas = String(b.kelas ?? "").trim();
  const nominal = Number(b.nominal ?? 0);

  if (!alias) throw new HttpError(400, "Jabatan belum dipilih.");
  if (!produk) throw new HttpError(400, "Produk belum dipilih.");
  if (!Number.isFinite(tier) || tier < 1) throw new HttpError(400, "Tier harus angka 1 atau lebih.");
  if (!KELAS.includes(kelas)) throw new HttpError(400, "Kelas harus large, medium, atau small.");
  if (!Number.isFinite(nominal) || nominal < 0) throw new HttpError(400, "Nominal harus angka positif.");

  await q(
    `INSERT INTO insentif_tier (alias, produk, tier, kelas, nominal)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (alias, produk, tier, kelas) DO UPDATE
       SET nominal = EXCLUDED.nominal, updated_at = now()`,
    [alias, produk, tier, kelas, nominal]);

  await auditLog(admin.sub, "tier.simpan", `${alias}/${produk} tier ${tier}/${kelas}`, { nominal });
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const alias = url.searchParams.get("alias");
  const produk = url.searchParams.get("produk");
  const tier = url.searchParams.get("tier");
  const kelas = url.searchParams.get("kelas");
  if (!alias || !produk || !tier || !kelas) {
    throw new HttpError(400, "Baris yang dihapus belum jelas.");
  }

  await q(
    `DELETE FROM insentif_tier WHERE alias=$1 AND produk=$2 AND tier=$3 AND kelas=$4`,
    [alias, produk, Number(tier), kelas]);
  await auditLog(admin.sub, "tier.hapus", `${alias}/${produk} tier ${tier}/${kelas}`);
  return Response.json({ ok: true });
});
