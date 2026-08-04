import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";
import { getRole } from "@/lib/role";

const OUTGOING_KINDS = new Set(["purchase", "expense", "refund_out"]);
const INCOMING_KINDS = new Set(["sale", "refund_in", "other_income"]);

async function recordTransaction(formData: FormData) {
  "use server";
  const categoryCode = String(formData.get("category_code") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  if (!categoryCode || !amount) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    category_code: categoryCode,
    occurred_on: text("occurred_on") ?? undefined,
    description: text("description"),
    amount: Number(amount),
    tax_amount: num("tax_amount") ?? 0,
    vendor_id: text("vendor_id"),
    person_name: text("person_name"),
    invoice_no: text("invoice_no"),
    payment_method: text("payment_method"),
  });
  if (error) console.error("[michi] record transaction:", error.message);
  revalidatePath("/money");
}

// Every query on this page returns nothing for a user without
// can_see_financials. The page is not access control — RLS is.
export default async function MoneyPage() {
  const supabase = await createClient();
  const role = await getRole();

  const [{ data: payables }, { data: renewals }, { data: categories }, { data: vendors }] =
    await Promise.all([
      supabase.from("v_vendor_payables").select("*").order("due_on"),
      supabase.from("v_contract_renewals").select("*").order("expires_on"),
      supabase
        .from("transaction_categories")
        .select("code, label, kind_code")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("vendors").select("id, name").is("archived_at", null).order("name"),
    ]);

  const outgoing = (categories ?? []).filter((c) => OUTGOING_KINDS.has(c.kind_code));
  const incoming = (categories ?? []).filter((c) => INCOMING_KINDS.has(c.kind_code));

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

      {role?.canSeeFinancials ? (
        <div className="mt-24 grid gap-16 border-t border-bone pt-16 sm:grid-cols-2">
          <section>
            <h2>Record an expense</h2>
            <p className="measure mt-4 text-sm text-iron">
              Money that left. Name whoever actually spent it, even if that
              wasn&rsquo;t you.
            </p>
            <form action={recordTransaction} className="mt-8 flex flex-col gap-6">
              <Field label="Category" htmlFor="expense_category">
                <Select id="expense_category" name="category_code" required>
                  {outgoing.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount" htmlFor="expense_amount" hint="Tax-exclusive.">
                <NumberInput id="expense_amount" name="amount" step="1" min="0" required />
              </Field>
              <Field label="Tax amount" htmlFor="expense_tax">
                <NumberInput id="expense_tax" name="tax_amount" step="1" min="0" />
              </Field>
              <Field label="Spent by" htmlFor="expense_person" hint="Who actually paid it.">
                <Input id="expense_person" name="person_name" />
              </Field>
              <Field label="Vendor" htmlFor="expense_vendor">
                <Select id="expense_vendor" name="vendor_id">
                  <option value="">—</option>
                  {(vendors ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="expense_date">
                <Input id="expense_date" name="occurred_on" type="date" />
              </Field>
              <Field label="Description" htmlFor="expense_description" span={2}>
                <Textarea id="expense_description" name="description" rows={2} />
              </Field>
              <Submit>Record expense</Submit>
            </form>
          </section>

          <section>
            <h2>Record income</h2>
            <p className="measure mt-4 text-sm text-iron">
              Money that came in outside the normal order flow. Name whoever
              received it.
            </p>
            <form action={recordTransaction} className="mt-8 flex flex-col gap-6">
              <Field label="Category" htmlFor="income_category">
                <Select id="income_category" name="category_code" required>
                  {incoming.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount" htmlFor="income_amount" hint="Tax-exclusive.">
                <NumberInput id="income_amount" name="amount" step="1" min="0" required />
              </Field>
              <Field label="Tax amount" htmlFor="income_tax">
                <NumberInput id="income_tax" name="tax_amount" step="1" min="0" />
              </Field>
              <Field label="Received by" htmlFor="income_person" hint="Who actually received it.">
                <Input id="income_person" name="person_name" />
              </Field>
              <Field label="Vendor" htmlFor="income_vendor" hint="If a vendor credit or refund.">
                <Select id="income_vendor" name="vendor_id">
                  <option value="">—</option>
                  {(vendors ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="income_date">
                <Input id="income_date" name="occurred_on" type="date" />
              </Field>
              <Field label="Description" htmlFor="income_description" span={2}>
                <Textarea id="income_description" name="description" rows={2} />
              </Field>
              <Submit>Record income</Submit>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
