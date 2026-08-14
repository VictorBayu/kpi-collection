import { readSession, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";

const STATUS = ["baru", "diproses", "butuh_info", "selesai", "ditolak"];

async function ambilTiket(id: string, s: { sub: string; peran: string }) {
  const [t] = await q<any>(
    `SELECT r.*, u.nama AS pemohon, u.nik AS pemohon_nik, u.cabang,
            p.nama AS petugas
       FROM request r
       JOIN app_user u ON u.id = r.user_id
       LEFT JOIN app_user p ON p.id = r.petugas_id
      WHERE r.id = $1`, [id]);

  if (!t) throw new HttpError(404, "Tiket tidak ditemukan.");
  if (s.peran !== "admin" && t.user_id !== s.sub) {
    throw new HttpError(403, "Tiket ini milik karyawan lain.");
  }
  return t;
}

/** Detail tiket beserta percakapannya. */
export const GET = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const tiket = await ambilTiket(id, s);
  const pesan = await q<any>(
    `SELECT m.peran, m.pesan, m.created_at, u.nama
       FROM request_message m JOIN app_user u ON u.id = m.user_id
      WHERE m.request_id = $1 ORDER BY m.created_at`, [id]);

  return Response.json({ tiket, pesan });
});

/** Balasan baru dari kedua pihak. */
export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const tiket = await ambilTiket(id, s);
  if (["selesai", "ditolak"].includes(tiket.status)) {
    throw new HttpError(400, "Tiket ini sudah ditutup. Ajukan tiket baru kalau masih ada selisih.");
  }

  const { pesan } = await req.json();
  if (!pesan?.trim()) throw new HttpError(400, "Tulis pesan terlebih dahulu.");

  const admin = s.peran === "admin";
  await q(`INSERT INTO request_message (request_id, user_id, peran, pesan)
           VALUES ($1,$2,$3,$4)`, [id, s.sub, admin ? "admin" : "karyawan", pesan.trim()]);

  // Balasan pertama admin otomatis memindahkan tiket ke Diproses
  await q(
    `UPDATE request
        SET updated_at = now(),
            status = CASE WHEN $2 AND status = 'baru' THEN 'diproses' ELSE status END,
            petugas_id = CASE WHEN $2 THEN $3 ELSE petugas_id END
      WHERE id = $1`, [id, admin, s.sub]);

  return Response.json({ ok: true });
});

/** Admin mengubah status dan menuliskan hasil yang dibaca pemohon. */
export const PATCH = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const { status, hasil, batalkan } = await req.json();

  // Pemohon hanya boleh membatalkan tiketnya sendiri
  if (batalkan) {
    const t = await ambilTiket(id, s);
    if (t.status === "selesai") throw new HttpError(400, "Tiket yang sudah selesai tidak bisa dibatalkan.");
    await q(`UPDATE request SET status='ditolak', hasil='Dibatalkan oleh pemohon.', updated_at=now()
              WHERE id=$1`, [id]);
    return Response.json({ ok: true });
  }

  if (s.peran !== "admin") throw new HttpError(403, "Hanya admin data yang bisa mengubah status.");
  if (!STATUS.includes(status)) throw new HttpError(400, "Status tidak dikenal.");
  if (["selesai", "ditolak"].includes(status) && !hasil?.trim()) {
    throw new HttpError(400, "Tuliskan hasil tindak lanjut sebelum menutup tiket. Pemohon membaca bagian ini.");
  }

  await q(
    `UPDATE request SET status=$2, hasil=COALESCE(NULLIF($3,''), hasil),
            petugas_id=$4, updated_at=now() WHERE id=$1`,
    [id, status, hasil ?? "", s.sub]);

  await q(`INSERT INTO request_message (request_id, user_id, peran, pesan)
           VALUES ($1,$2,'admin',$3)`,
    [id, s.sub, hasil?.trim() ? `[${label(status)}] ${hasil.trim()}` : `Status diubah menjadi ${label(status)}.`]);

  await auditLog(s.sub, "ubah_status_request", id, { status });
  return Response.json({ ok: true });
});

const label = (s: string) =>
  ({ baru: "Menunggu", diproses: "Diproses", butuh_info: "Butuh info",
     selesai: "Selesai", ditolak: "Ditolak" }[s] ?? s);
