import * as XLSX from "xlsx";
import { requireAdmin, handler } from "@/lib/auth";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/**
 * Berkas contoh untuk impor pengguna.
 *
 * Sengaja berisi dua baris contoh yang sudah terisi, bukan hanya judul
 * kolom. Admin yang membuka berkas kosong biasanya menebak-nebak format
 * NIK dan penulisan cabang; dengan contoh, dugaan itu tidak perlu terjadi.
 *
 * Sheet kedua memuat keterangan tiap kolom supaya berkasnya bisa berdiri
 * sendiri tanpa harus membuka dokumentasi terpisah.
 */
export const GET = handler(async () => {
  await requireAdmin();

  const data = [
    {
      NIK: "20240117",
      NAMA: "CONTOH NAMA KARYAWAN",
      JABATAN: "FC TT R2",
      CABANG: "MANADO",
      AREA: "AREA SULUT-TENG-GO",
      PERAN: "karyawan",
      PASSWORD: "Smart@123",
      AKTIF: "ya",
    },
    {
      NIK: "20220915",
      NAMA: "CONTOH NAMA ATASAN",
      JABATAN: "BM",
      CABANG: "MANADO",
      AREA: "AREA SULUT-TENG-GO",
      PERAN: "atasan",
      PASSWORD: "Smart@123",
      AKTIF: "ya",
    },
  ];

  const keterangan = [
    { KOLOM: "NIK", WAJIB: "ya", KETERANGAN: "Angka 4–16 digit. Menjadi nama pengguna saat login." },
    { KOLOM: "NAMA", WAJIB: "ya", KETERANGAN: "Nama lengkap sesuai data kepegawaian." },
    { KOLOM: "JABATAN", WAJIB: "tidak", KETERANGAN: "Harus cocok dengan Master Hierarki (boleh memakai alias, mis. 'FC TT R2')." },
    { KOLOM: "CABANG", WAJIB: "tidak", KETERANGAN: "Nama cabang. Dipakai menentukan siapa atasan yang bisa melihat KPI-nya." },
    { KOLOM: "AREA", WAJIB: "tidak", KETERANGAN: "Nama area. Wajib diisi untuk AM/ACH yang tidak terikat satu cabang." },
    { KOLOM: "PERAN", WAJIB: "tidak", KETERANGAN: "karyawan | atasan | admin. Kosong dianggap 'karyawan'. Menentukan menu yang tampil." },
    { KOLOM: "PASSWORD", WAJIB: "tidak", KETERANGAN: "Password awal, minimal 8 karakter. Kosong = dibuatkan otomatis dan wajib diganti saat login." },
    { KOLOM: "AKTIF", WAJIB: "tidak", KETERANGAN: "ya | tidak. Kosong dianggap 'ya'." },
  ];

  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 20 },
    { wch: 24 }, { wch: 11 }, { wch: 14 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "PENGGUNA");

  const wsKet = XLSX.utils.json_to_sheet(keterangan);
  wsKet["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, wsKet, "PETUNJUK");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-impor-pengguna.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
