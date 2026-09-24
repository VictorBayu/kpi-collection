import { requireAdmin, requireMenu, handler, HttpError, hashPassword } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Peran sah dibaca dari database, bukan ditulis di kode.
 *
 * Sejak peran bisa dikelola admin (schema-peran-v12), daftar tetap di sini
 * akan menolak peran baru yang baru saja dibuat lewat layar Peran & Hak
 * Akses — kegagalan yang membingungkan karena perannya jelas-jelas ada.
 */
async function peranSah(): Promise<Set<string>> {
  const rows = await q<{ kode: string }>(`SELECT kode FROM peran WHERE aktif`);
  return new Set(rows.map((r) => r.kode));
}

/** Membersihkan dan memeriksa isian form pengguna. */
function bacaForm(b: any, wajibPassword: boolean, sah: Set<string>) {
  const nik = String(b.nik ?? "").trim();
  const nama = String(b.nama ?? "").trim();
  const peran = String(b.peran ?? "karyawan");
  const password = String(b.password ?? "");

  if (!/^\d{4,16}$/.test(nik)) {
    throw new HttpError(400, "NIK harus berupa angka 4–16 digit.");
  }
  if (nama.length < 2) throw new HttpError(400, "Nama belum diisi.");
  if (!sah.has(peran)) throw new HttpError(400, `Peran "${peran}" tidak dikenal.`);
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

/**
 * Kolom yang boleh disaring, beserta jenis nilainya.
 *
 * Daftar ini juga dikirim ke browser sebagai penentu operator apa yang
 * masuk akal untuk tiap kolom — jadi hanya ada satu sumber kebenaran, dan
 * penyaring di layar tidak pernah menawarkan sesuatu yang tidak didukung
 * server.
 */
const KOLOM: Record<string, { label: string; jenis: "teks" | "angka" | "pilihan" | "tanggal"; sql: string; opsi?: string[] }> = {
  nama:      { label: "Nama",        jenis: "teks",    sql: "nama" },
  nik:       { label: "NIK",         jenis: "teks",    sql: "nik" },
  jabatan:   { label: "Jabatan",     jenis: "teks",    sql: "COALESCE(jabatan_master, jabatan)" },
  cabang:    { label: "Cabang",      jenis: "teks",    sql: "cabang" },
  area:      { label: "Area",        jenis: "teks",    sql: "area" },
  peran:     { label: "Peran",       jenis: "pilihan", sql: "peran", opsi: ["karyawan", "atasan", "admin"] },
  level:     { label: "Level",       jenis: "teks",    sql: "level" },
  akses_30h: { label: "Akses 30 hari", jenis: "angka", sql: "akses_30h" },
  akses_7h:  { label: "Akses 7 hari",  jenis: "angka", sql: "akses_7h" },
  login_count: { label: "Jumlah login", jenis: "angka", sql: "login_count" },
  status:    { label: "Status akun", jenis: "pilihan", sql: "status_akun",
               opsi: ["aktif", "nonaktif", "jarang"] },
  last_access_at: { label: "Terakhir akses", jenis: "tanggal", sql: "last_access_at" },
};

/** Operator per jenis kolom. */
const OPERATOR: Record<string, { kode: string; label: string }[]> = {
  teks: [
    { kode: "mengandung", label: "mengandung" },
    { kode: "tidak_mengandung", label: "tidak mengandung" },
    { kode: "sama", label: "sama persis" },
    { kode: "mulai", label: "diawali" },
    { kode: "kosong", label: "kosong" },
    { kode: "terisi", label: "terisi" },
  ],
  angka: [
    { kode: "sama", label: "sama dengan" },
    { kode: "lebih", label: "lebih dari" },
    { kode: "lebih_sama", label: "minimal" },
    { kode: "kurang", label: "kurang dari" },
    { kode: "kurang_sama", label: "maksimal" },
    { kode: "antara", label: "antara" },
  ],
  pilihan: [
    { kode: "sama", label: "adalah" },
    { kode: "bukan", label: "bukan" },
  ],
  tanggal: [
    { kode: "sebelum", label: "sebelum" },
    { kode: "sesudah", label: "sesudah" },
    { kode: "kosong", label: "belum pernah" },
    { kode: "terisi", label: "pernah" },
  ],
};

type Aturan = { kolom: string; operator: string; nilai?: string; nilai2?: string };

/**
 * Menyusun potongan WHERE dari aturan penyaring.
 *
 * Nilai TIDAK PERNAH disisipkan langsung ke teks kueri — hanya nama kolom
 * dan operator yang berasal dari daftar tetap di atas, sedangkan nilai dari
 * pengguna selalu lewat parameter. Dengan begitu isian apa pun di kotak
 * filter tidak bisa mengubah arti kueri.
 */
function susunFilter(aturan: Aturan[], params: any[]) {
  const bagian: string[] = [];

  for (const a of aturan) {
    const def = KOLOM[a.kolom];
    if (!def) continue;
    const ops = OPERATOR[def.jenis].map((o) => o.kode);
    if (!ops.includes(a.operator)) continue;

    const kol = def.sql;
    const nilai = String(a.nilai ?? "").trim();

    switch (a.operator) {
      case "kosong":
        bagian.push(`(${kol} IS NULL OR ${kol}::text = '')`); break;
      case "terisi":
        bagian.push(`(${kol} IS NOT NULL AND ${kol}::text <> '')`); break;
      case "mengandung":
        params.push(`%${nilai}%`); bagian.push(`${kol} ILIKE $${params.length}`); break;
      case "tidak_mengandung":
        params.push(`%${nilai}%`);
        bagian.push(`(${kol} IS NULL OR ${kol} NOT ILIKE $${params.length})`); break;
      case "mulai":
        params.push(`${nilai}%`); bagian.push(`${kol} ILIKE $${params.length}`); break;
      case "sama":
        if (def.jenis === "angka") { params.push(Number(nilai) || 0); bagian.push(`${kol} = $${params.length}`); }
        else { params.push(nilai); bagian.push(`${kol} ILIKE $${params.length}`); }
        break;
      case "bukan":
        params.push(nilai); bagian.push(`(${kol} IS NULL OR ${kol} <> $${params.length})`); break;
      case "lebih":       params.push(Number(nilai) || 0); bagian.push(`${kol} > $${params.length}`); break;
      case "lebih_sama":  params.push(Number(nilai) || 0); bagian.push(`${kol} >= $${params.length}`); break;
      case "kurang":      params.push(Number(nilai) || 0); bagian.push(`${kol} < $${params.length}`); break;
      case "kurang_sama": params.push(Number(nilai) || 0); bagian.push(`${kol} <= $${params.length}`); break;
      case "antara":
        params.push(Number(nilai) || 0, Number(a.nilai2) || 0);
        bagian.push(`${kol} BETWEEN $${params.length - 1} AND $${params.length}`); break;
      case "sebelum":
        params.push(nilai); bagian.push(`${kol} < $${params.length}::timestamptz`); break;
      case "sesudah":
        params.push(nilai); bagian.push(`${kol} > $${params.length}::timestamptz`); break;
    }
  }
  return bagian;
}

/** Daftar pengguna + statistik akses, dengan penyaring bersusun. */
export const GET = handler(async (req) => {
  await requireMenu("admin_pengguna");
  const url = new URL(req.url);

  // Bentuk lama (cari/peran/status) tetap didukung supaya tautan yang sudah
  // beredar tidak rusak.
  const cari = url.searchParams.get("cari") || "";
  const urut = url.searchParams.get("urut") || "akses";
  const gabung = url.searchParams.get("gabung") === "atau" ? " OR " : " AND ";

  let aturan: Aturan[] = [];
  try {
    aturan = JSON.parse(url.searchParams.get("filter") || "[]");
    if (!Array.isArray(aturan)) aturan = [];
  } catch { aturan = [] }

  const params: any[] = [];
  const kondisi: string[] = [];

  if (cari) {
    params.push(`%${cari}%`);
    kondisi.push(`(nik ILIKE $${params.length} OR nama ILIKE $${params.length})`);
  }

  const dariFilter = susunFilter(aturan.slice(0, 8), params);
  if (dariFilter.length) kondisi.push(`(${dariFilter.join(gabung)})`);

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";

  const orderBy =
    urut === "login" ? "login_count ASC"
    : urut === "nama" ? "nama ASC"
    : urut === "cabang" ? "cabang ASC NULLS LAST, nama ASC"
    : urut === "akses_turun" ? "akses_30h DESC"
    : "akses_30h ASC";

  // status_akun diturunkan di sini supaya bisa disaring seperti kolom biasa.
  const sumber = `(
    SELECT v.*,
           CASE WHEN NOT v.aktif OR v.suspended_at IS NOT NULL THEN 'nonaktif'
                WHEN v.akses_30h < 3 THEN 'jarang'
                ELSE 'aktif' END AS status_akun
      FROM v_akses_ringkas v
  ) t`;

  const rows = await q<any>(
    `SELECT id, nik, nama, peran, jabatan, jabatan_master, level, cabang, area, aktif,
            login_count, access_count, akses_7h, akses_30h,
            last_login_at, last_access_at, suspended_at, suspended_reason, status_akun
       FROM ${sumber} ${where}
      ORDER BY ${orderBy}
      LIMIT 500`, params);

  const [stat] = await q<any>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status_akun = 'aktif')::int    AS aktif,
            COUNT(*) FILTER (WHERE status_akun = 'nonaktif')::int AS suspend,
            COUNT(*) FILTER (WHERE status_akun = 'jarang')::int   AS jarang
       FROM ${sumber}`);

  const [cocok] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${sumber} ${where}`, params);

  // Nilai unik untuk kolom yang enak dipilih daripada diketik
  const pilihan = await q<any>(
    `SELECT
       (SELECT COALESCE(json_agg(DISTINCT cabang ORDER BY cabang), '[]'::json)
          FROM v_akses_ringkas WHERE cabang IS NOT NULL) AS cabang,
       (SELECT COALESCE(json_agg(DISTINCT area ORDER BY area), '[]'::json)
          FROM v_akses_ringkas WHERE area IS NOT NULL) AS area,
       (SELECT COALESCE(json_agg(DISTINCT COALESCE(jabatan_master, jabatan)
               ORDER BY COALESCE(jabatan_master, jabatan)), '[]'::json)
          FROM v_akses_ringkas WHERE jabatan IS NOT NULL) AS jabatan`);

  return Response.json({
    list: rows, stat, cocok: cocok.n,
    skema: {
      kolom: Object.entries(KOLOM).map(([k, v]) => ({
        kode: k, label: v.label, jenis: v.jenis, opsi: v.opsi,
      })),
      operator: OPERATOR,
      pilihan: pilihan[0] ?? {},
    },
  });
});

/** Tambah pengguna baru. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const f = bacaForm(await req.json(), true, await peranSah());

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

  const f = bacaForm(body, false, await peranSah());

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
