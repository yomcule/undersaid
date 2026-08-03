import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";

// Orders and order_lines are financial-only tables — RLS returns zero rows
// for anyone without can_see_financials, so a bare Empty state (rather than
// a role check) is what a contributor actually sees here.
export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      `id, order_ref, channel_code, status_code, placed_at, customer_name,
       shipping_amount, discount_amount, tax_amount,
       order_lines(quantity, line_net)`,
    )
    .order("placed_at", { ascending: false });

  return (
    <>
      <div className="flex items-start justify-between gap-8">
        <PageHeader
          eyebrow="Sales"
          title="Orders"
          lede="Units sold and revenue everywhere else in the app come from these lines — not from a hand-kept counter."
        />
        <Link href="/orders/new" className="shrink-0 bg-indigo px-6 py-4 text-kora hover:opacity-90">
          New order
        </Link>
      </div>

      {orders && orders.length > 0 ? (
        <Table head={["Order", "Channel", "Status", "Customer", "Units", "Total"]}>
          {orders.map((o) => {
            const lines = (o.order_lines as { quantity: number; line_net: string }[] | null) ?? [];
            const units = lines.reduce((n, l) => n + l.quantity, 0);
            const subtotal = lines.reduce((n, l) => n + Number(l.line_net), 0);
            const total =
              subtotal +
              Number(o.shipping_amount) +
              Number(o.tax_amount) -
              Number(o.discount_amount);
            return (
              <Row key={o.id}>
                <Cell mono>{o.order_ref}</Cell>
                <Cell>
                  <span className="text-iron">{o.channel_code}</span>
                </Cell>
                <Cell>
                  <span className="text-iron">{o.status_code}</span>
                </Cell>
                <Cell>{o.customer_name ?? "—"}</Cell>
                <Cell mono>{units}</Cell>
                <Cell mono>
                  <Money amount={total} />
                </Cell>
              </Row>
            );
          })}
        </Table>
      ) : (
        <Empty>
          No orders yet, or your role does not include financial access.
        </Empty>
      )}
    </>
  );
}
