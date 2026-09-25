import * as XLSX from "xlsx";
import { requireMenu, handler } from "@/lib/auth";
import { q } from "@/lib/db";
import { susunFilter, type Aturan } from "@/lib/pengguna-filter";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

const WAKTU = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
});

const waktuAtauStrip = (v: unknown) => (v ? WAKTU.format(new Date(v as string)) + " WIB" : "");

/**
 * Unduhan Excel dari daftar Pengguna & Akses, memakai penyaring yang PERSIS
 * sama dengan yang dipakai layar (susunFilter dari lib/pengguna-filter) --
 * supaya berkas yang diunduh selalu cocok dengan apa yang sedang dilihat
 * di layar, bukan salinan terpisah yang bisa perlahan berbeda.
 *
 * Beda dari GET biasa: di sini TIDAK ADA batas 500 baris. Layar sengaja
 * dibatasi untuk kecepatan tampilan, tapi unduhan untuk tinjauan offline
 * (mis. memutuskan siapa yang perlu dinonaktifkan) harus memuat semua
 * baris yang cocok dengan saringan, berapa pun jumlahnya.
 */
export const GET = handler(async (req) => {
  await requireMenu("admin_pengguna");
  const url = new URL(req.url);

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

  // status_akun diturunkan sama persis dengan GET /api/admin/pengguna,
  // supaya kolom "Status akun" di berkas selalu cocok dengan yang di layar.
  const sumber = `(
    SELECT v.*,
           CASE WHEN NOT v.aktif OR v.suspended_at IS NOT NULL THEN 'nonaktif'
                WHEN v.akses_30h < 3 THEN 'jarang'
                ELSE 'aktif' END AS status_akun
      FROM v_akses_ringkas v
  ) t`;

  const rows = await q<any>(
    `SELECT nik, nama, peran, COALESCE(jabatan_master, jabatan) AS jabatan, cabang, area, level,
            status_akun, aktif, login_count, akses_7h, akses_30h,
            last_login_at, last_access_at, suspended_at, suspended_reason
       FROM ${sumber} ${where}
      ORDER BY ${orderBy}`, params);

  const LABEL_STATUS: Record<string, string> = {
    aktif: "Aktif", nonaktif: "Nonaktif", jarang: "Jarang akses",
  };

  const data = rows.map((r) => ({
    NIK: r.nik,
    NAMA: r.nama,
    PERAN: r.peran,
    JABATAN: r.jabatan ?? "",
    CABANG: r.cabang ?? "",
    AREA: r.area ?? "",
    LEVEL: r.level ?? "",
    "STATUS AKUN": LABEL_STATUS[r.status_akun] ?? r.status_akun,
    AKTIF: r.aktif ? "Ya" : "Tidak",
    "JUMLAH LOGIN": r.login_count ?? 0,
    "AKSES 7 HARI": r.akses_7h ?? 0,
    "AKSES 30 HARI": r.akses_30h ?? 0,
    "LOGIN TERAKHIR": waktuAtauStrip(r.last_login_at),
    "AKSES TERAKHIR": waktuAtauStrip(r.last_access_at),
    "NONAKTIF SEJAK": waktuAtauStrip(r.suspended_at),
    "ALASAN NONAKTIF": r.suspended_reason ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
    { wch: 10 }, { wch: 13 }, { wch: 7 }, { wch: 10 }, { wch: 11 }, { wch: 12 },
    { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "PENGGUNA & AKSES");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const tanggalBerkas = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pengguna-akses-${tanggalBerkas}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
