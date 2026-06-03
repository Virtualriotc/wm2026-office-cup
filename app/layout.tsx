import type { Metadata, Viewport } from "next";
import { Baloo_2, Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { COPY } from "@/lib/copy";
import { TopNav } from "@/components/TopNav";

// Self-hosted by next/font (fetched at build time). Exposed as CSS variables
// so globals.css can point --font-display / --font-body at them while keeping
// the system-stack fallbacks already declared there.
const display = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display-loaded",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WM 2026 Office Cup",
  description:
    "A friendly World Cup prediction game by colleagues, for colleagues. Pick winners, carry your department up the table.",
};

export const viewport: Viewport = {
  themeColor: "#A9DCF0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      {/*
        Fonts wired via next/font/google: Baloo 2 (heavy rounded display) +
        Hanken Grotesk (clean body). They are self-hosted at build time and
        exposed as --font-display-loaded / --font-body-loaded on <html>;
        globals.css prepends those to the system fallback stacks.
      */}
      <body>
        <div id="app-root">
          <TopNav copy={COPY} />
          <main className="mx-auto w-full max-w-[1100px] px-5 pb-24 pt-4">
            {children}
          </main>
        </div>
        {/* Vercel Web Analytics — cookieless, anonymous page views. Its beacon
            posts to same-origin /_vercel/insights/*, so the strict CSP
            (connect-src 'self', script via strict-dynamic) already covers it. */}
        <Analytics />
      </body>
    </html>
  );
}
