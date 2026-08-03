import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Empty, Code } from "@/components/ui";

const STAGES = [
  { code: "draft", label: "Draft" },
  { code: "in_review", label: "In review" },
  { code: "changes_requested", label: "Changes requested" },
  { code: "approved", label: "Approved" },
  { code: "scheduled", label: "Scheduled" },
  { code: "published", label: "Published" },
];

export default async function ContentPage() {
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("v_content")
    .select("*")
    .order("status_sort")
    .order("updated_at", { ascending: false });

  if (error) console.error("[michi] content:", error.message);
  const all = items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-8">
        <PageHeader
          eyebrow="Editorial"
          title="Content"
          lede="Approval is of a version, not of an item. Edit after sign-off and the item drops back to draft — what ships is always text somebody actually read."
        />
        <Link href="/content/new" className="bg-indigo px-6 py-4 text-kora hover:opacity-90">
          New content
        </Link>
      </div>

      {all.length === 0 ? (
        <Empty>Nothing written yet.</Empty>
      ) : (
        <div className="flex flex-col gap-24">
          {STAGES.map((stage) => {
            const rows = all.filter((c) => c.status_code === stage.code);
            if (rows.length === 0) return null;

            return (
              <section key={stage.code}>
                <div className="flex items-baseline gap-4 border-b border-bone pb-4">
                  <h2>{stage.label}</h2>
                  <span className="data text-iron">{rows.length}</span>
                </div>

                <div className="mt-8 flex flex-col gap-8">
                  {rows.map((c) => (
                    <Link
                      key={c.id}
                      href={`/content/${c.id}`}
                      className="group flex flex-wrap items-baseline justify-between gap-4
                                 border-b border-bone/50 pb-6"
                    >
                      <div className="min-w-64 flex-1">
                        <p className="group-hover:text-indigo">{c.title}</p>
                        <p className="mt-2 text-sm text-iron">
                          {c.type_label}
                          {c.author_name ? ` · ${c.author_name}` : ""}
                          {c.batch_code ? ` · ${c.batch_code}` : ""}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-6">
                        {/* The one thing worth shouting about on this screen. */}
                        {c.approval_is_stale ? (
                          <span className="text-sm text-madder">
                            approved v{c.approved_version}, now v{c.current_version}
                          </span>
                        ) : null}
                        <Code>v{c.current_version}</Code>
                        <span className="data text-sm text-iron">
                          {c.review_count} {c.review_count === 1 ? "review" : "reviews"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
