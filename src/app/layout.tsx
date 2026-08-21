import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/**
 * `%s` is filled by each page's own title.
 *
 * Every page used to render "Guests — Oolio Insights", including Overview and
 * Behaviour. That is what shows in the browser tab and in every screenshot
 * anybody takes, so three different reports arrived in reviewers' notes under
 * one name.
 *
 * The default is the product rather than a section. It was "Customers", which
 * was correct while Insights was one section wide and became a lie the moment
 * it was eight — a Team page falling through to the default would have
 * announced itself as a customer report in the tab and in every screenshot.
 */
export const metadata: Metadata = {
  title: {
    default: "Oolio Insights",
    template: "%s — Oolio Insights",
  },
  description:
    "Enrolment-free guest and team analytics on real Oolio Pay trade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
