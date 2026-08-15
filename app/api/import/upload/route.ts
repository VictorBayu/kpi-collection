import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin, handler } from "@/lib/auth";

// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Memberi token agar browser mengunggah LANGSUNG ke Vercel Blob.
 * Ini melewati batas body 4,5 MB pada route handler serverless.
 */
export const POST = handler(async (req: Request) => {
  const body = (await req.json()) as HandleUploadBody;

  const hasil = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      await requireAdmin();                     // hanya admin boleh unggah
      if (!/\.(xlsx|xls)$/i.test(pathname)) {
        throw new Error("Format berkas harus .xlsx atau .xls");
      }
      return {
        // Sengaja tidak membatasi allowedContentTypes: browser kadang
        // mengirim octet-stream atau tipe kosong untuk .xlsx, yang membuat
        // Blob menolak dengan 400. Keamanan format dijaga oleh cek ekstensi
        // .xlsx/.xls di atas dan oleh parser yang menolak isi non-Excel.
        maximumSizeInBytes: 20 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ at: Date.now() }),
      };
    },
    onUploadCompleted: async ({ blob }) => {
      console.log("berkas tersimpan:", blob.pathname);
    },
  });

  return Response.json(hasil);
});
