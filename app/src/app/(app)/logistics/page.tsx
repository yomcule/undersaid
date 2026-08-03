import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Code } from "@/components/ui";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default async function LogisticsPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("v_logistics")
    .select("*")
    // Late first, then by what is due soonest.
    .order("is_late", { ascending: false })
    .order("expected_on", { ascending: true, nullsFirst: false });

  if (error) console.error("[michi] logistics:", error.message);

  const all = rows ?? [];
  const production = all.filter((r) => r.kind === "production");
  const moving = all.filter((r) => r.kind === "shipment");
  const late = all.filter((r) => r.is_late);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Logistics"
        lede="What is being made and who is making it; what is moving and who is chasing it."
      />

      {late.length > 0 ? (
        <p className="measure mb-16 border-l-2 border-madder pl-6 text-madder">
          {late.length === 1
            ? "One thing is past its promised date."
            : `${late.length} things are past their promised date.`}{" "}
          They are at the top of each list.
        </p>
      ) : null}

      <Section
        title="In production"
        lede="Cut, but not yet ready. The counterparty is the unit making it."
        rows={production}
        counterpartyLabel="Tailor"
      />

      <Section
        title="In transit"
        lede="Fabric coming in, work going out, orders going to customers."
        rows={moving}
        counterpartyLabel="Carrier"
        showTracking
      />
    </>
  );
}

type Row = {
  id: string;
  reference: string | null;
  leg_label: string;
  status_label: string;
  counterparty: string | null;
  tracking_ref: string | null;
  tracking_url: string | null;
  tracked_by_name: string | null;
  expected_on: string | null;
  units: number | null;
  style_name: string | null;
  is_late: boolean;
  days_to_expected: number | null;
};

function Section({
  title,
  lede,
  rows,
  counterpartyLabel,
  showTracking = false,
}: {
  title: string;
  lede: string;
  rows: Row[];
  counterpartyLabel: string;
  showTracking?: boolean;
}) {
  return (
    <section className="mt-24 first:mt-0">
      <h2>{title}</h2>
      <p className="measure mt-4 mb-8 text-iron">{lede}</p>

      {rows.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <Table
          head={[
            "Ref",
            "Leg",
            counterpartyLabel,
            ...(showTracking ? ["Tracking"] : []),
            "Chasing",
            "Units",
            "Expected",
            "Status",
          ]}
        >
          {rows.map((r) => (
            <Row key={r.id}>
              <Cell mono>{r.reference ?? "—"}</Cell>
              <Cell>
                {r.leg_label}
                {r.style_name ? (
                  <span className="ml-2 text-sm text-iron">{r.style_name}</span>
                ) : null}
              </Cell>
              <Cell>
                <span className="text-iron">{r.counterparty ?? "—"}</span>
              </Cell>
              {showTracking ? (
                <Cell mono>
                  {r.tracking_ref ? (
                    r.tracking_url ? (
                      <a
                        href={r.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-bone underline-offset-4 hover:decoration-indigo"
                      >
                        {r.tracking_ref}
                      </a>
                    ) : (
                      r.tracking_ref
                    )
                  ) : (
                    <span className="text-iron">—</span>
                  )}
                </Cell>
              ) : null}
              <Cell>
                {/* An unchased parcel is the actual failure mode, so the gap
                    is called out rather than left as a quiet dash. */}
                {r.tracked_by_name ?? (
                  <span className="text-madder">nobody</span>
                )}
              </Cell>
              <Cell mono>{r.units ?? "—"}</Cell>
              <Cell mono>
                <span className={r.is_late ? "text-madder" : undefined}>
                  {fmt(r.expected_on)}
                </span>
                {r.days_to_expected !== null ? (
                  <span className="ml-2 text-sm text-iron">
                    {r.days_to_expected < 0
                      ? `${Math.abs(r.days_to_expected)}d late`
                      : `in ${r.days_to_expected}d`}
                  </span>
                ) : null}
              </Cell>
              <Cell>
                <span className={r.is_late ? "text-madder" : "text-iron"}>
                  {r.status_label}
                </span>
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </section>
  );
}
