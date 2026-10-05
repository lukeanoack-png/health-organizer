import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Record Organizer — Synthetic Data Prototype",
  description:
    "Educational prototype using synthetic data only. Organizes synthetic health records with source provenance and surfaces conflicts for human review. Not for diagnosis, treatment, or medical decision-making.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
