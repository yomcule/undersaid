import type { Rect } from "@/lib/design-layouts";
import type { FontKey } from "@/lib/design-fonts";
import { FONT_OPTIONS } from "@/lib/design-fonts";

export type TextState = {
  content: string;
  font: FontKey;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
};

// The draw effect re-runs on every keystroke (text, color, size all live in
// the same effect deps), which would otherwise re-decode an uploaded photo
// from its data URL on every single character typed. Caching by src means a
// photo is only ever decoded once.
const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export type ImageTransform = { zoom: number; x: number; y: number };
export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = { zoom: 1, x: 0, y: 0 };

// A plain "cover" fit leaves zero slack to pan in whichever axis the image's
// aspect ratio already matches the frame's — e.g. a photo that's exactly as
// tall as the frame can only ever pan sideways. Baking in a little extra
// zoom guarantees there's always room to drag in both directions, even
// before the user touches the zoom slider.
const MIN_SLACK = 1.15;

/**
 * Center-crop `img` to fill `rect` (the same fit as CSS `object-fit: cover`,
 * plus MIN_SLACK headroom), then pan and zoom within that crop. `transform.x`/
 * `y` are a drag offset in canvas pixels — dragging the pointer moves the
 * image the same direction, like dragging a physical print — clamped so the
 * crop window can never show past the source image's edges.
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  transform: ImageTransform = DEFAULT_IMAGE_TRANSFORM,
) {
  const baseScale = Math.max(rect.w / img.width, rect.h / img.height) * MIN_SLACK;
  const scale = baseScale * Math.max(1, transform.zoom);

  const sw = Math.min(rect.w / scale, img.width);
  const sh = Math.min(rect.h / scale, img.height);

  const sx = clamp((img.width - sw) / 2 - transform.x / scale, 0, img.width - sw);
  const sy = clamp((img.height - sh) / 2 - transform.y / scale, 0, img.height - sh);

  ctx.drawImage(img, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function fontFamilyFor(key: FontKey): string {
  return FONT_OPTIONS.find((f) => f.key === key)?.family ?? "sans-serif";
}

/**
 * Inline formatting for one word or phrase inside an otherwise plain text
 * block: wrap it in `**bold**`, `*italic*`, or `~underline~`. The block's own
 * Bold/Italic/Underline toggles still apply to everything — a marker adds
 * emphasis on top, it never removes what the toggle already set.
 */
const MARKER_RE = /(\*\*|\*|~)/g;

type Run = { text: string; bold: boolean; italic: boolean; underline: boolean };

function parseRuns(content: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  for (const part of content.split(MARKER_RE)) {
    if (part === "") continue;
    if (part === "**") bold = !bold;
    else if (part === "*") italic = !italic;
    else if (part === "~") underline = !underline;
    else runs.push({ text: part, bold, italic, underline });
  }
  return runs;
}

type Tok =
  | { kind: "break" }
  | { kind: "word" | "space"; text: string; bold: boolean; italic: boolean; underline: boolean };

function tokenize(runs: Run[]): Tok[] {
  const toks: Tok[] = [];
  for (const run of runs) {
    run.text.split("\n").forEach((paragraph, i) => {
      if (i > 0) toks.push({ kind: "break" });
      for (const piece of paragraph.split(/(\s+)/).filter(Boolean)) {
        toks.push({
          kind: /^\s+$/.test(piece) ? "space" : "word",
          text: /^\s+$/.test(piece) ? " " : piece,
          bold: run.bold,
          italic: run.italic,
          underline: run.underline,
        });
      }
    });
  }
  return toks;
}

type LineTok = { text: string; width: number; bold: boolean; italic: boolean; underline: boolean; isSpace: boolean };

function fontFor(t: TextState, bold: boolean, italic: boolean): string {
  const weight = t.bold || bold ? "700" : "400";
  const style = t.italic || italic ? "italic" : "normal";
  return `${style} ${weight} ${t.size}px ${fontFamilyFor(t.font)}`;
}

function wrapRich(ctx: CanvasRenderingContext2D, t: TextState, maxWidth: number): LineTok[][] {
  const lines: LineTok[][] = [[]];

  function widthOf(text: string, bold: boolean, italic: boolean) {
    ctx.font = fontFor(t, bold, italic);
    return ctx.measureText(text).width;
  }

  function lineWidth(line: LineTok[]) {
    return line.reduce((sum, tok) => sum + tok.width, 0);
  }

  for (const tok of tokenize(parseRuns(t.content))) {
    if (tok.kind === "break") {
      lines.push([]);
      continue;
    }
    const current = lines[lines.length - 1];
    const width = widthOf(tok.text, tok.bold, tok.italic);

    if (tok.kind === "space") {
      if (current.length === 0) continue; // no leading spaces on a wrapped line
      current.push({ text: tok.text, width, bold: tok.bold, italic: tok.italic, underline: tok.underline, isSpace: true });
      continue;
    }

    if (current.length > 0 && lineWidth(current) + width > maxWidth) {
      if (current[current.length - 1]?.isSpace) current.pop();
      lines.push([{ text: tok.text, width, bold: tok.bold, italic: tok.italic, underline: tok.underline, isSpace: false }]);
    } else {
      current.push({ text: tok.text, width, bold: tok.bold, italic: tok.italic, underline: tok.underline, isSpace: false });
    }
  }

  return lines;
}

function drawUnderline(ctx: CanvasRenderingContext2D, startX: number, endX: number, y: number, size: number, color: string) {
  if (endX <= startX) return;
  ctx.beginPath();
  ctx.moveTo(startX, y + size * 1.05);
  ctx.lineTo(endX, y + size * 1.05);
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Draws wrapped, mixed-formatting text, vertically positioned and clipped to `rect`. */
export function drawText(ctx: CanvasRenderingContext2D, t: TextState, rect: Rect) {
  if (!t.content.trim()) return;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const lineHeight = t.size * 1.25;
  const lines = wrapRich(ctx, t, rect.w);
  const totalHeight = lines.length * lineHeight;

  let y =
    t.valign === "middle"
      ? rect.y + (rect.h - totalHeight) / 2
      : t.valign === "bottom"
        ? rect.y + rect.h - totalHeight
        : rect.y;

  for (const line of lines) {
    if (y + lineHeight <= rect.y - 0.5) {
      y += lineHeight;
      continue;
    }
    if (y >= rect.y + rect.h + 0.5) break;

    const width = line.reduce((sum, tok) => sum + tok.width, 0);
    let x = t.align === "left" ? rect.x : t.align === "right" ? rect.x + rect.w - width : rect.x + (rect.w - width) / 2;

    let underlineStart: number | null = null;
    for (const tok of line) {
      ctx.font = fontFor(t, tok.bold, tok.italic);
      ctx.fillStyle = t.color;
      if (!tok.isSpace) ctx.fillText(tok.text, x, y);

      const underlined = t.underline || tok.underline;
      if (underlined && underlineStart === null) underlineStart = x;
      if (!underlined && underlineStart !== null) {
        drawUnderline(ctx, underlineStart, x, y, t.size, t.color);
        underlineStart = null;
      }
      x += tok.width;
    }
    if (underlineStart !== null) drawUnderline(ctx, underlineStart, x, y, t.size, t.color);

    y += lineHeight;
  }
}

/** Carousel position, e.g. "01 / 06" — zero-padded so it lines up across a set of slides. */
export function drawSlideNumber(
  ctx: CanvasRenderingContext2D,
  current: number,
  total: number,
  color: string,
  canvasW: number,
  canvasH: number,
) {
  const margin = 56;
  const size = 26;
  const label = `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  ctx.font = `500 ${size}px ${fontFamilyFor("workSans")}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.fillText(label, canvasW - margin, canvasH - margin);
}

/** Every `font` shorthand string the design tool can ever draw with — used
 * to warm the browser's font cache before the first paint, so canvas text
 * doesn't silently fall back to a system font while the real one loads. */
export function allFontSpecs(): string[] {
  const specs: string[] = [];
  for (const opt of FONT_OPTIONS) {
    for (const style of ["normal", "italic"]) {
      for (const weight of ["400", "700"]) {
        specs.push(`${style === "italic" ? "italic " : ""}${weight} 16px ${opt.family}`);
      }
    }
  }
  return specs;
}
