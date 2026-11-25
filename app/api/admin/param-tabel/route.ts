import { requireMenu, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import {
  daftarTabel, muatDokumen, simpanDokumen, salinVersi, hapusVersi, ParamSalah,
} from "@/lib/param-tabel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kesalahan isian dikembalikan sebagai 400 dengan pesan yang bisa dibaca admin. */
async function aman<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e: any) {
    if (e instanceof ParamSalah) throw new HttpError(400, e.message);
    throw e;
  }
}

export const GET = handler(async (req) => {
  await requireMenu("admin_param_tabel");
  const id = new URL(req.url).searchParams.get("id");

  const [kolom, produk] = await Promise.all([
    q<any>(`SELECT kolom, label, jenis, kelompok, COALESCE(sumber,'api') AS sumber
              FROM mentah_kolom WHERE COALESCE(aktif,true)
             ORDER BY sumber, urutan, label`),
    q<any>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),
  ]);

  if (id) {
    const dokumen = await muatDokumen(id);
    if (!dokumen) throw new HttpError(404, "Tabel tidak ditemukan.");
    return Response.json({ dokumen, kolom, produk });
  }
  return Response.json({ tabel: await daftarTabel(), kolom, produk });
});

/** aksi: "simpan" (dokumen utuh) atau "salin" (versi baru dari versi lain). */
export const POST = handler(async (req) => {
  const admin = await requireMenu("admin_param_tabel");
  const b = await req.json();

  if (b.aksi === "salin") {
    const id = await aman(() => salinVersi(String(b.id ?? ""), String(b.berlaku_mulai ?? "")));
    await auditLog(admin.sub, "param_tabel.salin", String(b.id), { ke: b.berlaku_mulai, id });
    return Response.json({ ok: true, id });
  }

  const id = await aman(() => simpanDokumen(b.dokumen));
  await auditLog(admin.sub, "param_tabel.simpan", String(b.dokumen?.kode ?? ""), {
    id, sumbu: b.dokumen?.dimensi?.length ?? 0, sel: b.dokumen?.sel?.length ?? 0,
  });
  return Response.json({ ok: true, id });
});

export const DELETE = handler(async (req) => {
  const admin = await requireMenu("admin_param_tabel");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const kode = await aman(() => hapusVersi(id));
  await auditLog(admin.sub, "param_tabel.hapus", kode, { id });
  return Response.json({ ok: true });
});
