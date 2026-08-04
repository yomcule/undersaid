import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Empty, Money, Code } from "@/components/ui";

async function advance(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const supabase = await createClient();
  // resolved_on is stamped by trigger from the status's is_open flag.
  await supabase.from("return_items").update({ status_code: status }).eq("id", id);
  revalidatePath("/returns");
}

async function saveRepair(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const vendor = String(formData.get("repair_vendor_id") ?? "");
  const cost = String(formData.get("repair_cost") ?? "");
  const supabase = await createClient();
  await supabase
    .from("return_items")
    .update({
      repair_vendor_id: vendor || null,
      repair_cost: cost ? Number(cost) : null,
      repair_notes: String(formData.get("repair_notes") ?? "") || null,
    })
    .eq("id", id);
  revalidatePath("/returns");
}

export default async function ReturnsPage(props: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await props.searchParams;
  const supabase = await createClient();

  let query = supabase.from("v_returns").select("*");
  if (show !== "all") query = query.eq("is_open", true);

  const [{ data: returns }, { data: statuses }, { data: tailors }] = await Promise.all([
    // Oldest first: the queue is a queue.
    query.order("returned_on", { ascending: true }),
    supabase.from("return_statuses").select("code, label, is_open").order("sort_order"),
    supabase
      .from("vendors")
      .select("id, name")
      .in("type_code", ["tailor", "other"])
      .is("archived_at", null),
  ]);

  const rows = returns ?? [];
  const open = rows.filter((r) => r.is_open).length;
  const inRepair = rows.filter((r) => r.status_code === "repairing").length;
  const defects = rows.filter((r) => r.is_defect).length;

  return (
    <>
      <PageHeader
        eyebrow="Aftercare"
        title="Returns & repairs"
        lede="A garment away at the tailor is not stock. Only a return marked Restocked counts towards inventory again."
      />

      <div className="mb-16 flex flex-wrap gap-12 border-b border-bone pb-8">
        <Figure label="Open" value={String(open)} />
        <Figure label="In repair" value={String(inRepair)} />
        <Figure label="Genuine defects" value={`${defects} of ${rows.length}`} />
        <div className="ml-auto flex items-end gap-4">
          <a
            href="/returns"
            className={`label ${show !== "all" ? "text-ink" : "hover:text-ink"}`}
          >
            Open
          </a>
          <a
            href="/returns?show=all"
            className={`label ${show === "all" ? "text-ink" : "hover:text-ink"}`}
          >
            All
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>Nothing in the queue.</Empty>
      ) : (
        <div className="flex flex-col gap-12">
          {rows.map((r) => (
            <article key={r.id} className="border-b border-bone pb-12">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <h3 className="text-lg">
                    {r.style_name}{" "}
                    <Code>
                      {r.batch_code} · {r.size_code}
                    </Code>
                  </h3>
                  <p className="mt-2 text-iron">
                    {r.reason_label}
                    {!r.is_defect ? (
                      <span className="ml-2 text-sm">
                        — not a defect, excluded from defect rate
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="label">{r.status_label}</p>
                  <p className="data mt-2 text-sm text-iron">
                    {r.order_ref} · {r.days_open}d open
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-end gap-8">
                {/* Move it along. Each status is a button, so the whole
                    workflow is visible rather than hidden in a dropdown. */}
                <form action={advance} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <span className="label mr-2 pb-1">Move to</span>
                  {(statuses ?? [])
                    .filter((s) => s.code !== r.status_code)
                    .map((s) => (
                      <button
                        key={s.code}
                        name="status"
                        value={s.code}
                        type="submit"
                        className="border border-bone px-3 py-1 text-sm
                                   transition-colors hover:border-indigo hover:text-indigo"
                      >
                        {s.label}
                      </button>
                    ))}
                </form>
              </div>

              {r.is_open ? (
                <form action={saveRepair} className="mt-8 flex flex-wrap items-end gap-6">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="flex flex-col gap-2">
                    <span className="label">Repair by</span>
                    <select
                      name="repair_vendor_id"
                      defaultValue={r.repair_vendor_id ?? ""}
                      className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
                    >
                      <option value="">—</option>
                      {(tailors ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="label">Repair cost</span>
                    <input
                      name="repair_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={r.repair_cost ?? ""}
                      className="data w-32 border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
                    />
                  </label>
                  <label className="flex min-w-64 flex-1 flex-col gap-2">
                    <span className="label">Notes</span>
                    <input
                      name="repair_notes"
                      defaultValue={r.repair_notes ?? ""}
                      className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
                    />
                  </label>
                  <button type="submit" className="label pb-2 hover:text-ink">
                    Save
                  </button>
                </form>
              ) : (
                <p className="mt-8 text-sm text-iron">
                  Resolved {r.resolved_on}
                  {r.refund_amount ? (
                    <>
                      {" · refunded "}
                      <Money amount={r.refund_amount} />
                    </>
                  ) : null}
                  {r.repair_cost ? (
                    <>
                      {" · repair "}
                      <Money amount={r.repair_cost} />
                    </>
                  ) : null}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="data mt-2 text-2xl">{value}</p>
    </div>
  );
}
