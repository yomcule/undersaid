import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Money, Empty, Code } from "@/components/ui";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";
import { textField, numberField } from "@/lib/form-data";
import { one } from "@/lib/embed";
import { getRole } from "@/lib/role";

async function addContract(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  const typeCode = String(formData.get("type_code") ?? "");
  if (!title || !typeCode) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);
  const vendorId = text("vendor_id");
  const counterparty = text("counterparty_name");
  // The database enforces this too, but failing here means an error message
  // instead of a silent no-op insert.
  if (!vendorId && !counterparty) return;

  const supabase = await createClient();
  const { error } = await supabase.from("contracts").insert({
    title,
    type_code: typeCode,
    status_code: String(formData.get("status_code") ?? "draft"),
    vendor_id: vendorId,
    counterparty_name: vendorId ? null : counterparty,
    effective_on: text("effective_on"),
    expires_on: text("expires_on"),
    notice_period_days: num("notice_period_days"),
    auto_renews: formData.get("auto_renews") === "on",
    value_amount: num("value_amount"),
    notes: text("notes"),
  });
  if (error) console.error("[michi] add contract:", error.message);
  revalidatePath("/contracts");
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function daysUntil(d: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default async function ContractsPage() {
  const supabase = await createClient();
  const role = await getRole();

  // Contracts are financially gated, so a contributor gets zero rows rather
  // than an error. The empty state below says so plainly.
  const { data: contracts } = await supabase
    .from("contracts")
    .select(
      `id, title, counterparty_name, effective_on, expires_on, notice_period_days,
       auto_renews, value_amount, currency_code,
       contract_types(label), contract_statuses(label, is_active),
       vendors(name)`,
    )
    .is("archived_at", null)
    .order("expires_on", { nullsFirst: false });

  const rows = contracts ?? [];

  const [{ data: vendors }, { data: types }, { data: statuses }] = await Promise.all([
    supabase.from("vendors").select("id, name").is("archived_at", null).order("name"),
    supabase.from("contract_types").select("code, label").order("sort_order"),
    supabase.from("contract_statuses").select("code, label").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Agreements"
        title="Contracts"
        lede="Notice periods are the thing that bites. A contract that auto-renews needs a decision before its notice window closes, not before it expires."
      />

      {rows.length === 0 ? (
        <Empty>
          Nothing to show. If you expected contracts here, your role may not
          include financial access.
        </Empty>
      ) : (
        <Table
          head={["Contract", "Counterparty", "Type", "Expires", "Notice", "Value", "Status"]}
        >
          {rows.map((c) => {
            const left = daysUntil(c.expires_on);
            // The deadline that matters is expiry minus the notice period.
            const noticeLeft =
              left === null ? null : left - (c.notice_period_days ?? 0);
            const urgent = noticeLeft !== null && noticeLeft <= 30;

            return (
              <Row key={c.id}>
                <Cell>{c.title}</Cell>
                <Cell>
                  <span className="text-iron">
                    {one<{ name: string }>(c.vendors)?.name ??
                      c.counterparty_name ??
                      "—"}
                  </span>
                </Cell>
                <Cell>{one<{ label: string }>(c.contract_types)?.label ?? "—"}</Cell>
                <Cell mono>
                  <span className={urgent ? "text-madder" : undefined}>
                    {fmt(c.expires_on)}
                  </span>
                </Cell>
                <Cell>
                  {c.notice_period_days ? (
                    <span className={urgent ? "text-madder" : "text-iron"}>
                      <Code>{c.notice_period_days}d</Code>
                      {noticeLeft !== null ? (
                        <span className="ml-2 text-sm">
                          {noticeLeft <= 0
                            ? "window closed"
                            : `decide in ${noticeLeft}d`}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-iron">—</span>
                  )}
                </Cell>
                <Cell mono>
                  <Money amount={c.value_amount} currency={c.currency_code ?? "INR"} />
                </Cell>
                <Cell>
                  {one<{ label: string }>(c.contract_statuses)?.label ?? "—"}
                  {c.auto_renews ? (
                    <span className="ml-2 text-sm text-iron">auto-renews</span>
                  ) : null}
                </Cell>
              </Row>
            );
          })}
        </Table>
      )}

      {role?.canSeeFinancials ? (
        <section className="mt-24 border-t border-bone pt-16">
          <h2>New contract</h2>
          <form action={addContract} className="mt-8 max-w-3xl">
            <FormGrid>
              <Field label="Title" htmlFor="title">
                <Input id="title" name="title" required autoFocus />
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

              <Field
                label="Vendor"
                htmlFor="vendor_id"
                hint="Pick a vendor, or leave blank and name a counterparty below."
              >
                <Select id="vendor_id" name="vendor_id">
                  <option value="">—</option>
                  {(vendors ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Counterparty name" htmlFor="counterparty_name" hint="If not a vendor.">
                <Input id="counterparty_name" name="counterparty_name" />
              </Field>

              <Field label="Status" htmlFor="status_code">
                <Select id="status_code" name="status_code" defaultValue="draft">
                  {(statuses ?? []).map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Value" htmlFor="value_amount" hint="Tax-exclusive.">
                <NumberInput id="value_amount" name="value_amount" step="1" min="0" />
              </Field>

              <Field label="Effective on" htmlFor="effective_on">
                <Input id="effective_on" name="effective_on" type="date" />
              </Field>
              <Field label="Expires on" htmlFor="expires_on">
                <Input id="expires_on" name="expires_on" type="date" />
              </Field>

              <Field
                label="Notice period (days)"
                htmlFor="notice_period_days"
                hint="How far before expiry a decision is due."
              >
                <NumberInput id="notice_period_days" name="notice_period_days" min="0" />
              </Field>
              <Field label="Auto-renews" htmlFor="auto_renews">
                <label className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="auto_renews" name="auto_renews" className="accent-indigo" />
                  <span className="text-iron">Renews automatically unless cancelled</span>
                </label>
              </Field>

              <Field label="Notes" htmlFor="notes" span={2}>
                <Textarea id="notes" name="notes" rows={3} />
              </Field>
            </FormGrid>

            <Submit>Add contract</Submit>
          </form>
        </section>
      ) : null}
    </>
  );
}
