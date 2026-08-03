"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

/**
 * Filters live in the URL rather than in component state, so a filtered view
 * is shareable, survives a reload, and keeps the sort links working — they
 * just carry the same params through.
 */
export function TaskFilters({
  statuses,
  assignees,
}: {
  statuses: Option[];
  assignees: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(next.size ? `${pathname}?${next}` : pathname);
  }

  const active =
    params.get("status") || params.get("assignee") || params.get("priority");

  return (
    <div className="mb-16 flex flex-wrap items-end gap-8">
      <Select
        label="Status"
        value={params.get("status") ?? "open"}
        onChange={(v) => set("status", v === "open" ? "" : v)}
        options={[
          { value: "open", label: "Open" },
          { value: "all", label: "All" },
          ...statuses,
        ]}
      />
      <Select
        label="Assignee"
        value={params.get("assignee") ?? ""}
        onChange={(v) => set("assignee", v)}
        options={[
          { value: "", label: "Anyone" },
          { value: "none", label: "Unassigned" },
          ...assignees,
        ]}
      />
      <Select
        label="Priority"
        value={params.get("priority") ?? ""}
        onChange={(v) => set("priority", v)}
        options={[
          { value: "", label: "Any" },
          ...[1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: String(p) })),
        ]}
      />

      {active ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="label pb-2 hover:text-ink"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-b border-bone bg-transparent pb-2 pr-4 text-ink
                   focus:border-indigo focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
