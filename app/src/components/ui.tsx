import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="mb-16">
      <p className="label">{eyebrow}</p>
      {/* One display element per view. */}
      <h1 className="mt-4">{title}</h1>
      {lede ? <p className="measure mt-6 text-iron">{lede}</p> : null}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="bg-kora-deep p-8">{children}</div>;
}

/** A single figure. Numbers that are data use Plex Mono. */
export function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Where the figure breaks down. Omit for a figure with nowhere to go. */
  href?: string;
}) {
  const body = (
    <>
      <p className="label">{label}</p>
      <p className="data mt-4 text-3xl">{value}</p>
      {hint ? <p className="mt-2 text-sm text-iron">{hint}</p> : null}
    </>
  );

  if (!href) return <Card>{body}</Card>;

  return (
    <Link
      href={href}
      // The affordance is a hairline that arrives on hover, not a shadow or a
      // shift. Nothing else in the interface moves when pointed at.
      className="block bg-kora-deep p-8 outline-offset-2 transition-[box-shadow]
                 hover:shadow-[inset_0_-2px_0_0_var(--color-ink)]
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo"
    >
      {body}
    </Link>
  );
}

/** Lot codes, batch codes, sizes, measurements. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="data text-iron">{children}</span>;
}

export function Money({
  amount,
  currency = "INR",
}: {
  amount: number | string | null;
  currency?: string;
}) {
  if (amount === null) return <span className="data text-iron">—</span>;
  const n = typeof amount === "string" ? Number(amount) : amount;
  // ₹ before the numeral with no space.
  return (
    <span className="data">
      {new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n)}
    </span>
  );
}

/**
 * A size run — size above, quantity below, one column each.
 *
 * Laid out inline ("38 7 40 9 42 13") the sizes and the counts are both
 * numerals in the same face, so the eye cannot tell which is which and the
 * whole cell reads as one long number. Stacking separates the two registers.
 */
export function SizeRun({
  sizes,
}: {
  sizes: { size_code: string; units_on_hand: number }[];
}) {
  if (!sizes.length) return <span className="data text-iron">—</span>;

  return (
    <span className="flex flex-wrap gap-x-5 gap-y-3">
      {sizes.map((s) => (
        <span key={s.size_code} className="flex flex-col items-end">
          <span className="label leading-none">{s.size_code}</span>
          <span
            className={`data mt-1 leading-none ${
              s.units_on_hand === 0 ? "text-selvedge" : ""
            }`}
          >
            {s.units_on_hand}
          </span>
        </span>
      ))}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="measure text-iron">{children}</p>;
}

/** A column that can be sorted. `column` is the database column to order by. */
export type Column = string | { label: string; column: string };

export function Table({
  head,
  children,
  sort,
  dir,
  params,
}: {
  head: Column[];
  children: ReactNode;
  /** Current sort column, if the table is sortable. */
  sort?: string;
  dir?: "asc" | "desc";
  /** Other query params to preserve when a header is clicked (filters). */
  params?: Record<string, string | undefined>;
}) {
  function hrefFor(column: string) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    // Clicking the active column flips direction; a new column starts ascending.
    q.set("sort", column);
    q.set("dir", sort === column && dir === "asc" ? "desc" : "asc");
    return `?${q.toString()}`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-bone">
            {head.map((h, i) => {
              if (typeof h === "string") {
                return (
                  <th key={h || i} className="label py-3 pr-6 font-medium">
                    {h}
                  </th>
                );
              }
              const active = sort === h.column;
              return (
                <th
                  key={h.column}
                  className="py-3 pr-6"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <a
                    href={hrefFor(h.column)}
                    className={`label inline-flex items-center gap-1 ${
                      active ? "text-ink" : "hover:text-ink"
                    }`}
                  >
                    {h.label}
                    {/* The indicator only appears on the sorted column, so the
                        header row stays quiet rather than sprouting arrows. */}
                    <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                      {dir === "asc" ? "↑" : "↓"}
                    </span>
                  </a>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EditIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`size-4 ${className}`}
      aria-hidden="true"
    >
      <path
        d="M13.5 3.5 16.5 6.5 6.5 16.5H3.5V13.5L13.5 3.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`size-4 ${className}`}
      aria-hidden="true"
    >
      <path d="M4 6h12" strokeLinecap="round" />
      <path d="M8 6V4.5h4V6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 6l.7 9.5A1 1 0 0 0 7.2 16.5h5.6a1 1 0 0 0 1-.9l.7-9.6" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`size-4 ${className}`}
      aria-hidden="true"
    >
      <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-bone/50">{children}</tr>;
}

export function Cell({
  children,
  mono = false,
  nowrap = false,
}: {
  children: ReactNode;
  mono?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td className={`py-3 pr-6 align-top ${mono ? "data" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}>
      {children}
    </td>
  );
}
