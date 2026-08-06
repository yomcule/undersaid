"use client";

import { useEffect, useRef, useState } from "react";
import { LAYOUTS, SWATCHES, EXPORT_FORMATS, CHARCOAL, type Layout, type Rect } from "@/lib/design-layouts";
import { FONT_OPTIONS, DESIGN_FONT_CLASSES, type FontKey } from "@/lib/design-fonts";
import {
  loadImage,
  drawImageCover,
  drawText,
  drawSlideNumber,
  allFontSpecs,
  DEFAULT_IMAGE_TRANSFORM,
  type TextState,
  type ImageTransform,
} from "@/lib/design-canvas";

function pointInRect(x: number, y: number, rect: Rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function defaultsFor(layout: Layout) {
  const texts: Record<string, TextState> = {};
  for (const slot of layout.textSlots) {
    texts[slot.id] = {
      content: "",
      font: "fraunces",
      bold: false,
      italic: false,
      underline: false,
      size: slot.defaultSize,
      color: slot.defaultColor,
      align: slot.align,
      valign: slot.defaultValign ?? "top",
    };
  }
  const colors: Record<string, string> = {};
  if (layout.background) colors[layout.background.id] = layout.background.defaultColor;
  for (const panel of layout.panels) colors[panel.id] = panel.defaultColor;
  return { texts, colors };
}

export function DesignStudio() {
  const [layoutId, setLayoutId] = useState(LAYOUTS[0].id);
  const layout = LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS[0];

  const initial = defaultsFor(LAYOUTS[0]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [transforms, setTransforms] = useState<Record<string, ImageTransform>>({});
  const [texts, setTexts] = useState<Record<string, TextState>>(initial.texts);
  const [colors, setColors] = useState<Record<string, string>>(initial.colors);
  const [fontsReady, setFontsReady] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<string | null>(null);
  const [formatId, setFormatId] = useState<(typeof EXPORT_FORMATS)[number]["id"]>("portrait");
  const format = EXPORT_FORMATS.find((f) => f.id === formatId) ?? EXPORT_FORMATS[0];

  // Carousel position, not layout content — stays put across layout switches
  // so numbering a set of slides doesn't mean re-entering it each time.
  const [showSlideNumber, setShowSlideNumber] = useState(false);
  const [slideCurrent, setSlideCurrent] = useState(1);
  const [slideTotal, setSlideTotal] = useState(6);
  const [slideNumberColor, setSlideNumberColor] = useState<string>(CHARCOAL);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ slotId: string; lastX: number; lastY: number } | null>(null);

  // Switching layouts starts clean — carrying content across mismatched
  // slot counts and shapes would just produce a half-filled template. Reset
  // happens right in the click handler rather than an effect, so it's one
  // render instead of a render-then-correct cascade.
  function selectLayout(next: Layout) {
    const d = defaultsFor(next);
    setLayoutId(next.id);
    setTexts(d.texts);
    setColors(d.colors);
    setImages({});
    setTransforms({});
  }

  // Canvas client coordinates -> the 1080-space the layout rects are defined
  // in, so drag math works the same regardless of how small the preview is
  // scaled down on screen.
  function toCanvasSpace(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasSpace(e);
    const slot = layout.imageSlots.find((s) => images[s.id] && pointInRect(x, y, s.rect));
    if (!slot) return;
    dragRef.current = { slotId: slot.id, lastX: x, lastY: y };
    setDraggingSlot(slot.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const { x, y } = toCanvasSpace(e);
    const dx = x - dragRef.current.lastX;
    const dy = y - dragRef.current.lastY;
    dragRef.current.lastX = x;
    dragRef.current.lastY = y;
    const { slotId } = dragRef.current;
    setTransforms((prev) => {
      const t = prev[slotId] ?? DEFAULT_IMAGE_TRANSFORM;
      return { ...prev, [slotId]: { ...t, x: t.x + dx, y: t.y + dy } };
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
    setDraggingSlot(null);
  }

  // Warms every font/weight/style combo the canvas can draw so the first
  // paint doesn't silently fall back to a system font mid-load.
  useEffect(() => {
    Promise.all(allFontSpecs().map((spec) => document.fonts.load(spec))).then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    if (!fontsReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.size.w;
    canvas.height = layout.size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;

    async function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      ctx.fillStyle = layout.background ? colors[layout.background.id] ?? layout.background.defaultColor : "#e8e0d3";
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);

      for (const slot of layout.imageSlots) {
        const src = images[slot.id];
        if (!src) {
          ctx.fillStyle = "#d8cebd";
          ctx.fillRect(slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h);
          continue;
        }
        const img = await loadImage(src);
        if (cancelled) return;
        drawImageCover(ctx, img, slot.rect, transforms[slot.id]);
      }

      for (const panel of layout.panels) {
        ctx.fillStyle = colors[panel.id] ?? panel.defaultColor;
        ctx.fillRect(panel.rect.x, panel.rect.y, panel.rect.w, panel.rect.h);
      }

      for (const slot of layout.textSlots) {
        const t = texts[slot.id];
        if (t) drawText(ctx, t, slot.rect);
      }

      if (showSlideNumber) {
        drawSlideNumber(ctx, slideCurrent, slideTotal, slideNumberColor, canvas!.width, canvas!.height);
      }
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [layout, images, texts, colors, transforms, fontsReady, showSlideNumber, slideCurrent, slideTotal, slideNumberColor]);

  function handleImageChange(slotId: string, file: File | null) {
    setTransforms((prev) => ({ ...prev, [slotId]: DEFAULT_IMAGE_TRANSFORM }));
    if (!file) {
      setImages((prev) => ({ ...prev, [slotId]: null }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImages((prev) => ({ ...prev, [slotId]: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  function updateText(slotId: string, patch: Partial<TextState>) {
    setTexts((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...patch } }));
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The design is always composed at 1080×1080. For a non-square target,
    // scale it down to fit and pad the rest, rather than cropping — cropping
    // could cut off text or a photo's subject. The padding is filled with
    // whatever color is already at that edge of the design (not a fixed
    // color), so it reads as the background continuing, not a visible bar.
    function edgeColor(x: number, y: number) {
      const [r, g, b] = canvas!.getContext("2d")!.getImageData(x, y, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    }

    let source: HTMLCanvasElement = canvas;
    if (format.w !== canvas.width || format.h !== canvas.height) {
      const out = document.createElement("canvas");
      out.width = format.w;
      out.height = format.h;
      const ctx = out.getContext("2d")!;
      const fitScale = Math.min(format.w / canvas.width, format.h / canvas.height);
      const dw = canvas.width * fitScale;
      const dh = canvas.height * fitScale;
      const dx = (format.w - dw) / 2;
      const dy = (format.h - dh) / 2;

      if (dy > 0) {
        ctx.fillStyle = edgeColor(Math.floor(canvas.width / 2), 0);
        ctx.fillRect(0, 0, format.w, dy);
        ctx.fillStyle = edgeColor(Math.floor(canvas.width / 2), canvas.height - 1);
        ctx.fillRect(0, dy + dh, format.w, format.h - (dy + dh));
      } else if (dx > 0) {
        ctx.fillStyle = edgeColor(0, Math.floor(canvas.height / 2));
        ctx.fillRect(0, 0, dx, format.h);
        ctx.fillStyle = edgeColor(canvas.width - 1, Math.floor(canvas.height / 2));
        ctx.fillRect(dx + dw, 0, format.w - (dx + dw), format.h);
      }

      ctx.drawImage(canvas, dx, dy, dw, dh);
      source = out;
    }

    source.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `michi-${layout.id}-${format.id}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div>
      {/* Invisible, but its className is what makes Next actually emit the
          @font-face rules for fonts otherwise only ever referenced by name
          inside canvas.font strings. */}
      <div className={`${DESIGN_FONT_CLASSES} hidden`} aria-hidden="true" />

      <div className="flex flex-wrap gap-3">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => selectLayout(l)}
            className={`border px-4 py-3 text-left transition-colors ${
              l.id === layoutId ? "border-indigo text-ink" : "border-iron text-iron hover:border-indigo"
            }`}
          >
            <span className="label block">{l.name}</span>
            <span className="mt-1 block text-sm">{l.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`aspect-square w-full max-w-[520px] touch-none border border-bone bg-kora-deep ${
              draggingSlot ? "cursor-grabbing" : layout.imageSlots.some((s) => images[s.id]) ? "cursor-grab" : ""
            }`}
          />
          {layout.imageSlots.length > 0 ? (
            <p className="mt-4 text-sm text-iron">Drag a photo on the canvas to reposition it.</p>
          ) : null}
          {!fontsReady ? <p className="mt-4 text-sm text-iron">Loading fonts…</p> : null}

          <div className="mt-8 flex flex-col gap-3">
            <select
              value={formatId}
              onChange={(e) => setFormatId(e.target.value as (typeof EXPORT_FORMATS)[number]["id"])}
              className="w-full max-w-[520px] border border-iron bg-kora-deep px-3 py-2 text-sm focus:border-indigo focus:outline-none"
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.w}×{f.h})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!fontsReady}
              className="bg-indigo px-6 py-4 text-kora hover:opacity-90 disabled:opacity-50"
            >
              Download PNG ({format.w}×{format.h})
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-10">
          {layout.imageSlots.length > 0 ? (
            <div className="flex flex-col gap-6">
              <h3>Photos</h3>
              {layout.imageSlots.map((slot) => (
                <div key={slot.id} className="flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    {images[slot.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={images[slot.id]!} alt="" className="size-16 border border-bone object-cover" />
                    ) : (
                      <div className="size-16 border border-bone bg-kora-deep" />
                    )}
                    <div className="flex flex-col gap-2">
                      <span className="label">{slot.label}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageChange(slot.id, e.target.files?.[0] ?? null)}
                        className="text-sm text-iron file:mr-3 file:border-0 file:bg-transparent file:text-ink file:underline"
                      />
                    </div>
                  </div>
                  {images[slot.id] ? (
                    <div className="flex items-center gap-4 pl-20">
                      <label className="flex flex-1 items-center gap-3">
                        <span className="label shrink-0">Zoom</span>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={0.05}
                          value={transforms[slot.id]?.zoom ?? 1}
                          onChange={(e) =>
                            setTransforms((prev) => ({
                              ...prev,
                              [slot.id]: { ...(prev[slot.id] ?? DEFAULT_IMAGE_TRANSFORM), zoom: Number(e.target.value) },
                            }))
                          }
                          className="w-full accent-indigo"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setTransforms((prev) => ({ ...prev, [slot.id]: DEFAULT_IMAGE_TRANSFORM }))}
                        className="label shrink-0 hover:text-ink"
                      >
                        Reset
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {layout.background || layout.panels.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3>Colors</h3>
              {layout.background ? (
                <ColorField
                  label={layout.background.label}
                  value={colors[layout.background.id] ?? layout.background.defaultColor}
                  onChange={(v) => setColors((prev) => ({ ...prev, [layout.background!.id]: v }))}
                />
              ) : null}
              {layout.panels.map((panel) => (
                <ColorField
                  key={panel.id}
                  label={panel.label}
                  value={colors[panel.id] ?? panel.defaultColor}
                  onChange={(v) => setColors((prev) => ({ ...prev, [panel.id]: v }))}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-8">
            <h3>Text</h3>
            {layout.textSlots.map((slot) => (
              <TextControls
                key={slot.id}
                label={slot.label}
                placeholder={slot.placeholder}
                value={texts[slot.id]}
                onChange={(patch) => updateText(slot.id, patch)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3>Slide number</h3>
              <button
                type="button"
                onClick={() => setShowSlideNumber((v) => !v)}
                aria-pressed={showSlideNumber}
                className={`label border px-3 py-1.5 transition-colors ${
                  showSlideNumber ? "border-indigo bg-indigo text-kora" : "border-iron text-iron hover:border-indigo"
                }`}
              >
                {showSlideNumber ? "On" : "Off"}
              </button>
            </div>
            {showSlideNumber ? (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <span className="label">Slide</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={slideCurrent}
                    onChange={(e) => setSlideCurrent(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-iron bg-kora-deep px-2 py-1.5 text-center data"
                  />
                </label>
                <span className="text-iron">/</span>
                <label className="flex items-center gap-2">
                  <span className="label">Of</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={slideTotal}
                    onChange={(e) => setSlideTotal(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-iron bg-kora-deep px-2 py-1.5 text-center data"
                  />
                </label>
                <ColorField label="Color" value={slideNumberColor} onChange={setSlideNumberColor} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// A fixed swatch set, not a full picker — the brand rule is "no more than
// one accent colour per post," so there is nothing to gain from offering
// the whole spectrum.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        {SWATCHES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            aria-label={s.label}
            aria-pressed={value.toLowerCase() === s.value.toLowerCase()}
            title={s.label}
            style={{ backgroundColor: s.value }}
            className={`size-7 rounded-full border transition-shadow ${
              value.toLowerCase() === s.value.toLowerCase()
                ? "border-indigo ring-2 ring-indigo ring-offset-2 ring-offset-kora"
                : "border-iron"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function TextControls({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: TextState | undefined;
  onChange: (patch: Partial<TextState>) => void;
}) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-3 border-b border-bone pb-8 last:border-none last:pb-0">
      <span className="label">{label}</span>
      <textarea
        value={value.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-iron bg-kora-deep p-3 text-ink focus:border-indigo focus:outline-none"
      />
      <p className="text-sm text-iron">
        Wrap a word or phrase in <span className="data">**bold**</span>, <span className="data">*italic*</span>, or{" "}
        <span className="data">~underline~</span> to format just that part.
      </p>

      <select
        value={value.font}
        onChange={(e) => onChange({ font: e.target.value as FontKey })}
        className="w-full border border-iron bg-kora-deep px-3 py-2 text-sm focus:border-indigo focus:outline-none"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleButton active={value.bold} onClick={() => onChange({ bold: !value.bold })} label="Bold">
          <span className="font-bold">B</span>
        </ToggleButton>
        <ToggleButton active={value.italic} onClick={() => onChange({ italic: !value.italic })} label="Italic">
          <span className="italic">I</span>
        </ToggleButton>
        <ToggleButton active={value.underline} onClick={() => onChange({ underline: !value.underline })} label="Underline">
          <span className="underline">U</span>
        </ToggleButton>

        <div className="ml-2 flex items-center gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <ToggleButton key={a} active={value.align === a} onClick={() => onChange({ align: a })} label={`Align ${a}`}>
              {a === "left" ? "⟸" : a === "center" ? "↔" : "⟹"}
            </ToggleButton>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-1">
          {(["top", "middle", "bottom"] as const).map((v) => (
            <ToggleButton key={v} active={value.valign === v} onClick={() => onChange({ valign: v })} label={`Align ${v}`}>
              {v === "top" ? "⤒" : v === "middle" ? "↕" : "⤓"}
            </ToggleButton>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex flex-1 items-center gap-3">
          <span className="label shrink-0">Size</span>
          <input
            type="range"
            min={16}
            max={140}
            value={value.size}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
            className="w-full accent-indigo"
          />
          <span className="data text-sm text-iron">{value.size}</span>
        </label>
        <ColorField label="Color" value={value.color} onChange={(v) => onChange({ color: v })} />
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex size-8 items-center justify-center border text-sm transition-colors ${
        active ? "border-indigo bg-indigo text-kora" : "border-iron text-iron hover:border-indigo"
      }`}
    >
      {children}
    </button>
  );
}
