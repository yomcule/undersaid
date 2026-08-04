import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";
import { one } from "@/lib/embed";

async function createShipment(formData: FormData) {
  "use server";
  const legCode = String(formData.get("leg_code") ?? "");
  if (!legCode) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  // The context select encodes "kind:id" (or "" for none) so exactly one of
  // the four context columns can ever be set — the shape the one_context
  // CHECK constraint requires.
  const [contextKind, contextId] = String(formData.get("context") ?? "").split(":");
  const context: Record<string, string | null> = {
    fabric_lot_id: null,
    batch_id: null,
    order_id: null,
    return_item_id: null,
  };
  if (contextKind && contextId) {
    context[`${contextKind}_id`] = contextId;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("shipments").insert({
    leg_code: legCode,
    status_code: String(formData.get("status_code") ?? "planned"),
    reference: text("reference"),
    carrier_vendor_id: text("carrier_vendor_id"),
    carrier_name: text("carrier_name"),
    tracking_ref: text("tracking_ref"),
    tracking_url: text("tracking_url"),
    tracked_by: text("tracked_by") ?? user?.id ?? null,
    origin: text("origin"),
    destination: text("destination"),
    dispatched_on: text("dispatched_on"),
    expected_on: text("expected_on"),
    units: num("units"),
    notes: text("notes"),
    ...context,
  });
  if (error) {
    console.error("[michi] create shipment:", error.message);
    return;
  }

  redirect("/logistics");
}

export default async function NewShipmentPage() {
  const supabase = await createClient();

  const [{ data: legs }, { data: statuses }, { data: carriers }, { data: people }, { data: lots }, { data: batches }, { data: orders }, { data: returns }] =
    await Promise.all([
      supabase.from("shipment_legs").select("code, label").order("sort_order"),
      supabase.from("shipment_statuses").select("code, label").order("sort_order"),
      supabase.from("vendors").select("id, name").eq("type_code", "courier").is("archived_at", null).order("name"),
      supabase.from("profiles").select("id, full_name").is("archived_at", null),
      supabase.from("fabric_lots").select("id, lot_code").is("archived_at", null).order("lot_code"),
      supabase.from("batches").select("id, batch_code").is("archived_at", null).order("batch_code"),
      supabase.from("orders").select("id, order_ref").is("archived_at", null).order("order_ref"),
      supabase
        .from("return_items")
        .select("id, returned_on, order_lines(order_id, orders(order_ref))")
        .is("archived_at", null)
        .order("returned_on", { ascending: false }),
    ]);

  return (
    <>
      <Link href="/logistics" className="label hover:text-ink">
        ← Logistics
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Operations"
          title="New shipment"
          lede="One leg of one thing moving — fabric coming in, work going out, or an order going to a customer."
        />
      </div>

      <form action={createShipment} className="max-w-3xl">
        <FormGrid>
          <Field label="Leg" htmlFor="leg_code" hint="What kind of move this is.">
            <Select id="leg_code" name="leg_code" required>
              {(legs ?? []).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status_code">
            <Select id="status_code" name="status_code" defaultValue="planned">
              {(statuses ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What this is for" htmlFor="context" span={2} hint="Leave as — if it isn't tied to one thing.">
            <Select id="context" name="context" defaultValue="">
              <option value="">—</option>
              <optgroup label="Fabric lot">
                {(lots ?? []).map((l) => (
                  <option key={l.id} value={`fabric_lot:${l.id}`}>
                    {l.lot_code}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Batch">
                {(batches ?? []).map((b) => (
                  <option key={b.id} value={`batch:${b.id}`}>
                    {b.batch_code}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Order">
                {(orders ?? []).map((o) => (
                  <option key={o.id} value={`order:${o.id}`}>
                    {o.order_ref}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Return">
                {(returns ?? []).map((r) => {
                  const line = one<{ orders: { order_ref: string } | { order_ref: string }[] }>(
                    r.order_lines,
                  );
                  const orderRef = one<{ order_ref: string }>(line?.orders)?.order_ref ?? "return";
                  return (
                    <option key={r.id} value={`return_item:${r.id}`}>
                      {orderRef} · {r.returned_on}
                    </option>
                  );
                })}
              </optgroup>
            </Select>
          </Field>

          <Field label="Reference" htmlFor="reference" hint="Your own tracking name for it.">
            <Input id="reference" name="reference" />
          </Field>
          <Field label="Tracked by" htmlFor="tracked_by" hint="Who chases it.">
            <Select id="tracked_by" name="tracked_by">
              <option value="">—</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Carrier" htmlFor="carrier_vendor_id">
            <Select id="carrier_vendor_id" name="carrier_vendor_id">
              <option value="">—</option>
              {(carriers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Carrier (if not a vendor)" htmlFor="carrier_name">
            <Input id="carrier_name" name="carrier_name" placeholder="Delhivery, hand-carried…" />
          </Field>

          <Field label="Tracking number" htmlFor="tracking_ref">
            <Input id="tracking_ref" name="tracking_ref" className="data" />
          </Field>
          <Field label="Tracking URL" htmlFor="tracking_url">
            <Input id="tracking_url" name="tracking_url" type="url" />
          </Field>

          <Field label="Origin" htmlFor="origin">
            <Input id="origin" name="origin" />
          </Field>
          <Field label="Destination" htmlFor="destination">
            <Input id="destination" name="destination" />
          </Field>

          <Field label="Dispatched on" htmlFor="dispatched_on">
            <Input id="dispatched_on" name="dispatched_on" type="date" />
          </Field>
          <Field label="Expected on" htmlFor="expected_on">
            <Input id="expected_on" name="expected_on" type="date" />
          </Field>

          <Field label="Units" htmlFor="units">
            <NumberInput id="units" name="units" min="0" />
          </Field>

          <Field label="Notes" htmlFor="notes" span={2}>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </FormGrid>

        <Submit>Create shipment</Submit>
      </form>
    </>
  );
}
