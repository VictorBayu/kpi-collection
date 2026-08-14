import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";

/** Daftar pengguna + statistik akses. Filter: cari, peran, status, urut. */
export const GET = handler(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const cari = url.searchParams.get("cari") || "";
  const peran = url.searchParams.get("peran") || "";
  const status = url.searchParams.get("status") || ""; // aktif | suspend | jarang
  const urut = url.searchParams.get("urut") || "akses"; // akses | login | nama

  const orderBy =
    urut === "login" ? "login_count ASC"
    : urut === "nama" ? "nama ASC"
    : "akses_30h ASC";

  const rows = await q<any>(
    `SELECT id, nik, nama, peran, cabang, area, aktif,
            login_count, access_count, akses_7h, akses_30h,
            last_login_at, last_access_at, suspended_at, suspended_reason
       FROM v_akses_ringkas
      WHERE ($1 = '' OR nik ILIKE '%'||$1||'%' OR nama ILIKE '%'||$1||'%')
        AND ($2 = '' OR peran = $2)
        AND ($3 = '' OR
             ($3 = 'aktif'   AND aktif AND suspended_at IS NULL) OR
             ($3 = 'suspend' AND (NOT aktif OR suspended_at IS NOT NULL)) OR
             ($3 = 'jarang'  AND akses_30h < 3 AND suspended_at IS NULL))
      ORDER BY ${orderBy}
      LIMIT 500`,
    [cari, peran, status]);

  const [stat] = await q<any>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE aktif AND suspended_at IS NULL)::int AS aktif,
            COUNT(*) FILTER (WHERE NOT aktif OR suspended_at IS NOT NULL)::int AS suspend,
            COUNT(*) FILTER (WHERE akses_30h < 3 AND suspended_at IS NULL AND aktif)::int AS jarang
       FROM v_akses_ringkas`);

  return Response.json({ list: rows, stat });
});

/** Suspend / aktifkan / reset password satu user. */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const { userId, aksi, alasan } = await req.json();
  if (!userId) throw new HttpError(400, "User tidak dikenal.");

  const [u] = await q<any>(`SELECT id, nik, nama, aktif FROM app_user WHERE id = $1`, [userId]);
  if (!u) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (u.id === admin.sub) throw new HttpError(400, "Anda tidak bisa menonaktifkan akun sendiri.");

  if (aksi === "suspend") {
    await q(`UPDATE app_user SET aktif = FALSE, suspended_at = now(), suspended_reason = $2 WHERE id = $1`,
      [userId, (alasan || "Dinonaktifkan admin").slice(0, 300)]);
    await auditLog(admin.sub, "suspend_user", u.nik, { alasan });
  } else if (aksi === "aktifkan") {
    await q(`UPDATE app_user SET aktif = TRUE, suspended_at = NULL, suspended_reason = NULL WHERE id = $1`,
      [userId]);
    await auditLog(admin.sub, "aktifkan_user", u.nik);
  } else {
    throw new HttpError(400, "Aksi tidak dikenal.");
  }
  return Response.json({ ok: true });
});
