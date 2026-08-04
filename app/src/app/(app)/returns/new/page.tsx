import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Empty } from "@/components/ui";
import { Field, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField } from "@/lib/form-data";
import { one } from "@/lib/embed";

async function createReturn(formData: FormData) {
  "use server";
  const orderLineId = String(formData.get("order_line_id") ?? "");
  const quantity = String(formData.get("quantity") ?? "").trim();
  const reasonCode = String(formData.get("reason_code") ?? "");
  if (!orderLineId || !quantity || !reasonCode) return;

  const text = (k: string) => textField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase.from("return_items").insert({
    order_line_id: orderLineId,
    quantity: Number(quantity),
    reason_code: reasonCode,
    returned_on: text("returned_on") ?? undefined,
    notes: text("notes"),
  });

  if (error) {
    // The DB enforces "cannot return more than was sold" — surfacing that
    // beats a silent failure, since the form has no client-side max per line.
    console.error("[michi] create return:", error.message);
    return;
  }

  redirect("/returns");
}

export default async function NewReturnPage() {
  const supabase = await createClient();

  const [linesRes, { data: returned }, { data: reasons }, { data: batches }] = await Promise.all([
    // batch_id has no direct FK to batches — it's part of a composite key
    // into batch_sizes — so the batch/style lookup has to be a second query.
    supabase
      .from("order_lines")
      .select("id, size_code, quantity, batch_id, orders(order_ref)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("return_items").select("order_line_id, quantity").is("archived_at", null),
    supabase.from("defect_reasons").select("code, label").order("sort_order"),
    supabase.from("batches").select("id, batch_code, styles(name)"),
  ]);
  if (linesRes.error) console.error("[michi] order lines:", linesRes.error.message);
  const lines = linesRes.data;

  const batchInfo = new Map(
    (batches ?? []).map((b) => [
      b.id,
      { batch_code: b.batch_code, style_name: one<{ name: string }>(b.styles)?.name },
    ]),
  );

  // Returnable = sold minus already returned. A line with nothing left to
  // return has no business appearing in this list at all.
  const alreadyReturned = new Map<string, number>();
  for (const r of returned ?? []) {
    alreadyReturned.set(r.order_line_id, (alreadyReturned.get(r.order_line_id) ?? 0) + r.quantity);
  }

  const returnable = (lines ?? [])
    .map((l) => {
      const batch = batchInfo.get(l.batch_id);
      const order = one<{ order_ref: string }>(l.orders);
      const left = l.quantity - (alreadyReturned.get(l.id) ?? 0);
      return {
        id: l.id,
        left,
        label: `${order?.order_ref ?? "?"} · ${batch?.batch_code ?? "?"} · ${batch?.style_name ?? ""} · size ${l.size_code} (${left} of ${l.quantity} returnable)`,
      };
    })
    .filter((l) => l.left > 0);

  return (
    <>
      <Link href="/returns" className="label hover:text-ink">
        ← Returns
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Aftercare"
          title="New return"
          lede="One order line, one reason. The quantity here can never exceed what was actually sold on that line minus what has already come back."
        />
      </div>

      {returnable.length === 0 ? (
        <Empty>No order lines have anything left to return.</Empty>
      ) : (
        <form action={createReturn} className="max-w-3xl">
          <FormGrid>
            <Field label="Order line" htmlFor="order_line_id" span={2}>
              <Select id="order_line_id" name="order_line_id" required>
                {returnable.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Quantity" htmlFor="quantity">
              <NumberInput id="quantity" name="quantity" min="1" defaultValue={1} required />
            </Field>
            <Field label="Reason" htmlFor="reason_code">
              <Select id="reason_code" name="reason_code" required>
                {(reasons ?? []).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Returned on" htmlFor="returned_on">
              <input
                id="returned_on"
                name="returned_on"
                type="date"
                className="data w-full border-b border-bone bg-transparent pb-2
                           focus:border-indigo focus:outline-none"
              />
            </Field>

            <Field label="Notes" htmlFor="notes" span={2}>
              <Textarea id="notes" name="notes" rows={3} />
            </Field>
          </FormGrid>

          <Submit>Log return</Submit>
        </form>
      )}
    </>
  );
}
