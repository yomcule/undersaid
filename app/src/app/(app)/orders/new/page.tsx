import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";

const LINE_ROWS = 6;

async function createOrder(formData: FormData) {
  "use server";

  const orderRef = String(formData.get("order_ref") ?? "").trim();
  if (!orderRef) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k) ?? 0;

  // One combined "batch_id::size_code" value per row, chosen from stock that
  // actually exists — the composite FK on order_lines would reject anything
  // else, but this way a bad combination can't be picked in the first place.
  const combos = formData.getAll("line_combo").map(String);
  const qtys = formData.getAll("line_qty").map(String);
  const prices = formData.getAll("line_price").map(String);

  const lines = combos
    .map((combo, i) => {
      const [batch_id, size_code] = combo.split("::");
      return {
        batch_id,
        size_code,
        quantity: Number(qtys[i] ?? 0) || 0,
        unit_price: Number(prices[i] ?? 0) || 0,
      };
    })
    .filter((l) => l.batch_id && l.size_code && l.quantity > 0);

  if (!lines.length) return;

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      order_ref: orderRef,
      channel_code: String(formData.get("channel_code") ?? "shopify"),
      status_code: String(formData.get("status_code") ?? "confirmed"),
      placed_at: text("placed_at") ?? undefined,
      customer_name: text("customer_name"),
      customer_ref: text("customer_ref"),
      shipping_city: text("shipping_city"),
      shipping_state: text("shipping_state"),
      subtotal,
      shipping_amount: num("shipping_amount"),
      discount_amount: num("discount_amount"),
      tax_amount: num("tax_amount"),
      notes: text("notes"),
    })
    .select("id")
    .single();

  if (error || !order) {
    console.error("[michi] create order:", error?.message);
    return;
  }

  const { error: lineError } = await supabase
    .from("order_lines")
    .insert(lines.map((l) => ({ ...l, order_id: order.id })));
  if (lineError) console.error("[michi] order lines:", lineError.message);

  redirect("/orders");
}

export default async function NewOrderPage() {
  const supabase = await createClient();

  const [stock, channels, statuses] = await Promise.all([
    supabase
      .from("v_batch_size_inventory")
      .select("batch_id, batch_code, style_code, size_code, units_on_hand")
      .gt("units_on_hand", 0)
      .order("batch_code")
      .order("size_code"),
    supabase.from("sales_channels").select("code, label"),
    supabase.from("order_statuses").select("code, label").order("sort_order"),
  ]);

  const options = stock.data ?? [];

  return (
    <>
      <Link href="/orders" className="label hover:text-ink">
        ← Orders
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Sales"
          title="New order"
          lede="Every line sells a specific size out of a specific batch, so units on hand can only ever come from stock that was actually cut."
        />
      </div>

      <form action={createOrder} className="max-w-3xl">
        <FormGrid>
          <Field label="Order ref" htmlFor="order_ref" hint="e.g. #1042 or the Shopify order name">
            <Input id="order_ref" name="order_ref" required className="data" autoFocus />
          </Field>

          <Field label="Channel" htmlFor="channel_code">
            <Select id="channel_code" name="channel_code" defaultValue="shopify">
              {(channels.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status_code">
            <Select id="status_code" name="status_code" defaultValue="confirmed">
              {(statuses.data ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Placed on" htmlFor="placed_at">
            <Input id="placed_at" name="placed_at" type="date" />
          </Field>

          <Field label="Customer name" htmlFor="customer_name">
            <Input id="customer_name" name="customer_name" />
          </Field>
          <Field label="Customer ref" htmlFor="customer_ref" hint="Phone, email, or external ID.">
            <Input id="customer_ref" name="customer_ref" />
          </Field>

          <Field label="Shipping city" htmlFor="shipping_city">
            <Input id="shipping_city" name="shipping_city" />
          </Field>
          <Field label="Shipping state" htmlFor="shipping_state">
            <Input id="shipping_state" name="shipping_state" />
          </Field>

          <Field label="Shipping amount" htmlFor="shipping_amount">
            <NumberInput id="shipping_amount" name="shipping_amount" step="1" min="0" />
          </Field>
          <Field label="Discount amount" htmlFor="discount_amount">
            <NumberInput id="discount_amount" name="discount_amount" step="1" min="0" />
          </Field>
          <Field label="Tax amount" htmlFor="tax_amount">
            <NumberInput id="tax_amount" name="tax_amount" step="1" min="0" />
          </Field>

          {/* --- lines --- */}
          <Field
            label="Lines"
            span={2}
            hint="Leave a row's size blank to skip it. Only sizes with stock on hand are offered."
          >
            <div className="mt-2 flex flex-col gap-4">
              {Array.from({ length: LINE_ROWS }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_8rem] gap-4">
                  <Select name="line_combo" defaultValue="" className="data">
                    <option value="">—</option>
                    {options.map((o) => (
                      <option
                        key={`${o.batch_id}::${o.size_code}`}
                        value={`${o.batch_id}::${o.size_code}`}
                      >
                        {o.batch_code} · {o.style_code} · {o.size_code} ({o.units_on_hand} on hand)
                      </option>
                    ))}
                  </Select>
                  <NumberInput name="line_qty" min="0" placeholder="Qty" />
                  <NumberInput name="line_price" step="1" min="0" placeholder="Price" />
                </div>
              ))}
            </div>
          </Field>

          <Field label="Notes" htmlFor="notes" span={2}>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </FormGrid>

        <Submit>Create order</Submit>
      </form>
    </>
  );
}
