import { requireAdmin, handler, HttpError, hashPassword } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

const PERAN_SAH = ["karyawan", "atasan", "admin"] as const;

/** Membersihkan dan memeriksa isian form pengguna. */
function bacaForm(b: any, wajibPassword: boolean) {
  const nik = String(b.nik ?? "").trim();
  const nama = String(b.nama ?? "").trim();
  const peran = String(b.peran ?? "karyawan");
  const password = String(b.password ?? "");

  if (!/^\d{4,16}$/.test(nik)) {
    throw new HttpError(400, "NIK harus berupa angka 4–16 digit.");
  }
  if (nama.length < 2) throw new HttpError(400, "Nama belum diisi.");
  if (!PERAN_SAH.includes(peran as any)) throw new HttpError(400, "Peran tidak dikenal.");
  if (wajibPassword && password.length < 8) {
    throw new HttpError(400, "Password minimal 8 karakter.");
  }
  if (password && password.length < 8) {
    throw new HttpError(400, "Password baru minimal 8 karakter.");
  }

  return {
    nik, nama, peran, password,
    jabatan: (String(b.jabatan ?? "").trim() || null),
    cabang:  (String(b.cabang  ?? "").trim().toUpperCase() || null),
    area:    (String(b.area    ?? "").trim().toUpperCase() || null),
    aktif: b.aktif === undefined ? true : Boolean(b.aktif),
    mustChange: Boolean(b.must_change_password ?? b.mustChange ?? false),
  };
}

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
    `SELECT id, nik, nama, peran, jabatan, jabatan_master, level, cabang, area, aktif,
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

/** Tambah pengguna baru. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const f = bacaForm(await req.json(), true);

  const [ada] = await q<{ id: string }>(`SELECT id FROM app_user WHERE nik = $1`, [f.nik]);
  if (ada) throw new HttpError(409, `NIK ${f.nik} sudah terdaftar.`);

  const hash = await hashPassword(f.password);
  const [baru] = await q<{ id: string }>(
    `INSERT INTO app_user (nik, nama, password_hash, jabatan, cabang, area, peran,
                           aktif, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [f.nik, f.nama, hash, f.jabatan, f.cabang, f.area, f.peran, f.aktif, f.mustChange]);

  await auditLog(admin.sub, "buat_user", f.nik, {
    nama: f.nama, peran: f.peran, cabang: f.cabang, jabatan: f.jabatan,
  });
  return Response.json({ ok: true, id: baru.id });
});

/** Ubah data pengguna. Password hanya diganti bila diisi. */
export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const body = await req.json();
  const userId = String(body.userId ?? "");
  if (!userId) throw new HttpError(400, "User tidak dikenal.");

  const [u] = await q<any>(`SELECT id, nik, nama, peran FROM app_user WHERE id = $1`, [userId]);
  if (!u) throw new HttpError(404, "Pengguna tidak ditemukan.");

  const f = bacaForm(body, false);

  // NIK boleh diubah, tapi tidak boleh bentrok dengan akun lain.
  const [bentrok] = await q<{ id: string }>(
    `SELECT id FROM app_user WHERE nik = $1 AND id <> $2`, [f.nik, userId]);
  if (bentrok) throw new HttpError(409, `NIK ${f.nik} sudah dipakai akun lain.`);

  // Pagar keamanan: admin tidak bisa mencabut peran adminnya sendiri atau
  // menonaktifkan dirinya, supaya tidak ada yang terkunci di luar sistem.
  if (u.id === admin.sub) {
    if (f.peran !== "admin") throw new HttpError(400, "Anda tidak bisa mengubah peran akun sendiri.");
    if (!f.aktif) throw new HttpError(400, "Anda tidak bisa menonaktifkan akun sendiri.");
  }

  await q(
    `UPDATE app_user
        SET nik = $2, nama = $3, jabatan = $4, cabang = $5, area = $6,
            peran = $7, aktif = $8, must_change_password = $9,
            suspended_at = CASE WHEN $8 THEN NULL ELSE suspended_at END,
            suspended_reason = CASE WHEN $8 THEN NULL ELSE suspended_reason END
      WHERE id = $1`,
    [userId, f.nik, f.nama, f.jabatan, f.cabang, f.area, f.peran, f.aktif, f.mustChange]);

  if (f.password) {
    await q(`UPDATE app_user SET password_hash = $2 WHERE id = $1`,
      [userId, await hashPassword(f.password)]);
  }

  await auditLog(admin.sub, "ubah_user", f.nik, {
    sebelum: { nik: u.nik, nama: u.nama, peran: u.peran },
    sesudah: { nik: f.nik, nama: f.nama, peran: f.peran },
    passwordDiganti: Boolean(f.password),
  });
  return Response.json({ ok: true });
});

/**
 * Hapus pengguna.
 *
 * Akun yang sudah punya jejak (request, audit, log akses) tidak dihapus
 * permanen karena baris-baris itu menunjuk ke user_id — menghapusnya akan
 * ikut menghilangkan riwayat. Untuk kasus itu akun dinonaktifkan saja,
 * dan jawaban API menyebutkan alasannya.
 */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const { userId } = await req.json();
  if (!userId) throw new HttpError(400, "User tidak dikenal.");

  const [u] = await q<any>(`SELECT id, nik, nama FROM app_user WHERE id = $1`, [userId]);
  if (!u) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (u.id === admin.sub) throw new HttpError(400, "Anda tidak bisa menghapus akun sendiri.");

  const [jejak] = await q<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM request WHERE user_id = $1)
          + (SELECT COUNT(*) FROM request WHERE petugas_id = $1)
          + (SELECT COUNT(*) FROM request_message WHERE user_id = $1)
          + (SELECT COUNT(*) FROM import_batch WHERE diunggah_oleh = $1)
          + (SELECT COUNT(*) FROM audit_log WHERE user_id = $1) AS n`, [userId]);

  if (Number(jejak.n) > 0) {
    await q(`UPDATE app_user
                SET aktif = FALSE, suspended_at = now(),
                    suspended_reason = 'Dihapus admin (riwayat dipertahankan)'
              WHERE id = $1`, [userId]);
    await auditLog(admin.sub, "hapus_user_lunak", u.nik, { jejak: Number(jejak.n) });
    return Response.json({
      ok: true, mode: "nonaktif",
      pesan: `${u.nama} punya riwayat request/impor, jadi akunnya dinonaktifkan ` +
             `agar riwayat tidak ikut hilang.`,
    });
  }

  await q(`DELETE FROM access_log WHERE user_id = $1`, [userId]);
  await q(`DELETE FROM app_user WHERE id = $1`, [userId]);
  await auditLog(admin.sub, "hapus_user", u.nik, { nama: u.nama });
  return Response.json({ ok: true, mode: "hapus" });
});

/** Suspend / aktifkan / reset password satu user. */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const { userId, aksi, alasan, password } = await req.json();
  if (!userId) throw new HttpError(400, "User tidak dikenal.");

  const [u] = await q<any>(`SELECT id, nik, nama, aktif FROM app_user WHERE id = $1`, [userId]);
  if (!u) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (u.id === admin.sub && aksi !== "reset_password") {
    throw new HttpError(400, "Anda tidak bisa menonaktifkan akun sendiri.");
  }

  if (aksi === "suspend") {
    await q(`UPDATE app_user SET aktif = FALSE, suspended_at = now(), suspended_reason = $2 WHERE id = $1`,
      [userId, (alasan || "Dinonaktifkan admin").slice(0, 300)]);
    await auditLog(admin.sub, "suspend_user", u.nik, { alasan });
  } else if (aksi === "aktifkan") {
    await q(`UPDATE app_user SET aktif = TRUE, suspended_at = NULL, suspended_reason = NULL WHERE id = $1`,
      [userId]);
    await auditLog(admin.sub, "aktifkan_user", u.nik);
  } else if (aksi === "reset_password") {
    const pw = String(password ?? "");
    if (pw.length < 8) throw new HttpError(400, "Password minimal 8 karakter.");
    await q(`UPDATE app_user SET password_hash = $2, must_change_password = TRUE WHERE id = $1`,
      [userId, await hashPassword(pw)]);
    await auditLog(admin.sub, "reset_password", u.nik);
  } else {
    throw new HttpError(400, "Aksi tidak dikenal.");
  }
  return Response.json({ ok: true });
});
