import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Money, Empty, Code } from "@/components/ui";
import { Field, Input, NumberInput, Select, Submit, SubmitGhost } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";
import { one } from "@/lib/embed";

const PURCHASE_KINDS = new Set(["purchase", "expense"]);

async function recordPayment(formData: FormData) {
  "use server";
  const billId = String(formData.get("bill_id"));
  const vendorId = String(formData.get("vendor_id"));
  const categoryCode = String(formData.get("category_code") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  if (!categoryCode || !amount) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    category_code: categoryCode,
    vendor_id: vendorId,
    vendor_bill_id: billId,
    occurred_on: text("occurred_on") ?? undefined,
    amount: Number(amount),
    tax_amount: num("tax_amount") ?? 0,
    person_name: text("person_name"),
    payment_method: text("payment_method"),
  });
  if (error) {
    console.error("[michi] record payment:", error.message);
    revalidatePath(`/vendors/bills/${billId}`);
    return;
  }

  // Paid in full flips the bill automatically; a partial payment does not
  // overwrite a status someone set on purpose (disputed, void).
  const { data: bill } = await supabase
    .from("v_vendor_payables")
    .select("outstanding_amount, status_code")
    .eq("bill_id", billId)
    .maybeSingle();

  if (bill && Number(bill.outstanding_amount) <= 0 && bill.status_code !== "void") {
    await supabase.from("vendor_bills").update({ status_code: "paid" }).eq("id", billId);
  } else if (bill && bill.status_code === "approved") {
    await supabase.from("vendor_bills").update({ status_code: "part_paid" }).eq("id", billId);
  }

  revalidatePath(`/vendors/bills/${billId}`);
  revalidatePath("/money");
}

async function updateStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("bill_id"));
  const status = String(formData.get("status_code"));
  const supabase = await createClient();
  await supabase.from("vendor_bills").update({ status_code: status }).eq("id", id);
  revalidatePath(`/vendors/bills/${id}`);
}

export default async function BillDetail(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from("vendor_bills")
    .select("*, vendors(name), contracts(title), bill_statuses(label)")
    .eq("id", id)
    .maybeSingle();

  if (!bill) notFound();

  const [{ data: payments }, { data: categories }, { data: statuses }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, occurred_on, category_code, amount, tax_amount, gross_amount, person_name, payment_method")
      .eq("vendor_bill_id", id)
      .is("archived_at", null)
      .order("occurred_on", { ascending: false }),
    supabase
      .from("transaction_categories")
      .select("code, label, kind_code")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("bill_statuses").select("code, label").order("sort_order"),
  ]);

  const paidSoFar = (payments ?? []).reduce((a, p) => a + Number(p.gross_amount), 0);
  const outstanding = Number(bill.gross_amount) - paidSoFar;
  const purchaseCategories = (categories ?? []).filter((c) => PURCHASE_KINDS.has(c.kind_code));

  return (
    <>
      <Link href="/money" className="label hover:text-ink">
        ← Money
      </Link>

      <div className="mt-8 grid gap-16 lg:grid-cols-[1fr_18rem]">
        <div>
          <PageHeader
            eyebrow={one<{ name: string }>(bill.vendors)?.name ?? "Vendor bill"}
            title={bill.bill_no}
            lede={
              one<{ title: string }>(bill.contracts)?.title
                ? `Against ${one<{ title: string }>(bill.contracts)?.title}`
                : undefined
            }
          />

          <section>
            <h2>Payments</h2>
            {payments && payments.length > 0 ? (
              <Table head={["Date", "Category", "Amount", "By", "Method"]}>
                {payments.map((p) => (
                  <Row key={p.id}>
                    <Cell mono>{p.occurred_on}</Cell>
                    <Cell>
                      <span className="text-iron">{p.category_code}</span>
                    </Cell>
                    <Cell mono>
                      <Money amount={p.gross_amount} />
                    </Cell>
                    <Cell>
                      <span className="text-iron">{p.person_name ?? "—"}</span>
                    </Cell>
                    <Cell>
                      <span className="text-iron">{p.payment_method ?? "—"}</span>
                    </Cell>
                  </Row>
                ))}
              </Table>
            ) : (
              <Empty>No payments recorded against this bill yet.</Empty>
            )}
          </section>

          {outstanding > 0 ? (
            <section className="mt-24 border-t border-bone pt-16">
              <h2>Record a payment</h2>
              <form action={recordPayment} className="mt-8 flex max-w-xl flex-col gap-6">
                <input type="hidden" name="bill_id" value={bill.id} />
                <input type="hidden" name="vendor_id" value={bill.vendor_id} />
                <Field label="Category" htmlFor="category_code">
                  <Select id="category_code" name="category_code" required>
                    {purchaseCategories.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Amount"
                  htmlFor="amount"
                  hint={`Outstanding: ₹${outstanding.toLocaleString("en-IN")}`}
                >
                  <NumberInput
                    id="amount"
                    name="amount"
                    step="0.01"
                    min="0"
                    max={outstanding}
                    defaultValue={outstanding}
                    required
                  />
                </Field>
                <Field label="Tax amount" htmlFor="tax_amount">
                  <NumberInput id="tax_amount" name="tax_amount" step="0.01" min="0" />
                </Field>
                <Field label="Paid by" htmlFor="person_name">
                  <Input id="person_name" name="person_name" />
                </Field>
                <Field label="Method" htmlFor="payment_method">
                  <Input id="payment_method" name="payment_method" placeholder="UPI, cheque, cash…" />
                </Field>
                <Field label="Date" htmlFor="occurred_on">
                  <Input id="occurred_on" name="occurred_on" type="date" />
                </Field>
                <Submit>Record payment</Submit>
              </form>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-8 lg:border-l lg:border-bone lg:pl-8">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-iron">Gross</span>
              <Money amount={bill.gross_amount} />
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-iron">Paid</span>
              <Money amount={paidSoFar} />
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-iron">Outstanding</span>
              <span className={outstanding > 0 ? "text-madder" : undefined}>
                <Money amount={outstanding} />
              </span>
            </div>
            {bill.due_on ? (
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-iron">Due</span>
                <Code>{bill.due_on}</Code>
              </div>
            ) : null}
          </div>

          <form action={updateStatus} className="flex flex-col gap-2 border-t border-bone pt-8">
            <input type="hidden" name="bill_id" value={bill.id} />
            <p className="label mb-2">Status</p>
            <Select name="status_code" defaultValue={bill.status_code}>
              {(statuses ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
            <div>
              <SubmitGhost>Update</SubmitGhost>
            </div>
          </form>
        </aside>
      </div>
    </>
  );
}
