import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";

async function createBatch(formData: FormData) {
  "use server";

  const code = String(formData.get("batch_code") ?? "").trim();
  const styleId = String(formData.get("style_id") ?? "");
  if (!code || !styleId) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: batch, error } = await supabase
    .from("batches")
    .insert({
      batch_code: code,
      style_id: styleId,
      tailor_vendor_id: text("tailor_vendor_id"),
      status_code: String(formData.get("status_code") ?? "planned"),
      cut_on: text("cut_on"),
      expected_ready_on: text("expected_ready_on"),
      cmt_cost_per_unit: num("cmt_cost_per_unit"),
      aql_level: text("aql_level"),
      tracked_by: text("tracked_by") ?? user?.id ?? null,
      notes: text("notes"),
    })
    .select("id")
    .single();

  if (error || !batch) {
    console.error("[michi] create batch:", error?.message);
    return;
  }

  // Per-size plan. Sizes with no number are simply not cut in this run, so
  // they are skipped rather than stored as zeros.
  const rows = formData
    .getAll("size_code")
    .map(String)
    .map((size_code) => ({
      batch_id: batch.id,
      size_code,
      units_planned: Number(formData.get(`planned_${size_code}`) ?? 0) || 0,
    }))
    .filter((r) => r.units_planned > 0);

  if (rows.length) {
    const { error: sizeError } = await supabase.from("batch_sizes").insert(rows);
    if (sizeError) console.error("[michi] batch sizes:", sizeError.message);
  }

  // Which lot is being cut, and how much of it. This is what batch economics
  // allocates fabric cost from — without it the run has no material cost.
  const lotId = text("fabric_lot_id");
  const metres = num("metres_used");
  if (lotId && metres) {
    const { error: usageError } = await supabase
      .from("batch_fabric_usage")
      .insert({ batch_id: batch.id, fabric_lot_id: lotId, metres_used: metres });
    if (usageError) console.error("[michi] fabric usage:", usageError.message);
  }

  redirect("/batches");
}

export default async function NewBatchPage(props: {
  searchParams: Promise<{ style?: string }>;
}) {
  const { style: preselect } = await props.searchParams;
  const supabase = await createClient();

  const [styles, tailors, lots, statuses, people, sizes] = await Promise.all([
    supabase
      .from("styles")
      .select("id, style_code, name, style_sizes(size_code)")
      .is("archived_at", null)
      .order("style_code"),
    supabase
      .from("vendors")
      .select("id, name")
      .eq("type_code", "tailor")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("fabric_lots")
      .select("id, lot_code, colour_name, weave, metres_received")
      .is("archived_at", null)
      .order("lot_code"),
    supabase.from("batch_statuses").select("code, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
    supabase.from("sizes").select("code, scale").eq("scale", "chest").order("sort_order"),
  ]);

  return (
    <>
      <Link href="/batches" className="label hover:text-ink">
        ← Batches
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Production"
          title="New batch"
          lede="One run of one style in one cloth. Record the fabric and metres now — that is what makes cost per unit real rather than a guess."
        />
      </div>

      <form action={createBatch} className="max-w-3xl">
        <FormGrid>
          <Field label="Batch code" htmlFor="batch_code" hint="e.g. B-2026-004">
            <Input id="batch_code" name="batch_code" required className="data" autoFocus />
          </Field>

          <Field label="Style" htmlFor="style_id">
            <Select id="style_id" name="style_id" required defaultValue={preselect}>
              {(styles.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.style_code} — {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tailor" htmlFor="tailor_vendor_id" hint="Who is making it.">
            <Select id="tailor_vendor_id" name="tailor_vendor_id">
              <option value="">—</option>
              {(tailors.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tracked by" htmlFor="tracked_by" hint="Who chases it.">
            <Select id="tracked_by" name="tracked_by">
              <option value="">—</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status_code">
            <Select id="status_code" name="status_code" defaultValue="planned">
              {(statuses.data ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="AQL level" htmlFor="aql_level">
            <Input id="aql_level" name="aql_level" placeholder="2.5" className="data" />
          </Field>

          <Field label="Cut on" htmlFor="cut_on">
            <Input id="cut_on" name="cut_on" type="date" />
          </Field>
          <Field label="Expected ready" htmlFor="expected_ready_on">
            <Input id="expected_ready_on" name="expected_ready_on" type="date" />
          </Field>

          <Field label="CMT per unit" htmlFor="cmt_cost_per_unit" hint="Tax-exclusive.">
            <NumberInput id="cmt_cost_per_unit" name="cmt_cost_per_unit" step="1" min="0" />
          </Field>

          {/* --- fabric --- */}
          <Field label="Fabric lot" htmlFor="fabric_lot_id" span={2}>
            <Select id="fabric_lot_id" name="fabric_lot_id">
              <option value="">—</option>
              {(lots.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot_code} — {[l.colour_name, l.weave].filter(Boolean).join(" ")}
                  {l.metres_received ? ` (${l.metres_received}m received)` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Metres used"
            htmlFor="metres_used"
            hint="Roughly 1.6 m per shirt. Fabric cost is allocated pro-rata from this."
          >
            <NumberInput id="metres_used" name="metres_used" step="0.1" min="0" />
          </Field>

          {/* --- size plan --- */}
          <Field
            label="Units planned by size"
            span={2}
            hint="Leave a size blank if this run does not cut it."
          >
            <div className="flex flex-wrap gap-6 pt-2">
              {(sizes.data ?? []).map((s) => (
                <label key={s.code} className="flex flex-col items-center gap-2">
                  <span className="data text-iron">{s.code}</span>
                  <input type="hidden" name="size_code" value={s.code} />
                  <input
                    type="number"
                    name={`planned_${s.code}`}
                    min="0"
                    className="data w-16 border-b border-bone bg-transparent pb-2 text-center
                               focus:border-indigo focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </Field>

          <Field label="Notes" htmlFor="notes" span={2}>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </FormGrid>

        <Submit>Create batch</Submit>
      </form>
    </>
  );
}
