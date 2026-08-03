import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Money, Code, Empty } from "@/components/ui";
import { Field, Select, NumberInput, Textarea, SubmitGhost } from "@/components/form";
import { one } from "@/lib/embed";
import { getRole } from "@/lib/role";

async function recordProduction(formData: FormData) {
  "use server";
  const batchId = String(formData.get("batch_id"));
  const supabase = await createClient();

  // One upsert per size. Zero is a real answer here — "we cut 12 and none
  // passed" — so unlike the planning form, blanks are treated as zero.
  const rows = formData
    .getAll("size_code")
    .map(String)
    .map((size_code) => ({
      batch_id: batchId,
      size_code,
      units_planned: Number(formData.get(`planned_${size_code}`) ?? 0) || 0,
      units_produced: Number(formData.get(`produced_${size_code}`) ?? 0) || 0,
      units_rejected: Number(formData.get(`rejected_${size_code}`) ?? 0) || 0,
    }));

  if (rows.length) {
    const { error } = await supabase
      .from("batch_sizes")
      .upsert(rows, { onConflict: "batch_id,size_code" });
    if (error) console.error("[michi] production:", error.message);
  }

  revalidatePath(`/batches/${batchId}`);
}

async function updateBatch(formData: FormData) {
  "use server";
  const id = String(formData.get("batch_id"));
  const patch: Record<string, unknown> = {};
  const status = String(formData.get("status_code") ?? "");
  const qc = String(formData.get("qc_notes") ?? "");
  const ready = String(formData.get("ready_on") ?? "");
  if (status) patch.status_code = status;
  if (formData.has("qc_notes")) patch.qc_notes = qc || null;
  if (formData.has("ready_on")) patch.ready_on = ready || null;

  const supabase = await createClient();
  const { error } = await supabase.from("batches").update(patch).eq("id", id);
  if (error) console.error("[michi] update batch:", error.message);
  revalidatePath(`/batches/${id}`);
}

export default async function BatchDetail(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const role = await getRole();
  const showMoney = role?.canSeeFinancials ?? false;

  const { data: batch } = await supabase
    .from("batches")
    .select(
      `*, batch_statuses(label, is_open), styles(style_code, name),
       vendors:tailor_vendor_id(name), profiles:tracked_by(full_name)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!batch) notFound();

  const [inventory, econ, statuses, usage] = await Promise.all([
    supabase
      .from("v_batch_size_inventory")
      .select("*")
      .eq("batch_id", id)
      .order("size_code"),
    supabase.from("v_batch_economics").select("*").eq("batch_id", id).maybeSingle(),
    supabase.from("batch_statuses").select("code, label").order("sort_order"),
    supabase
      .from("batch_fabric_usage")
      .select("metres_used, fabric_lots(lot_code, colour_name, weave, cost_per_metre)")
      .eq("batch_id", id),
  ]);

  const rows = inventory.data ?? [];
  const e = econ.data;
  const style = one<{ style_code: string; name: string }>(batch.styles);

  const totals = rows.reduce(
    (a, r) => ({
      planned: a.planned + (r.units_planned ?? 0),
      produced: a.produced + (r.units_produced ?? 0),
      rejected: a.rejected + (r.units_rejected ?? 0),
      sold: a.sold + (r.units_sold ?? 0),
      onHand: a.onHand + (r.units_on_hand ?? 0),
    }),
    { planned: 0, produced: 0, rejected: 0, sold: 0, onHand: 0 },
  );

  return (
    <>
      <Link href="/batches" className="label hover:text-ink">
        ← Batches
      </Link>

      <div className="mt-8 grid gap-16 lg:grid-cols-[1fr_18rem]">
        <div>
          <PageHeader
            eyebrow={style?.style_code ?? "Batch"}
            title={batch.batch_code}
            lede={`${style?.name ?? ""} · ${
              one<{ name: string }>(batch.vendors)?.name ?? "no tailor set"
            }`}
          />

          {/* --- per-size production --- */}
          <section>
            <h2>Production by size</h2>
            <p className="measure mt-4 text-iron">
              Planned is what was cut for. Produced and rejected are what QC counted.
              Units sold come from orders and are not editable here.
            </p>

            <form action={recordProduction} className="mt-8">
              <input type="hidden" name="batch_id" value={batch.id} />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-bone">
                      {["Size", "Planned", "Produced", "Rejected", "Sold", "On hand"].map((h) => (
                        <th key={h} className="label py-4 pr-8 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8">
                          <Empty>
                            No sizes planned for this batch yet. Add them when creating
                            the batch.
                          </Empty>
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.size_code} className="border-b border-bone/50">
                          <td className="data py-4 pr-8">
                            {r.size_code}
                            <input type="hidden" name="size_code" value={r.size_code} />
                          </td>
                          <td className="py-4 pr-8">
                            <NumberInput
                              name={`planned_${r.size_code}`}
                              defaultValue={r.units_planned ?? 0}
                              min="0"
                              className="w-20"
                            />
                          </td>
                          <td className="py-4 pr-8">
                            <NumberInput
                              name={`produced_${r.size_code}`}
                              defaultValue={r.units_produced ?? 0}
                              min="0"
                              className="w-20"
                            />
                          </td>
                          <td className="py-4 pr-8">
                            <NumberInput
                              name={`rejected_${r.size_code}`}
                              defaultValue={r.units_rejected ?? 0}
                              min="0"
                              className="w-20"
                            />
                          </td>
                          <td className="data py-4 pr-8 text-iron">{r.units_sold ?? 0}</td>
                          <td className="data py-4 pr-8">
                            {r.units_on_hand ?? 0}
                            {r.units_in_repair ? (
                              <span className="ml-2 text-sm text-iron">
                                +{r.units_in_repair} repairing
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {rows.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td className="label py-4 pr-8">Total</td>
                        <td className="data py-4 pr-8">{totals.planned}</td>
                        <td className="data py-4 pr-8">{totals.produced}</td>
                        <td className="data py-4 pr-8">{totals.rejected}</td>
                        <td className="data py-4 pr-8">{totals.sold}</td>
                        <td className="data py-4 pr-8">{totals.onHand}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>

              {rows.length > 0 ? (
                <div className="mt-8">
                  <SubmitGhost>Save counts</SubmitGhost>
                </div>
              ) : null}
            </form>
          </section>

          {/* --- fabric --- */}
          <section className="mt-24">
            <h2>Fabric</h2>
            {usage.data && usage.data.length > 0 ? (
              <Table head={showMoney ? ["Lot", "Cloth", "Metres", "Cost"] : ["Lot", "Cloth", "Metres"]}>
                {usage.data.map((u, i) => {
                  const lot = one<{
                    lot_code: string;
                    colour_name: string;
                    weave: string;
                    cost_per_metre: string;
                  }>(u.fabric_lots);
                  return (
                    <Row key={i}>
                      <Cell mono>{lot?.lot_code}</Cell>
                      <Cell>
                        <span className="text-iron">
                          {[lot?.colour_name, lot?.weave].filter(Boolean).join(" ")}
                        </span>
                      </Cell>
                      <Cell mono>{u.metres_used}</Cell>
                      {showMoney ? (
                        <Cell mono>
                          <Money
                            amount={Number(u.metres_used) * Number(lot?.cost_per_metre ?? 0)}
                          />
                        </Cell>
                      ) : null}
                    </Row>
                  );
                })}
              </Table>
            ) : (
              <Empty>
                No fabric recorded against this batch, so its cost per unit counts no
                material at all.
              </Empty>
            )}
          </section>
        </div>

        {/* --- sidebar --- */}
        <aside className="flex flex-col gap-8 lg:border-l lg:border-bone lg:pl-8">
          <form action={updateBatch} className="flex flex-col gap-4">
            <input type="hidden" name="batch_id" value={batch.id} />
            <Field label="Status" htmlFor="status_code">
              <Select id="status_code" name="status_code" defaultValue={batch.status_code}>
                {(statuses.data ?? []).map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ready on" htmlFor="ready_on">
              <input
                id="ready_on"
                name="ready_on"
                type="date"
                defaultValue={batch.ready_on ?? ""}
                className="data w-full border-b border-bone bg-transparent pb-2
                           focus:border-indigo focus:outline-none"
              />
            </Field>
            <Field label="QC notes" htmlFor="qc_notes">
              <Textarea id="qc_notes" name="qc_notes" rows={4} defaultValue={batch.qc_notes ?? ""} />
            </Field>
            <div>
              <SubmitGhost>Update</SubmitGhost>
            </div>
          </form>

          {showMoney && e ? (
            <div className="border-t border-bone pt-8">
              <p className="label mb-4">Economics</p>
              <dl className="flex flex-col gap-2 text-sm">
                {[
                  ["Cost", <Money key="c" amount={e.total_cost} />],
                  ["Revenue", <Money key="r" amount={e.net_revenue} />],
                  ["Margin", <Money key="m" amount={e.gross_margin} />],
                  ["Cost/unit", <Money key="u" amount={e.cost_per_unit} />],
                  ["Return rate", <Code key="rr">{e.return_rate_pct ?? 0}%</Code>],
                  ["QC reject", <Code key="qc">{e.qc_reject_rate_pct ?? 0}%</Code>],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4">
                    <dt className="text-iron">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="border-t border-bone pt-8 text-sm text-iron">
            <p>Cut {batch.cut_on ?? "—"}</p>
            <p className="mt-2">Expected {batch.expected_ready_on ?? "—"}</p>
            <p className="mt-2">
              Tracked by {one<{ full_name: string }>(batch.profiles)?.full_name ?? "—"}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
