import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty } from "@/components/ui";
import { one } from "@/lib/embed";

export default async function VendorsPage() {
  const supabase = await createClient();

  const [{ data: vendors }, { data: scores }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, cluster, lead_time_days, vendor_types(label)")
      .is("archived_at", null)
      .order("name"),
    supabase.from("v_vendor_scorecard").select("*"),
  ]);

  const score = new Map((scores ?? []).map((s) => [s.vendor_id, s]));

  return (
    <>
      <PageHeader
        eyebrow="Supply"
        title="Vendors"
        lede="Quality is measured, not rated. These figures come from QC rejects and defect returns, so they cannot drift out of step with what actually happened."
      />

      {vendors && vendors.length > 0 ? (
        <Table
          head={["Vendor", "Type", "Cluster", "Lead time", "QC reject", "Defect returns", "Avg days late"]}
        >
          {vendors.map((v) => {
            const s = score.get(v.id);
            return (
              <Row key={v.id}>
                <Cell>{v.name}</Cell>
                <Cell>
                  <span className="text-iron">
                    {one<{ label: string }>(v.vendor_types)?.label}
                  </span>
                </Cell>
                <Cell>
                  <span className="text-iron">{v.cluster ?? "—"}</span>
                </Cell>
                <Cell mono>{v.lead_time_days ? `${v.lead_time_days}d` : "—"}</Cell>
                <Cell mono>
                  {s?.qc_reject_rate_pct !== null && s?.qc_reject_rate_pct !== undefined
                    ? `${s.qc_reject_rate_pct}%`
                    : "—"}
                </Cell>
                <Cell mono>{s?.defective_returns ?? "—"}</Cell>
                <Cell mono>
                  {s?.avg_days_late !== null && s?.avg_days_late !== undefined
                    ? s.avg_days_late
                    : "—"}
                </Cell>
              </Row>
            );
          })}
        </Table>
      ) : (
        <Empty>No vendors yet.</Empty>
      )}
    </>
  );
}
