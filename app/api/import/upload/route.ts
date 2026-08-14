import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin, handler } from "@/lib/auth";

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
        allowedContentTypes: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
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
