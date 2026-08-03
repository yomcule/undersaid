import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Money, SizeRun } from "@/components/ui";
import { one } from "@/lib/embed";
import { getRole } from "@/lib/role";

export default async function BatchesPage() {
  const supabase = await createClient();
  const role = await getRole();
  const showMoney = role?.canSeeFinancials ?? false;

  const [{ data: batches }, { data: economics }, { data: inventory }] =
    await Promise.all([
      supabase
        .from("batches")
        .select("id, batch_code, status_code, batch_statuses(label), styles(style_code, name)")
        .is("archived_at", null)
        .order("batch_code"),
      // Empty for anyone without can_see_financials — the view gates itself.
      supabase.from("v_batch_economics").select("*"),
      supabase.from("v_batch_size_inventory").select("*"),
    ]);

  const econ = new Map((economics ?? []).map((e) => [e.batch_id, e]));
  const stock = new Map<string, { size_code: string; units_on_hand: number }[]>();
  for (const row of inventory ?? []) {
    const list = stock.get(row.batch_id) ?? [];
    list.push({ size_code: row.size_code, units_on_hand: row.units_on_hand });
    stock.set(row.batch_id, list);
  }

  return (
    <>
      <PageHeader
        eyebrow="Production"
        title="Batches"
        lede="Cost is allocated from fabric actually consumed and CMT actually invoiced. Units sold come from orders, never a hand-kept counter."
      />

      {batches && batches.length > 0 ? (
        <Table
          head={
            showMoney
              ? ["Batch", "Style", "Status", "On hand", "Cost/unit", "Margin"]
              : ["Batch", "Style", "Status"]
          }
        >
          {batches.map((b) => {
            const e = econ.get(b.id);
            const sizes = stock.get(b.id) ?? [];
            const style = one<{ style_code: string; name: string }>(b.styles);
            return (
              <Row key={b.id}>
                <Cell mono>{b.batch_code}</Cell>
                <Cell>
                  {style?.name}
                  <span className="data ml-2 text-iron">{style?.style_code}</span>
                </Cell>
                <Cell>
                  <span className="text-iron">
                    {one<{ label: string }>(b.batch_statuses)?.label}
                  </span>
                </Cell>
                {showMoney ? (
                  <>
                    <Cell>
                      <SizeRun sizes={sizes} />
                    </Cell>
                    <Cell mono>
                      <Money amount={e?.cost_per_unit ?? null} />
                    </Cell>
                    <Cell mono>
                      {e ? (
                        <span
                          className={
                            Number(e.gross_margin) < 0 ? "text-madder" : undefined
                          }
                        >
                          <Money amount={e.gross_margin} />
                          {e.gross_margin_pct !== null ? (
                            <span className="ml-2 text-iron">
                              {e.gross_margin_pct}%
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-iron">—</span>
                      )}
                    </Cell>
                  </>
                ) : null}
              </Row>
            );
          })}
        </Table>
      ) : (
        <Empty>No batches yet.</Empty>
      )}
    </>
  );
}
