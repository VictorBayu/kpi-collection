import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireMenu, handler } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Token unggah langsung ke Vercel Blob, sama seperti /api/import/upload —
 * melewati batas body 4,5 MB pada route handler serverless. Batasnya
 * dinaikkan ke 40 MB (bukan 20 MB seperti impor KPI/insentif): arsip data
 * mentah membawa puluhan ribu baris kali puluhan kolom sekaligus, jauh
 * lebih besar dari berkas impor per periode.
 */
export const POST = handler(async (req: Request) => {
  const body = (await req.json()) as HandleUploadBody;

  const hasil = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      await requireMenu("admin_arsip_mentah");
      if (!/\.(xlsx|xls)$/i.test(pathname)) {
        throw new Error("Format berkas harus .xlsx atau .xls");
      }
      return {
        maximumSizeInBytes: 40 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ at: Date.now() }),
      };
    },
    onUploadCompleted: async ({ blob }) => {
      console.log("arsip data mentah tersimpan:", blob.pathname);
    },
  });

  return Response.json(hasil);
});
