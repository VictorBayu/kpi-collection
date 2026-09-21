import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Baris data mentah di balik satu komponen rumus — berhalaman.
 *
 * Dipisah dari /api/admin/tracing karena dua alasan yang berlawanan
 * arah tapi mengarah ke keputusan yang sama:
 *
 *  - Seorang staf punya puluhan kontrak, tapi seorang BCH bisa punya
 *    ribuan. Menitipkan semuanya di muatan jejak akan membuat layar
 *    utama menunggu data yang belum tentu dibuka siapa pun.
 *  - Sebaliknya, membatasi diam-diam di 15 baris seperti sebelumnya
 *    membuat totalnya tidak bisa dipercaya: admin melihat 15 baris
 *    tersaring lalu menyimpulkan "semua tersaring", padahal itu cuma
 *    15 yang kebetulan paling atas.
 *
 * Jadi: dimuat hanya saat dibuka, berhalaman, DAN total di bawahnya
 * dihitung dari SELURUH baris — bukan dari halaman yang sedang tampil.
 */

const PER_HALAMAN = 15;
const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;
const KOLOM_PIC: Record<string, "staff" | "spv" | "bch"> = {
  staff: "staff", spv: "spv", bch: "bch",
};

/**
 * Potongan WHERE untuk satu syarat.
 *
 * Ditulis mengikuti `potonganSyarat` di lib/rumus.ts — operator,
 * placeholder, dan bentuk ANY(...) untuk larik semuanya sama. Kalau
 * suatu saat daftar operator di sana bertambah, tempat ini ikut
 * diperbarui; menampilkan baris dengan aturan yang berbeda dari mesin
 * hitung lebih buruk daripada tidak menampilkan apa-apa.
 */
function potongan(
  s: { kolom: string; operator: string; nilai: string[] }, params: any[],
): string {
  const kolomSql = `"${s.kolom}"`;
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const satu = () => s.nilai[0] ?? "";
  switch (s.operator) {
    case "kosong": return `(${kolomSql} IS NULL OR ${kolomSql}::text = '')`;
    case "terisi": return `(${kolomSql} IS NOT NULL AND ${kolomSql}::text <> '')`;
    case "sama": return `${kolomSql}::text = ${p(satu())}`;
    case "tidak_sama": return `(${kolomSql} IS NULL OR ${kolomSql}::text <> ${p(satu())})`;
    case "termasuk": return `${kolomSql}::text = ANY(${p(s.nilai)}::text[])`;
    case "tidak_termasuk": return `(${kolomSql} IS NULL OR NOT (${kolomSql}::text = ANY(${p(s.nilai)}::text[])))`;
    case "mengandung": return `${kolomSql}::text ILIKE ${p("%" + satu() + "%")}`;
    case "lebih": return `${kolomSql} > ${p(satu())}`;
    case "lebih_sama": return `${kolomSql} >= ${p(satu())}`;
    case "kurang": return `${kolomSql} < ${p(satu())}`;
    case "kurang_sama": return `${kolomSql} <= ${p(satu())}`;
    case "antara": return `${kolomSql} BETWEEN ${p(s.nilai[0] ?? "")} AND ${p(s.nilai[1] ?? "")}`;
    default: return "true";
  }
}

export const GET = handler(async (req) => {
  await requireAdmin();
  const u = new URL(req.url);
  const nik = (u.searchParams.get("nik") ?? "").trim();
  const produk = (u.searchParams.get("produk") ?? "").trim();
  const indikatorId = (u.searchParams.get("indikator_id") ?? "").trim();
  const urutan = Number(u.searchParams.get("komponen") ?? 0);
  const hal = Math.max(1, Number(u.searchParams.get("hal") ?? 1));
  // Penyaring tampilan saja (cari no. kontrak, status syarat). Rekap di
  // bawah SENGAJA tetap dihitung atas seluruh baris — kalau ikut
  // tersaring, "Yang terpakai rumus" akan berubah tiap admin mengetik
  // di kotak cari, dan angka itu tidak lagi sama dengan mesin hitung.
  const cari = (u.searchParams.get("cari") ?? "").trim();
  const status = u.searchParams.get("status") ?? "semua";

  if (!nik || !produk || !indikatorId) {
    throw new HttpError(400, "nik, produk, dan indikator_id wajib diisi.");
  }

  // Keduanya hanya berbekal indikatorId dan tidak saling menunggu, jadi
  // berangkat bersama. Driver Neon berbicara lewat HTTP: tiap kueri satu
  // perjalanan bolak-balik, dan menjalankannya berurutan berarti membayar
  // ongkos jarak dua kali untuk pekerjaan yang muat dalam satu giliran.
  const [defRows, daftarKomponen] = await Promise.all([
    q<any>(
      `SELECT peran_pic FROM indikator_def WHERE id = $1::uuid`, [indikatorId]),

    // Komponen ke-`urutan`. Rumus bersusun (A - B) punya bahan yang
    // berbeda di tiap sisinya, jadi sisi mana yang sedang dilihat ikut
    // dipilih — bukan selalu yang pertama.
    q<any>(
    `SELECT k.id, k.urutan, k.agregat, k.kolom, k.gabung_syarat,
            COALESCE(mk.label, k.kolom) AS kolom_label,
            (SELECT json_agg(json_build_object(
                      'kolom', s.kolom, 'label', COALESCE(ms.label, s.kolom),
                      'operator', s.operator, 'nilai', s.nilai) ORDER BY s.urutan)
               FROM indikator_syarat s
               LEFT JOIN mentah_kolom ms ON ms.kolom = s.kolom
              WHERE s.komponen_id = k.id) AS syarat
       FROM indikator_komponen k
       LEFT JOIN mentah_kolom mk ON mk.kolom = k.kolom
      WHERE k.indikator_id = $1::uuid
      ORDER BY k.urutan`, [indikatorId]),
  ]);

  const def = defRows[0];
  if (!def) throw new HttpError(404, "Indikator tidak ditemukan.");
  const pic = KOLOM_PIC[def.peran_pic] ?? "staff";
  const kolomNik = `nik_${pic}`;

  if (!daftarKomponen.length) {
    return Response.json({ kosong: true, pesan: "Indikator ini tidak punya komponen rumus." });
  }
  const komponen = daftarKomponen.find((k) => k.urutan === urutan) ?? daftarKomponen[0];

  const kolomUtama: string | null = komponen.kolom;
  if (kolomUtama && !POLA_KOLOM.test(kolomUtama)) {
    throw new HttpError(400, "Nama kolom komponen tidak sah.");
  }
  const syaratList: { kolom: string; label: string; operator: string; nilai: string[] }[] =
    komponen.syarat ?? [];
  for (const s of syaratList) {
    if (!POLA_KOLOM.test(s.kolom)) throw new HttpError(400, "Nama kolom syarat tidak sah.");
  }

  const kolomTampil = [...new Set([
    "agreement_no",
    ...(kolomUtama ? [kolomUtama] : []),
    ...syaratList.map((s) => s.kolom),
  ])];
  const select = kolomTampil.map((k) => `"${k}"`).join(", ");

  const params: any[] = [nik, produk];
  const lulusExpr = syaratList.length
    ? `(${syaratList.map((s) => potongan(s, params))
        .join(komponen.gabung_syarat === "atau" ? " OR " : " AND ")})`
    : "true";

  // Penyaring dasar: hanya kontrak yang dipegang NIK ini pada peran
  // yang benar (staff/spv/bch sesuai indikatornya), dan hanya produk
  // yang sedang dinilai. Sama persis dengan penyaring di mesin hitung.
  const dasar = `
      FROM data_mentah
     WHERE "${kolomNik}" = $1
       AND upper(btrim(COALESCE(product,''))) = upper($2)`;

  const kolomJumlah = kolomUtama ? `"${kolomUtama}"` : "NULL::numeric";

  // Params rekap dan params daftar dipisah: potongan syarat sudah
  // menempelkan placeholder $3.. ke `params`, dan penyaring tampilan
  // harus menyambung SETELAH itu tanpa mengubah kueri rekap.
  const paramsDaftar = [...params];
  let saring = "";
  if (cari) {
    paramsDaftar.push(`%${cari}%`);
    saring += ` AND COALESCE(agreement_no::text,'') ILIKE $${paramsDaftar.length}`;
  }
  if (status === "lolos") saring += ` AND (${lulusExpr}) IS TRUE`;
  else if (status === "tersaring") saring += ` AND (${lulusExpr}) IS NOT TRUE`;

  // Disalin SEBELUM offset/limit ditempelkan. Kueri hitung tidak menyebut
  // kedua placeholder itu, dan mengirim parameter yang tidak dirujuk
  // ditolak server sebagai jumlah parameter yang tidak cocok.
  const paramsHitung = [...paramsDaftar];
  const pOffset = `$${paramsDaftar.push((hal - 1) * PER_HALAMAN)}`;
  const pLimit = `$${paramsDaftar.push(PER_HALAMAN)}`;

  // Ketiganya membaca data_mentah dengan penyaring yang sudah jadi dan
  // tidak ada yang memakai hasil yang lain, jadi dijalankan serentak.
  // Sebelumnya berurutan — rekap, lalu hitung, lalu baris — sehingga
  // membuka satu komponen rumus menunggu tiga giliran penuh padahal
  // ketiganya bisa selesai dalam waktu yang paling lama di antaranya.
  const [rekapRows, tampilRows, baris] = await Promise.all([
    // Rekap dihitung atas SELURUH baris, bukan atas halaman yang tampil.
    q<any>(
      `SELECT COUNT(*)::int AS jml,
              COUNT(*) FILTER (WHERE ${lulusExpr})::int AS jml_lolos,
              COALESCE(SUM(${kolomJumlah}), 0) AS total,
              COALESCE(SUM(${kolomJumlah}) FILTER (WHERE ${lulusExpr}), 0) AS total_lolos
         ${dasar}`, params),

    // Tanpa penyaring tampilan, jumlahnya sama dengan rekap — tidak perlu
    // kueri kedua yang menghitung hal yang persis sama.
    saring
      ? q<any>(`SELECT COUNT(*)::int AS jml ${dasar}${saring}`, paramsHitung)
      : Promise.resolve(null),

    q<any>(
      `SELECT ${select}, (${lulusExpr}) AS lulus_syarat
         ${dasar}${saring}
        ORDER BY id DESC
        OFFSET ${pOffset} LIMIT ${pLimit}`, paramsDaftar),
  ]);

  const rekap = rekapRows[0];
  const hitungTampil = tampilRows ? tampilRows[0] : { jml: rekap?.jml ?? 0 };

  return Response.json({
    kolom: kolomUtama,
    kolom_label: komponen.kolom_label,
    agregat: komponen.agregat,
    syarat_kolom: syaratList.map((s) => s.kolom),
    komponen_urutan: komponen.urutan,
    jumlah_komponen: daftarKomponen.length,
    hal, per_hal: PER_HALAMAN,
    jumlah: Number(rekap?.jml ?? 0),
    jumlah_lolos: Number(rekap?.jml_lolos ?? 0),
    jumlah_tampil: Number(hitungTampil?.jml ?? 0),
    total: rekap?.total === null || rekap?.total === undefined ? null : Number(rekap.total),
    total_lolos: rekap?.total_lolos === null || rekap?.total_lolos === undefined ? null : Number(rekap.total_lolos),
    baris,
  });
});
