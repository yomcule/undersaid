import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Table, Row, Cell, Empty, type Column } from "@/components/ui";
import { TaskFilters } from "@/components/task-filters";

async function createTask(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const due = String(formData.get("due_on") ?? "");
  await supabase.from("tasks").insert({
    title,
    due_on: due || null,
    priority: Number(formData.get("priority") ?? 3),
    created_by: user?.id ?? null,
  });

  revalidatePath("/tasks");
}

// Only these are sortable, so a hand-edited ?sort= cannot reach an arbitrary
// column. PostgREST would reject an unknown name anyway; an allowlist keeps
// the failure in our code rather than as a 400 from the database.
const SORTABLE = new Set([
  "title",
  "status_sort",
  "assignee_name",
  "due_on",
  "priority",
]);

export default async function TasksPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await props.searchParams;
  const sort = sp.sort && SORTABLE.has(sp.sort) ? sp.sort : "priority";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  let query = supabase.from("v_tasks").select("*");

  // Default view is open work. "all" lifts the filter; anything else is a
  // specific status code.
  const status = sp.status ?? "open";
  if (status === "open") query = query.eq("is_open", true);
  else if (status !== "all") query = query.eq("status_code", status);

  if (sp.assignee === "none") query = query.is("assignee_id", null);
  else if (sp.assignee) query = query.eq("assignee_id", sp.assignee);

  if (sp.priority) query = query.eq("priority", Number(sp.priority));

  const { data: tasks, error } = await query
    .order(sort, { ascending: dir === "asc", nullsFirst: false })
    // A stable tiebreak, so equal priorities do not shuffle between loads.
    .order("due_on", { ascending: true, nullsFirst: false });

  if (error) console.error("[michi] tasks:", error.message);

  const [{ data: statuses }, { data: people }] = await Promise.all([
    supabase.from("task_statuses").select("code, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
  ]);

  const head: Column[] = [
    { label: "Task", column: "title" },
    { label: "Status", column: "status_sort" },
    { label: "Assignee", column: "assignee_name" },
    { label: "Due", column: "due_on" },
    { label: "Priority", column: "priority" },
  ];

  const carry = {
    status: sp.status,
    assignee: sp.assignee,
    priority: sp.priority,
  };

  return (
    <>
      <PageHeader
        eyebrow="Tasks"
        title="Work"
        lede="Closed tasks are archived, never deleted — the schema has no DELETE path at all."
      />

      <TaskFilters
        statuses={(statuses ?? []).map((s) => ({ value: s.code, label: s.label }))}
        assignees={(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
      />

      <form
        action={createTask}
        className="mb-16 flex flex-wrap items-end gap-4 border-b border-bone pb-8"
      >
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <label htmlFor="title" className="label">
            New task
          </label>
          <input
            id="title"
            name="title"
            required
            className="border border-bone bg-transparent px-4 py-4
                       focus:border-indigo focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="due_on" className="label">
            Due
          </label>
          <input
            id="due_on"
            name="due_on"
            type="date"
            className="data border border-bone bg-transparent px-4 py-4
                       focus:border-indigo focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="priority" className="label">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="3"
            className="data border border-bone bg-transparent px-4 py-4
                       focus:border-indigo focus:outline-none"
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-indigo px-6 py-4 text-kora">
          Add
        </button>
      </form>

      {tasks && tasks.length > 0 ? (
        <Table head={head} sort={sort} dir={dir} params={carry}>
          {tasks.map((t) => (
            <Row key={t.id}>
              <Cell>
                <Link href={`/tasks/${t.id}`} className="hover:text-indigo">
                  {t.title}
                </Link>
              </Cell>
              <Cell>
                <span className={t.is_open ? undefined : "text-iron"}>
                  {t.status_label}
                </span>
              </Cell>
              <Cell>
                <span className="text-iron">{t.assignee_name ?? "—"}</span>
              </Cell>
              <Cell mono>
                <span className={t.is_overdue ? "text-madder" : undefined}>
                  {t.due_on
                    ? new Date(t.due_on).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })
                    : "—"}
                </span>
              </Cell>
              <Cell mono>{t.priority}</Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty>Nothing matches these filters.</Empty>
      )}
    </>
  );
}
