import { put } from "@vercel/blob";
import { readSession, handler, HttpError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unggah satu gambar lampiran untuk tiket Supporting.
 *
 * Batasnya ditegakkan di sisi server, bukan hanya di formulir: pemeriksaan
 * di browser mudah dilewati, dan tanpa penjagaan ini satu berkas 200 MB
 * bisa masuk ke penyimpanan hanya dengan memanggil endpoint langsung.
 *
 * Jenis berkas diperiksa dua kali — dari tipe yang dilaporkan browser dan
 * dari beberapa bita pertama isinya. Yang kedua diperlukan karena tipe
 * yang dilaporkan sepenuhnya berasal dari klien: berkas apa pun bisa
 * mengaku sebagai image/png hanya dengan mengganti namanya.
 */

const BATAS = 2 * 1024 * 1024;   // 2 MB
const JENIS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Mengenali gambar dari bita pertamanya (magic number). */
function gambarSungguhan(b: Uint8Array): boolean {
  const cocok = (...pola: number[]) => pola.every((v, i) => b[i] === v);
  return (
    cocok(0xff, 0xd8, 0xff) ||                                   // JPEG
    cocok(0x89, 0x50, 0x4e, 0x47) ||                             // PNG
    cocok(0x47, 0x49, 0x46, 0x38) ||                             // GIF
    (cocok(0x52, 0x49, 0x46, 0x46) &&                            // RIFF….WEBP
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
  );
}

export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");

  if (file.size === 0) throw new HttpError(400, "Berkas kosong.");
  if (file.size > BATAS) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new HttpError(400,
      `Ukuran gambar ${mb} MB, melebihi batas 2 MB. Perkecil dulu gambarnya.`);
  }
  if (!JENIS.includes(file.type)) {
    throw new HttpError(400, "Hanya gambar JPG, PNG, WEBP, atau GIF yang bisa dilampirkan.");
  }

  const isi = new Uint8Array(await file.arrayBuffer());
  if (!gambarSungguhan(isi)) {
    throw new HttpError(400, "Berkas ini bukan gambar yang sah.");
  }

  // Nama diacak: nama asli bisa memuat karakter yang menyulitkan di URL,
  // dan dua orang mengunggah "foto.png" tidak boleh saling menimpa.
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nama = `request/${s.sub}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const blob = await put(nama, Buffer.from(isi), {
    access: "public",
    contentType: file.type,
  });

  return Response.json({ url: blob.url, nama: file.name, ukuran: file.size });
});
