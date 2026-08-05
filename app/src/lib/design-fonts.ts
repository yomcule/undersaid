import { Fraunces, Work_Sans, Playfair_Display, Bodoni_Moda } from "next/font/google";

/**
 * Fonts for the Instagram design studio, loaded separately from the app's
 * own type system in layout.tsx (that one stays pinned to weight 300–400
 * Fraunces / 300–500 Work Sans; this tool needs bold and italic instances).
 *
 * GT Sectra and Editorial New are commercial retail fonts (Grilli Type and
 * Pangram Pangram respectively) — we don't have a license to embed them.
 * Playfair Display and Bodoni Moda stand in as open-license lookalikes;
 * the picker labels say so rather than pretending the real fonts are here.
 * Swap in the licensed files later by replacing these two loaders.
 */

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export type FontKey = "fraunces" | "workSans" | "playfair" | "bodoni";

export const FONT_OPTIONS: { key: FontKey; label: string; family: string }[] = [
  { key: "fraunces", label: "Fraunces", family: fraunces.style.fontFamily },
  { key: "workSans", label: "Work Sans", family: workSans.style.fontFamily },
  {
    key: "playfair",
    label: "Playfair Display (GT Sectra stand-in)",
    family: playfairDisplay.style.fontFamily,
  },
  {
    key: "bodoni",
    label: "Bodoni Moda (Editorial New stand-in)",
    family: bodoniModa.style.fontFamily,
  },
];

// Applied to a hidden element so Next actually emits the @font-face rules —
// otherwise a font whose className never renders anywhere can get dropped.
export const DESIGN_FONT_CLASSES = [
  fraunces.className,
  workSans.className,
  playfairDisplay.className,
  bodoniModa.className,
].join(" ");
