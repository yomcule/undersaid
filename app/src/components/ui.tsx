import type { ReactNode } from "react";

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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="label">{label}</p>
      <p className="data mt-4 text-3xl">{value}</p>
      {hint ? <p className="mt-2 text-sm text-iron">{hint}</p> : null}
    </Card>
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="measure text-iron">{children}</p>;
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-bone">
            {head.map((h) => (
              <th key={h} className="label py-4 pr-8 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-bone/50">{children}</tr>;
}

export function Cell({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <td className={`py-4 pr-8 align-top ${mono ? "data" : ""}`}>{children}</td>
  );
}
