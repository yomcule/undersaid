import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Stat, Empty, Code } from "@/components/ui";
import { one } from "@/lib/embed";

export default async function Overview() {
  const supabase = await createClient();

  // Each of these silently returns nothing rather than erroring when the
  // caller lacks the role for it — that is RLS doing its job, not a bug.
  const [tasks, batches, renewals, payables] = await Promise.all([
    supabase.from("v_open_tasks").select("*").order("due_on", { nullsFirst: false }),
    supabase
      .from("batches")
      .select("id, batch_code, status_code, batch_statuses(label, is_open)")
      .is("archived_at", null),
    supabase.from("v_contract_renewals").select("*").order("expires_on"),
    supabase.from("v_vendor_payables").select("*").order("due_on"),
  ]);

  const openTasks = tasks.data ?? [];
  const overdue = openTasks.filter((t) => t.is_overdue).length;
  const openBatches = (batches.data ?? []).filter(
    (b) => one<{ is_open: boolean }>(b.batch_statuses)?.is_open,
  ).length;
  const outstanding = (payables.data ?? []).reduce(
    (sum, p) => sum + Number(p.outstanding_amount ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Today"
        lede="What needs attention, in the order it will bite."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open tasks"
          value={String(openTasks.length)}
          hint={overdue ? `${overdue} overdue` : "none overdue"}
        />
        <Stat label="Batches in flight" value={String(openBatches)} />
        <Stat
          label="Contracts expiring"
          value={String(renewals.data?.length ?? 0)}
          hint="next 120 days"
        />
        {payables.data ? (
          <Stat
            label="Payable"
            value={new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(outstanding)}
            hint={`${payables.data.length} open bills`}
          />
        ) : null}
      </div>

      <section className="mt-24">
        <h2>Due next</h2>
        <div className="mt-8 flex flex-col gap-4">
          {openTasks.slice(0, 6).map((t) => (
            <Link
              key={t.id}
              href="/tasks"
              className="flex items-baseline justify-between border-b border-bone pb-4"
            >
              <span>{t.title}</span>
              <Code>
                {t.due_on
                  ? new Date(t.due_on).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })
                  : "—"}
              </Code>
            </Link>
          ))}
          {openTasks.length === 0 ? <Empty>Nothing open.</Empty> : null}
        </div>
      </section>
    </>
  );
}
