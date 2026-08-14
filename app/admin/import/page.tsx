import ImportWizard from "./ImportWizard";

export const metadata = { title: "Unggah data KPI" };

export default function Page() {
  return (
    <main className="shell">
      <div className="sectionhead">
        <div>
          <h2>Unggah data KPI</h2>
          <p>Empat langkah. Data karyawan tidak berubah sampai langkah terakhir.</p>
        </div>
      </div>
      <ImportWizard />
    </main>
  );
}
