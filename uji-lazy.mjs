// Meniru apa yang dilakukan `next build`: mengimpor modul tanpa DATABASE_URL.
delete process.env.DATABASE_URL;

const { neon } = await import('@neondatabase/serverless');

let koneksi = null;
function pakaiKoneksi() {
  if (!koneksi) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diset.");
    koneksi = neon(url);
  }
  return koneksi;
}
const sql = new Proxy(function () {}, {
  apply(_t, _this, args) { return pakaiKoneksi()(...args); },
  get(_t, prop) { const n = pakaiKoneksi(); const v = n[prop];
                  return typeof v === "function" ? v.bind(n) : v; },
});

console.log("1. Modul diimpor tanpa DATABASE_URL ......... OK (tidak melempar error)");
console.log("2. Objek sql dibuat ......................... OK");

try { sql.transaction; console.log("3. GAGAL: seharusnya menolak tanpa env"); }
catch (e) { console.log("3. Dipakai tanpa env -> ditolak jelas ....... OK:", e.message); }

process.env.DATABASE_URL = "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db";
console.log("4. Setelah env diisi, transaction tersedia .. ", typeof sql.transaction === "function" ? "OK" : "GAGAL");
console.log("5. sql bisa dipanggil sebagai template ...... ", typeof sql === "function" ? "OK" : "GAGAL");
