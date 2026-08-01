import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";

// Every query on this page returns nothing for a user without
// can_see_financials. The page is not access control — RLS is.
export default async function MoneyPage() {
  const supabase = await createClient();

  const [{ data: payables }, { data: renewals }] = await Promise.all([
    supabase.from("v_vendor_payables").select("*").order("due_on"),
    supabase.from("v_contract_renewals").select("*").order("expires_on"),
  ]);

  const nothingVisible = !payables?.length && !renewals?.length;

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Money"
        lede="Amounts are tax-exclusive. Input GST is recoverable, so counting it as cost would overstate every margin in the system."
      />

      {nothingVisible ? (
        <Empty>
          Nothing to show. If you expected figures here, your role may not
          include financial access.
        </Empty>
      ) : null}

      {payables?.length ? (
        <section className="mb-24">
          <h2>Payable</h2>
          <div className="mt-8">
            <Table head={["Vendor", "Bill", "Due", "Gross", "Paid", "Outstanding"]}>
              {payables.map((p) => (
                <Row key={p.bill_id}>
                  <Cell>{p.vendor_name}</Cell>
                  <Cell mono>{p.bill_no}</Cell>
                  <Cell mono>
                    <span className={p.is_overdue ? "text-madder" : undefined}>
                      {p.due_on
                        ? new Date(p.due_on).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })
                        : "—"}
                    </span>
                  </Cell>
                  <Cell mono><Money amount={p.gross_amount} /></Cell>
                  <Cell mono><Money amount={p.paid_amount} /></Cell>
                  <Cell mono><Money amount={p.outstanding_amount} /></Cell>
                </Row>
              ))}
            </Table>
          </div>
        </section>
      ) : null}

      {renewals?.length ? (
        <section>
          <h2>Contracts expiring</h2>
          <div className="mt-8">
            <Table head={["Contract", "Counterparty", "Expires", "Notice by", "Auto-renews"]}>
              {renewals.map((c) => (
                <Row key={c.id}>
                  <Cell>{c.title}</Cell>
                  <Cell>
                    <span className="text-iron">{c.counterparty}</span>
                  </Cell>
                  <Cell mono>
                    {new Date(c.expires_on).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </Cell>
                  <Cell mono>
                    <span className={c.notice_window_open ? "text-madder" : undefined}>
                      {c.notice_deadline
                        ? new Date(c.notice_deadline).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })
                        : "—"}
                    </span>
                  </Cell>
                  <Cell mono>{c.auto_renews ? "yes" : "no"}</Cell>
                </Row>
              ))}
            </Table>
          </div>
        </section>
      ) : null}
    </>
  );
}
