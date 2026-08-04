import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";
import { Field, Input, NumberInput, Select, Submit, FormGrid } from "@/components/form";
import { one } from "@/lib/embed";
import { getRole } from "@/lib/role";
import { textField, numberField } from "@/lib/form-data";

async function addLot(formData: FormData) {
  "use server";
  const lotCode = String(formData.get("lot_code") ?? "").trim();
  const vendorId = String(formData.get("vendor_id") ?? "");
  if (!lotCode || !vendorId) return;

  const num = (k: string) => numberField(formData, k);
  const text = (k: string) => textField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase.from("fabric_lots").insert({
    lot_code: lotCode,
    vendor_id: vendorId,
    fibre: text("fibre"),
    composition: text("composition"),
    weave: text("weave"),
    gsm: num("gsm"),
    width_cm: num("width_cm"),
    colour_name: text("colour_name"),
    metres_ordered: num("metres_ordered"),
    metres_received: num("metres_received"),
    cost_per_metre: num("cost_per_metre"),
    shrinkage_pct: num("shrinkage_pct"),
    received_on: text("received_on"),
  });
  if (error) console.error("[michi] add lot:", error.message);
  revalidatePath("/fabric");
}

export default async function FabricPage() {
  const supabase = await createClient();
  const role = await getRole();
  const showMoney = role?.canSeeFinancials ?? false;

  const [{ data: lots }, { data: vendors }, { data: usage }] = await Promise.all([
    supabase
      .from("fabric_lots")
      .select("*, vendors(name)")
      .is("archived_at", null)
      .order("received_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("vendors")
      .select("id, name, type_code")
      .is("archived_at", null)
      .order("name"),
    supabase.from("batch_fabric_usage").select("fabric_lot_id, metres_used"),
  ]);

  // Metres left on a lot, so you can see what is still available to cut.
  const used = new Map<string, number>();
  for (const u of usage ?? []) {
    used.set(u.fabric_lot_id, (used.get(u.fabric_lot_id) ?? 0) + Number(u.metres_used));
  }

  return (
    <>
      <PageHeader
        eyebrow="Materials"
        title="Fabric lots"
        lede="A lot is a specific length of a specific cloth from one vendor. Cost per metre here is what batch economics allocates from, by metres actually consumed."
      />

      {lots && lots.length > 0 ? (
        <Table
          head={
            showMoney
              ? ["Lot", "Vendor", "Cloth", "GSM", "Received", "Used", "Left", "Cost/m"]
              : ["Lot", "Vendor", "Cloth", "GSM", "Received", "Used", "Left"]
          }
        >
          {lots.map((l) => {
            const u = used.get(l.id) ?? 0;
            const received = Number(l.metres_received ?? 0);
            const left = received - u;
            return (
              <Row key={l.id}>
                <Cell mono>{l.lot_code}</Cell>
                <Cell>
                  <span className="text-iron">
                    {one<{ name: string }>(l.vendors)?.name ?? "—"}
                  </span>
                </Cell>
                <Cell>
                  {l.colour_name ? `${l.colour_name} ` : ""}
                  {l.weave ?? ""}
                  {l.composition ? (
                    <span className="block text-sm text-iron">{l.composition}</span>
                  ) : null}
                </Cell>
                <Cell mono>{l.gsm ?? "—"}</Cell>
                <Cell mono>{received || "—"}</Cell>
                <Cell mono>{u || "—"}</Cell>
                <Cell mono>
                  {/* Cutting more than was received is a data error worth seeing. */}
                  <span className={left < 0 ? "text-madder" : undefined}>
                    {received ? left.toFixed(1) : "—"}
                  </span>
                </Cell>
                {showMoney ? (
                  <Cell mono>
                    <Money amount={l.cost_per_metre} currency={l.currency_code} />
                  </Cell>
                ) : null}
              </Row>
            );
          })}
        </Table>
      ) : (
        <Empty>No fabric lots yet. Add the first one below.</Empty>
      )}

      <section className="mt-24 border-t border-bone pt-16">
        <h2>Receive a lot</h2>
        <form action={addLot} className="mt-8 max-w-3xl">
          <FormGrid>
            <Field label="Lot code" htmlFor="lot_code" hint="e.g. LOT-2026-004">
              <Input id="lot_code" name="lot_code" required className="data" />
            </Field>

            <Field label="Vendor" htmlFor="vendor_id">
              <Select id="vendor_id" name="vendor_id" required>
                {(vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fibre" htmlFor="fibre">
              <Input id="fibre" name="fibre" placeholder="Cotton" />
            </Field>
            <Field label="Composition" htmlFor="composition">
              <Input id="composition" name="composition" placeholder="100% Handloom Cotton" />
            </Field>
            <Field label="Weave" htmlFor="weave">
              <Input id="weave" name="weave" placeholder="Oxford" />
            </Field>
            <Field label="Colour" htmlFor="colour_name">
              <Input id="colour_name" name="colour_name" placeholder="Indigo" />
            </Field>

            <Field label="GSM" htmlFor="gsm">
              <NumberInput id="gsm" name="gsm" min="1" />
            </Field>
            <Field label="Width (cm)" htmlFor="width_cm">
              <NumberInput id="width_cm" name="width_cm" step="0.5" min="1" />
            </Field>

            <Field label="Metres ordered" htmlFor="metres_ordered">
              <NumberInput id="metres_ordered" name="metres_ordered" step="0.1" min="0" />
            </Field>
            <Field
              label="Metres received"
              htmlFor="metres_received"
              hint="Short deliveries are normal — record what actually arrived."
            >
              <NumberInput id="metres_received" name="metres_received" step="0.1" min="0" />
            </Field>

            <Field label="Cost per metre" htmlFor="cost_per_metre" hint="Tax-exclusive.">
              <NumberInput id="cost_per_metre" name="cost_per_metre" step="0.01" min="0" />
            </Field>
            <Field
              label="Shrinkage %"
              htmlFor="shrinkage_pct"
              hint="Measured after the first wash test."
            >
              <NumberInput id="shrinkage_pct" name="shrinkage_pct" step="0.1" min="0" max="100" />
            </Field>

            <Field label="Received on" htmlFor="received_on">
              <Input id="received_on" name="received_on" type="date" />
            </Field>
          </FormGrid>

          <Submit>Add lot</Submit>
        </form>
      </section>
    </>
  );
}
