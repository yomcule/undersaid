import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";
import { one } from "@/lib/embed";

async function addVendor(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const typeCode = String(formData.get("type_code") ?? "");
  if (!name || !typeCode) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").insert({
    name,
    type_code: typeCode,
    cluster: text("cluster"),
    contact_name: text("contact_name"),
    contact_phone: text("contact_phone"),
    contact_email: text("contact_email"),
    address: text("address"),
    gstin: text("gstin"),
    payment_terms_days: num("payment_terms_days"),
    payment_terms_note: text("payment_terms_note"),
    lead_time_days: num("lead_time_days"),
    notes: text("notes"),
  });
  if (error) console.error("[michi] add vendor:", error.message);
  revalidatePath("/vendors");
}

export default async function VendorsPage() {
  const supabase = await createClient();

  const [{ data: vendors }, { data: scores }, { data: types }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, cluster, lead_time_days, vendor_types(label)")
      .is("archived_at", null)
      .order("name"),
    supabase.from("v_vendor_scorecard").select("*"),
    supabase.from("vendor_types").select("code, label").order("sort_order"),
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
                <Cell>
                  <Link href={`/vendors/${v.id}`} className="hover:text-indigo">
                    {v.name}
                  </Link>
                </Cell>
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

      <section className="mt-24 border-t border-bone pt-16">
        <h2>New vendor</h2>
        <form action={addVendor} className="mt-8 max-w-3xl">
          <FormGrid>
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required autoFocus />
            </Field>
            <Field label="Type" htmlFor="type_code">
              <Select id="type_code" name="type_code" required>
                {(types ?? []).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Cluster" htmlFor="cluster" hint="e.g. Bhiwandi, Erode.">
              <Input id="cluster" name="cluster" />
            </Field>
            <Field label="Lead time (days)" htmlFor="lead_time_days">
              <NumberInput id="lead_time_days" name="lead_time_days" min="0" />
            </Field>

            <Field label="Contact name" htmlFor="contact_name">
              <Input id="contact_name" name="contact_name" />
            </Field>
            <Field label="Contact phone" htmlFor="contact_phone">
              <Input id="contact_phone" name="contact_phone" type="tel" />
            </Field>
            <Field label="Contact email" htmlFor="contact_email">
              <Input id="contact_email" name="contact_email" type="email" />
            </Field>
            <Field label="GSTIN" htmlFor="gstin">
              <Input id="gstin" name="gstin" className="data" placeholder="27AAAAA0000A1Z5" />
            </Field>

            <Field label="Address" htmlFor="address" span={2}>
              <Textarea id="address" name="address" rows={2} />
            </Field>

            <Field label="Payment terms (days)" htmlFor="payment_terms_days">
              <NumberInput id="payment_terms_days" name="payment_terms_days" min="0" />
            </Field>
            <Field label="Payment terms note" htmlFor="payment_terms_note">
              <Input id="payment_terms_note" name="payment_terms_note" placeholder="50% advance" />
            </Field>

            <Field label="Notes" htmlFor="notes" span={2}>
              <Textarea id="notes" name="notes" rows={3} />
            </Field>
          </FormGrid>

          <Submit>Add vendor</Submit>
        </form>
      </section>
    </>
  );
}
