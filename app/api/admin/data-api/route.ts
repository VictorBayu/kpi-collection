import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { tarikSemua } from "@/lib/tarik-api";
import { hitungSemuaIndikator } from "@/lib/hitung-indikator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Pengelolaan penarikan data API: master kode cabang, riwayat, dan
 * pemicuan manual.
 *
 * Tarikan manual ada bukan sekadar untuk kenyamanan. Sebelum jadwal
 * jam-jaman dipasang, durasi sebenarnya harus diukur dulu di lingkungan
 * produksi — 57 cabang berisi puluhan ribu baris bisa saja melewati batas
 * waktu function, dan itu hanya ketahuan dengan mencobanya.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const [cabang, riwayat, ringkas] = await Promise.all([
    q<any>(`SELECT branch_id, cabang, area, aktif FROM cabang_api ORDER BY branch_id`),

    q<any>(
      `SELECT id, mulai, selesai, berhasil, tanggal_loc, cabang_diminta,
              cabang_sukses, cabang_gagal, jumlah_baris, durasi_ms, pesan, dipicu_oleh
         FROM tarik_status ORDER BY mulai DESC LIMIT 20`),

    q<any>(
      `SELECT (SELECT COUNT(*)::int FROM data_mentah)                    AS baris,
              (SELECT MAX(ditarik_pada) FROM data_mentah)                AS terakhir,
              (SELECT COUNT(DISTINCT branch_id)::int FROM data_mentah)   AS cabang_terisi,
              (SELECT COUNT(*)::int FROM kpi_row WHERE sumber='api')     AS baris_kpi,
              (SELECT MAX(dihitung_pada) FROM kpi_row WHERE sumber='api') AS kpi_terakhir`),
  ]);

  return Response.json({ cabang, riwayat, ringkas: ringkas[0] ?? {} });
});

/** Tambah atau ubah satu kode cabang API. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const branchId = String(b.branch_id ?? "").trim();
  const cabang = String(b.cabang ?? "").trim().toUpperCase();
  if (!branchId) throw new HttpError(400, "BranchID belum diisi.");
  if (!cabang) throw new HttpError(400, "Nama cabang belum diisi.");

  await q(
    `INSERT INTO cabang_api (branch_id, cabang, area, aktif) VALUES ($1,$2,$3,$4)
     ON CONFLICT (branch_id) DO UPDATE
       SET cabang=EXCLUDED.cabang, area=EXCLUDED.area,
           aktif=EXCLUDED.aktif, updated_at=now()`,
    [branchId, cabang, b.area ? String(b.area).trim().toUpperCase() : null,
     b.aktif !== false]);

  await auditLog(admin.sub, "cabang_api.simpan", branchId, { cabang });
  return Response.json({ ok: true });
});

/**
 * Menempelkan banyak kode cabang sekaligus.
 *
 * Mengetik 57 baris satu per satu lewat formulir adalah pekerjaan yang
 * pasti menghasilkan salah ketik. Format yang diterima sengaja longgar —
 * dipisah koma, titik koma, tab, atau baris baru — karena admin akan
 * menyalinnya dari spreadsheet atau catatan, bukan mengetik ulang.
 */
export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();
  const teks = String(b.teks ?? "");

  const baris = teks.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const masuk: { id: string; cabang: string; area: string | null }[] = [];
  const ditolak: string[] = [];

  for (const l of baris) {
    const bagian = l.split(/[,;\t]/).map((x) => x.trim());
    const id = bagian[0] ?? "";
    const cabang = (bagian[1] ?? "").toUpperCase();
    if (!id || !cabang) { ditolak.push(l); continue; }
    masuk.push({ id, cabang, area: bagian[2] ? bagian[2].toUpperCase() : null });
  }

  for (const m of masuk) {
    await q(
      `INSERT INTO cabang_api (branch_id, cabang, area) VALUES ($1,$2,$3)
       ON CONFLICT (branch_id) DO UPDATE
         SET cabang=EXCLUDED.cabang, area=EXCLUDED.area, updated_at=now()`,
      [m.id, m.cabang, m.area]);
  }

  await auditLog(admin.sub, "cabang_api.tempel", undefined, { masuk: masuk.length });
  return Response.json({ masuk: masuk.length, ditolak });
});

/**
 * PATCH menjalankan penarikan lalu menghitung ulang indikator.
 *
 * Dengan body { hanyaHitung: true }, penarikan dilewati dan hanya
 * perhitungan yang dijalankan ulang atas data mentah yang sudah ada. Ini
 * dibutuhkan karena perhitungan biasanya hanya terpicu oleh tarikan —
 * sehingga indikator yang baru dibuat atau baru diubah pendaftarannya
 * tidak muncul sampai tarikan berikutnya, padahal datanya sudah ada.
 * Menarik 87 ribu baris hanya demi memicu hitung ulang itu pemborosan dan
 * bisa gagal karena kuota API.
 */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));

  if (body?.hanyaHitung) {
    const hitung = await hitungSemuaIndikator();
    await auditLog(admin.sub, "data_api.hitung_ulang", undefined,
      { indikator: hitung.indikator, gagal: hitung.gagal.length });
    return Response.json({ tarik: null, hitung });
  }

  const tarik = await tarikSemua("manual");
  await auditLog(admin.sub, "data_api.tarik_manual", undefined,
    { berhasil: tarik.berhasil, baris: tarik.jumlahBaris });

  if (!tarik.berhasil) return Response.json({ tarik, hitung: null });

  const hitung = await hitungSemuaIndikator();
  return Response.json({ tarik, hitung });
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);

  // Membersihkan riwayat penarikan. Riwayat sudah dipangkas otomatis tiap
  // selesai menarik, tapi tombol manual tetap berguna setelah rentetan
  // kegagalan — daftar merah panjang menyulitkan melihat apakah tarikan
  // terakhir sudah kembali normal.
  if (url.searchParams.get("riwayat") === "1") {
    // Yang terakhir disisakan supaya halaman tidak jadi kosong sama sekali
    // dan admin tetap bisa melihat kapan data sekarang berasal.
    const hasil = await q<{ id: number }>(
      `DELETE FROM tarik_status
        WHERE id <> (SELECT id FROM tarik_status ORDER BY mulai DESC LIMIT 1)
        RETURNING id`);
    await auditLog(admin.sub, "tarik_status.bersihkan", undefined,
      { dihapus: hasil.length });
    return Response.json({ ok: true, dihapus: hasil.length });
  }

  const branchId = url.searchParams.get("branch_id");
  if (!branchId) throw new HttpError(400, "BranchID belum diisi.");
  await q(`DELETE FROM cabang_api WHERE branch_id = $1`, [branchId]);
  await auditLog(admin.sub, "cabang_api.hapus", branchId);
  return Response.json({ ok: true });
});
