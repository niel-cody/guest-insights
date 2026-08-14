import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Guests — Oolio Insights",
  description:
    "The customer side of the sales report. Enrolment-free guest analytics on real Oolio Pay trade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
