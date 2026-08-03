import type { ReactNode } from "react";

/**
 * The form kit. Every entry screen uses these so that a control looks and
 * behaves the same everywhere, and so the palette rules live in one file
 * rather than being retyped as class strings on every page.
 */

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">{children}</div>;
}

export function Field({
  label,
  htmlFor,
  hint,
  span = 1,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /** 2 makes the field full width in a FormGrid. */
  span?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${span === 2 ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-iron">{hint}</p> : null}
    </div>
  );
}

// A hairline under the control rather than a box: the form should read as
// writing on paper, not as a stack of containers.
const base =
  "w-full border-b border-bone bg-transparent pb-2 text-ink " +
  "focus:border-indigo focus:outline-none";

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Select(props: React.ComponentProps<"select">) {
  return <select {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`w-full border border-bone bg-transparent p-4 text-ink
                  focus:border-indigo focus:outline-none ${props.className ?? ""}`}
    />
  );
}

/** Money and counts are data, so they are typed in mono too. */
export function NumberInput(props: React.ComponentProps<"input">) {
  return (
    <input
      type="number"
      {...props}
      className={`${base} data ${props.className ?? ""}`}
    />
  );
}

/** The one Indigo element on an entry screen. */
export function Submit({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className="mt-16 bg-indigo px-6 py-4 text-kora hover:opacity-90">
      {children}
    </button>
  );
}

/** A quieter action for secondary forms sharing a page with a primary one. */
export function SubmitGhost({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="border border-bone px-6 py-4 text-ink transition-colors hover:border-indigo"
    >
      {children}
    </button>
  );
}
