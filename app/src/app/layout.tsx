import type { Metadata } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// All three are SIL OFL 1.1 — free, commercial use permitted.
// Three families is the ceiling; a fourth is a "never".
// Loaded as a true variable font: `axes` and a fixed `weight` are mutually
// exclusive, and the WONK axis is the whole reason Fraunces was chosen.
// Weight is constrained to 300–400 in globals.css instead — never 500 or
// above, because Fraunces at Bold is a shout and Michi does not shout.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

// Work Sans, not the Archivo the guidelines name. Archivo's 400 read too
// heavy against Fraunces at body size; Work Sans is humanist and open, and
// 300 is the intended body weight — hence no 600 here at all.
const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Michi",
  description: "Internal operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${workSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
