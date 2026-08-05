export type Rect = { x: number; y: number; w: number; h: number };
export type Align = "left" | "center" | "right";

export type ImageSlot = { id: string; label: string; rect: Rect };
export type Panel = { id: string; label: string; rect: Rect; defaultColor: string };
export type VAlign = "top" | "middle" | "bottom";

export type TextSlot = {
  id: string;
  label: string;
  rect: Rect;
  align: Align;
  defaultValign?: VAlign;
  defaultSize: number;
  defaultColor: string;
  placeholder: string;
};

export type Layout = {
  id: string;
  name: string;
  description: string;
  size: { w: number; h: number };
  background?: { id: string; label: string; defaultColor: string };
  imageSlots: ImageSlot[];
  panels: Panel[];
  textSlots: TextSlot[];
};

// Instagram feed square, 1080x1080 — the one size that works everywhere a
// post can land (grid, single view, most Reels covers).
const SIZE = { w: 1080, h: 1080 };

// From the Michi Instagram Visual & Content Guidelines: warm off-white and
// charcoal are the two named colors, "no more than one accent colour per
// post." Neither the clay accent nor the taupe rule line has an exact hex in
// the doc — CLAY and TAUPE below are a reasonable approximation.
export const OFF_WHITE = "#f3efe7";
export const CHARCOAL = "#2b2926";
export const CLAY = "#bf6244";
export const TAUPE = "#a8998a";

// The only colors offered in the tool's swatch pickers — "no more than one
// accent colour per post" means there is no reason to expose a full picker.
export const SWATCHES = [
  { label: "Off-white", value: OFF_WHITE },
  { label: "Charcoal", value: CHARCOAL },
  { label: "Clay", value: CLAY },
];

// Every layout is composed as a 1080×1080 square. For platforms that don't
// display square posts natively, the export is letterboxed onto a bigger
// canvas rather than cropped, so nothing in the design gets cut off.
export const EXPORT_FORMATS = [
  { id: "square", label: "Square — Instagram, Facebook, LinkedIn", w: 1080, h: 1080 },
  { id: "portrait", label: "Portrait — Instagram", w: 1080, h: 1350 },
  { id: "landscape", label: "Landscape — X/Twitter", w: 1200, h: 675 },
] as const;

export const LAYOUTS: Layout[] = [
  {
    id: "hook",
    name: "Hook slide",
    description: "Carousel opener — a 3–5 word hook in Fraunces on off-white.",
    size: SIZE,
    background: { id: "bg", label: "Background color", defaultColor: OFF_WHITE },
    imageSlots: [],
    panels: [],
    textSlots: [
      {
        id: "hook",
        label: "Hook",
        rect: { x: 100, y: 56, w: 880, h: 640 },
        align: "center",
        defaultValign: "bottom",
        defaultSize: 72,
        defaultColor: CHARCOAL,
        placeholder: "Cut by hand.",
      },
      {
        id: "subtext",
        label: "Subtext",
        rect: { x: 100, y: 720, w: 880, h: 304 },
        align: "center",
        defaultValign: "top",
        defaultSize: 28,
        defaultColor: TAUPE,
        placeholder: "Swipe for the process →",
      },
    ],
  },
  {
    id: "shirt-school",
    name: "Shirt School",
    description: "Educational slide — one clay highlight, a taupe rule instead of a box.",
    size: SIZE,
    background: { id: "bg", label: "Background color", defaultColor: OFF_WHITE },
    imageSlots: [],
    panels: [{ id: "rule", label: "Rule color", rect: { x: 100, y: 430, w: 880, h: 4 }, defaultColor: TAUPE }],
    textSlots: [
      {
        id: "title",
        label: "Title",
        rect: { x: 100, y: 56, w: 880, h: 264 },
        align: "left",
        defaultValign: "bottom",
        defaultSize: 56,
        defaultColor: CHARCOAL,
        placeholder: "Shirt School: GSM",
      },
      {
        id: "highlight",
        label: "Highlight (the one accent)",
        rect: { x: 100, y: 320, w: 880, h: 80 },
        align: "left",
        defaultSize: 34,
        defaultColor: CLAY,
        placeholder: "180 GSM — heavier than most fast fashion",
      },
      {
        id: "body",
        label: "Body",
        rect: { x: 100, y: 460, w: 880, h: 564 },
        align: "left",
        defaultValign: "top",
        defaultSize: 32,
        defaultColor: CHARCOAL,
        placeholder: "Grams per square metre tells you how a fabric will drape, wash and wear in.",
      },
    ],
  },
  {
    id: "caption-bar",
    name: "Caption bar",
    description: "Full-bleed photo with a charcoal-on-off-white caption bar.",
    size: SIZE,
    imageSlots: [{ id: "photo", label: "Photo", rect: { x: 0, y: 0, w: 1080, h: 1080 } }],
    panels: [{ id: "bar", label: "Bar color", rect: { x: 0, y: 760, w: 1080, h: 320 }, defaultColor: OFF_WHITE }],
    textSlots: [
      {
        id: "caption",
        label: "Caption",
        rect: { x: 72, y: 784, w: 936, h: 272 },
        align: "left",
        defaultValign: "top",
        defaultSize: 48,
        defaultColor: CHARCOAL,
        placeholder: "The vat, three days in.",
      },
    ],
  },
  {
    id: "duo-texture",
    name: "Duo texture",
    description: "Close-up + wider context shot side by side, per the grid-rhythm rule.",
    size: SIZE,
    imageSlots: [
      { id: "left", label: "Close-up photo", rect: { x: 0, y: 0, w: 540, h: 760 } },
      { id: "right", label: "Wider photo", rect: { x: 540, y: 0, w: 540, h: 760 } },
    ],
    panels: [{ id: "strip", label: "Strip color", rect: { x: 0, y: 760, w: 1080, h: 320 }, defaultColor: OFF_WHITE }],
    textSlots: [
      {
        id: "caption",
        label: "Caption",
        rect: { x: 72, y: 784, w: 936, h: 272 },
        align: "left",
        defaultValign: "top",
        defaultSize: 40,
        defaultColor: CHARCOAL,
        placeholder: "Texture, then context.",
      },
    ],
  },
];
