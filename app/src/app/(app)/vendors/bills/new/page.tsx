import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";

async function createBill(formData: FormData) {
  "use server";
  const vendorId = String(formData.get("vendor_id") ?? "");
  const billNo = String(formData.get("bill_no") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!vendorId || !billNo || !amount) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const { data: bill, error } = await supabase
    .from("vendor_bills")
    .insert({
      vendor_id: vendorId,
      bill_no: billNo,
      status_code: String(formData.get("status_code") ?? "approved"),
      contract_id: text("contract_id"),
      issued_on: text("issued_on") ?? undefined,
      amount: Number(amount),
      tax_amount: num("tax_amount") ?? 0,
      notes: text("notes"),
    })
    .select("id")
    .single();

  if (error || !bill) {
    console.error("[michi] create bill:", error?.message);
    return;
  }

  redirect(`/vendors/bills/${bill.id}`);
}

export default async function NewBillPage() {
  const supabase = await createClient();

  const [{ data: vendors }, { data: contracts }, { data: statuses }] = await Promise.all([
    supabase.from("vendors").select("id, name").is("archived_at", null).order("name"),
    supabase.from("contracts").select("id, title").is("archived_at", null).order("title"),
    supabase.from("bill_statuses").select("code, label").order("sort_order"),
  ]);

  return (
    <>
      <Link href="/money" className="label hover:text-ink">
        ← Money
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Payable"
          title="New vendor bill"
          lede="An invoice from a vendor. Recording it here is what makes it show up as payable — paying it happens as a separate transaction against this bill."
        />
      </div>

      <form action={createBill} className="max-w-3xl">
        <FormGrid>
          <Field label="Vendor" htmlFor="vendor_id">
            <Select id="vendor_id" name="vendor_id" required>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bill number" htmlFor="bill_no" hint="As printed on the invoice.">
            <Input id="bill_no" name="bill_no" required className="data" />
          </Field>

          <Field label="Amount" htmlFor="amount" hint="Tax-exclusive.">
            <NumberInput id="amount" name="amount" step="1" min="0" required />
          </Field>
          <Field label="Tax amount" htmlFor="tax_amount">
            <NumberInput id="tax_amount" name="tax_amount" step="1" min="0" />
          </Field>

          <Field label="Issued on" htmlFor="issued_on">
            <Input id="issued_on" name="issued_on" type="date" />
          </Field>
          <Field label="Status" htmlFor="status_code">
            <Select id="status_code" name="status_code" defaultValue="approved">
              {(statuses ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Contract" htmlFor="contract_id" hint="If billed against one." span={2}>
            <Select id="contract_id" name="contract_id">
              <option value="">—</option>
              {(contracts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="notes" span={2}>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </FormGrid>

        <Submit>Add bill</Submit>
      </form>
    </>
  );
}
