import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Record Organizer — Synthetic Data Prototype",
  description:
    "Educational prototype using synthetic data only. Organizes synthetic health records with source provenance and surfaces conflicts for human review. Not for clinical use.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#B42336" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
