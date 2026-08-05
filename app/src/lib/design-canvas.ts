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
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export type ImageTransform = { zoom: number; x: number; y: number };
export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = { zoom: 1, x: 0, y: 0 };

/**
 * Center-crop `img` to fill `rect` (the same fit as CSS `object-fit: cover`),
 * then pan and zoom within that crop. `transform.x`/`y` are a drag offset in
 * canvas pixels — positive x drags the visible image right, i.e. reveals
 * more of its left edge — clamped so the crop window can never show past
 * the source image's edges.
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  transform: ImageTransform = DEFAULT_IMAGE_TRANSFORM,
) {
  const baseScale = Math.max(rect.w / img.width, rect.h / img.height);
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function fontFamilyFor(key: FontKey): string {
  return FONT_OPTIONS.find((f) => f.key === key)?.family ?? "sans-serif";
}

function buildFont(t: TextState): string {
  const weight = t.bold ? "700" : "400";
  const style = t.italic ? "italic" : "normal";
  return `${style} ${weight} ${t.size}px ${fontFamilyFor(t.font)}`;
}

/** Draws wrapped, optionally underlined text top-aligned and clipped to `rect`. */
export function drawText(ctx: CanvasRenderingContext2D, t: TextState, rect: Rect) {
  if (!t.content.trim()) return;

  ctx.font = buildFont(t);
  ctx.fillStyle = t.color;
  ctx.textBaseline = "top";
  ctx.textAlign = t.align;

  const lineHeight = t.size * 1.25;
  const lines = wrapText(ctx, t.content, rect.w);
  const x = t.align === "left" ? rect.x : t.align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;

  let y = rect.y;
  for (const line of lines) {
    if (y + lineHeight > rect.y + rect.h) break;
    ctx.fillText(line, x, y);

    if (t.underline) {
      const w = ctx.measureText(line).width;
      const lineX = t.align === "left" ? x : t.align === "right" ? x - w : x - w / 2;
      const underlineY = y + t.size * 1.05;
      ctx.beginPath();
      ctx.moveTo(lineX, underlineY);
      ctx.lineTo(lineX + w, underlineY);
      ctx.lineWidth = Math.max(2, t.size * 0.05);
      ctx.strokeStyle = t.color;
      ctx.stroke();
    }
    y += lineHeight;
  }
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
