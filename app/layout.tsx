import "./globals.css";
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Plus_Jakarta_Sans, Inter, IBM_Plex_Mono } from "next/font/google";

/**
 * Font di-host sendiri oleh Next (bukan <link> ke fonts.googleapis.com).
 * Hasilnya: tidak ada render-blocking request ke domain pihak ketiga,
 * dan `display: swap` mencegah teks tak tampil saat font belum siap.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "KPI Collection",
  description: "Monitoring KPI dan insentif Collection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${jakarta.variable} ${plexMono.variable}`}
    >
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
