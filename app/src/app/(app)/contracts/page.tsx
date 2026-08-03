import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Money, Empty, Code } from "@/components/ui";
import { one } from "@/lib/embed";

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
    </>
  );
}
