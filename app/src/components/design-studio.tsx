"use client";

import { useEffect, useRef, useState } from "react";
import { LAYOUTS, type Layout } from "@/lib/design-layouts";
import { FONT_OPTIONS, DESIGN_FONT_CLASSES, type FontKey } from "@/lib/design-fonts";
import { loadImage, drawImageCover, drawText, allFontSpecs, type TextState } from "@/lib/design-canvas";

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
  const [texts, setTexts] = useState<Record<string, TextState>>(initial.texts);
  const [colors, setColors] = useState<Record<string, string>>(initial.colors);
  const [fontsReady, setFontsReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        drawImageCover(ctx, img, slot.rect);
      }

      for (const panel of layout.panels) {
        ctx.fillStyle = colors[panel.id] ?? panel.defaultColor;
        ctx.fillRect(panel.rect.x, panel.rect.y, panel.rect.w, panel.rect.h);
      }

      for (const slot of layout.textSlots) {
        const t = texts[slot.id];
        if (t) drawText(ctx, t, slot.rect);
      }
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [layout, images, texts, colors, fontsReady]);

  function handleImageChange(slotId: string, file: File | null) {
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `michi-${layout.id}-${Date.now()}.png`;
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
              l.id === layoutId ? "border-indigo text-ink" : "border-bone text-iron hover:border-indigo"
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
            className="aspect-square w-full max-w-[520px] border border-bone bg-kora-deep"
          />
          {!fontsReady ? <p className="mt-4 text-sm text-iron">Loading fonts…</p> : null}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!fontsReady}
            className="mt-8 bg-indigo px-6 py-4 text-kora hover:opacity-90 disabled:opacity-50"
          >
            Download PNG (1080×1080)
          </button>
        </div>

        <div className="flex flex-col gap-10">
          {layout.imageSlots.length > 0 ? (
            <div className="flex flex-col gap-6">
              <h3>Photos</h3>
              {layout.imageSlots.map((slot) => (
                <div key={slot.id} className="flex items-center gap-4">
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
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer border border-bone bg-transparent p-0"
      />
    </label>
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
        className="w-full border border-bone bg-transparent p-3 text-ink focus:border-indigo focus:outline-none"
      />

      <select
        value={value.font}
        onChange={(e) => onChange({ font: e.target.value as FontKey })}
        className="w-full border-b border-bone bg-transparent pb-2 text-sm focus:border-indigo focus:outline-none"
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
        active ? "border-indigo bg-indigo text-kora" : "border-bone text-iron hover:border-indigo"
      }`}
    >
      {children}
    </button>
  );
}
