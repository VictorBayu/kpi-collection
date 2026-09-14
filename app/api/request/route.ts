import { readSession, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { KATEGORI } from "@/lib/request";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";


/** Daftar tiket. Karyawan melihat miliknya, admin melihat semua. */
export const GET = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const cari = url.searchParams.get("cari");
  const admin = s.peran === "admin";

  const rows = await q<any>(
    `SELECT r.id, r.nomor, r.kategori, r.periode, r.judul, r.status, r.prioritas,
            r.hasil, r.created_at, r.updated_at,
            u.nama AS pemohon, u.nik AS pemohon_nik, p.nama AS petugas,
            (SELECT COUNT(*) FROM request_message m WHERE m.request_id = r.id)::int AS pesan,
            CASE WHEN $1::boolean
                 THEN r.updated_at > COALESCE(r.dilihat_admin_at, 'epoch')
                 ELSE r.updated_at > COALESCE(r.dilihat_user_at,  'epoch')
            END AS belum_dibaca
       FROM request r
       JOIN app_user u ON u.id = r.user_id
       LEFT JOIN app_user p ON p.id = r.petugas_id
      WHERE ($1::boolean OR r.user_id = $2)
        AND ($3::text IS NULL OR r.status = $3)
        AND ($4::text IS NULL OR r.judul ILIKE '%'||$4||'%' OR r.nomor ILIKE '%'||$4||'%'
             OR u.nama ILIKE '%'||$4||'%' OR u.nik ILIKE '%'||$4||'%')
      ORDER BY (r.status IN ('baru','butuh_info')) DESC, r.created_at DESC
      LIMIT 100`,
    [admin, s.sub, status, cari]);

  const [stat] = await q<any>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='baru')::int AS baru,
            COUNT(*) FILTER (WHERE status IN ('diproses','butuh_info'))::int AS proses,
            COUNT(*) FILTER (WHERE status='selesai')::int AS selesai
       FROM request r WHERE ($1::boolean OR r.user_id = $2)`, [admin, s.sub]);

  return Response.json({ list: rows, stat, admin, kategori: KATEGORI });
});

/** Ajukan tiket baru. */
export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");

  const { kategori, periode, judul, deskripsi, prioritas, lampiran, lampiran_nama }
    = await req.json();

  if (!KATEGORI.includes(kategori)) throw new HttpError(400, "Pilih kategori terlebih dahulu.");
  if (!judul || judul.trim().length < 8) {
    throw new HttpError(400, "Tulis judul minimal 8 karakter, misalnya “Setoran 8 Agustus belum masuk”.");
  }
  if (!deskripsi || deskripsi.trim().length < 20) {
    throw new HttpError(400, "Jelaskan detailnya minimal 20 karakter. Sebutkan nomor kontrak atau angka pembanding.");
  }

  // Nomor urut per bulan. Indeks unik menjaga dari tabrakan; ulangi bila kalah cepat.
  for (let coba = 0; coba < 3; coba++) {
    try {
      const [r] = await q<{ id: string; nomor: string }>(
        `INSERT INTO request (nomor, user_id, kategori, periode, judul, deskripsi,
                              prioritas, lampiran_url, lampiran_nama)
         SELECT 'REQ-' || to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYYMM') || '-' ||
                lpad((COALESCE(MAX(substring(nomor from 13)::int),0)+1)::text, 4, '0'),
                $1,$2,$3,$4,$5,$6,$7,$8
           FROM request
          WHERE nomor LIKE 'REQ-' || to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYYMM') || '-%'
         RETURNING id, nomor`,
        [s.sub, kategori, periode || null, judul.trim(), deskripsi.trim(),
         prioritas ?? "normal", lampiran || null, lampiran_nama || null]);

      // Lampiran ikut dibawa ke pesan pertama supaya tampil di dalam
      // percakapan, bukan hanya di kepala tiket — pembaca menelusuri
      // percakapan, dan gambar yang hanya ada di atas mudah terlewat.
      await q(`INSERT INTO request_message
                 (request_id, user_id, peran, pesan, lampiran_url, lampiran_nama)
               VALUES ($1,$2,'karyawan',$3,$4,$5)`,
        [r.id, s.sub, deskripsi.trim(), lampiran || null, lampiran_nama || null]);
      await auditLog(s.sub, "buat_request", r.id, { kategori });

      return Response.json({ ok: true, id: r.id, nomor: r.nomor });
    } catch (e: any) {
      if (coba === 2 || !String(e.message).includes("nomor")) throw e;
    }
  }
  throw new HttpError(500, "Nomor tiket gagal dibuat. Coba kirim ulang.");
});
