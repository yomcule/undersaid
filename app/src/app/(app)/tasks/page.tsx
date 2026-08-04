import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Table, Empty, type Column } from "@/components/ui";
import { TaskFilters } from "@/components/task-filters";
import { TaskRow } from "@/components/task-row";

async function createTask(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const due = String(formData.get("due_on") ?? "");
  const assignee = String(formData.get("assignee_id") ?? "");
  const type = String(formData.get("type_code") ?? "");
  await supabase.from("tasks").insert({
    title,
    due_on: due || null,
    assignee_id: assignee || null,
    type_code: type || null,
    priority: Number(formData.get("priority") ?? 3),
    created_by: user?.id ?? null,
  });

  revalidatePath("/tasks");
}

async function archiveTask(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/tasks");
}

async function updateTask(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({
      title,
      type_code: String(formData.get("type_code") ?? "") || null,
      status_code: String(formData.get("status_code") ?? ""),
      assignee_id: String(formData.get("assignee_id") ?? "") || null,
      due_on: String(formData.get("due_on") ?? "") || null,
      priority: Number(formData.get("priority") ?? 3),
    })
    .eq("id", id);
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
  if (sp.type) query = query.eq("type_code", sp.type);

  const { data: tasks, error } = await query
    .order(sort, { ascending: dir === "asc", nullsFirst: false })
    // A stable tiebreak, so equal priorities do not shuffle between loads.
    .order("due_on", { ascending: true, nullsFirst: false });

  if (error) console.error("[michi] tasks:", error.message);

  const [{ data: statuses }, { data: people }, { data: types }] = await Promise.all([
    supabase.from("task_statuses").select("code, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
    supabase.from("task_types").select("code, label").order("sort_order"),
  ]);

  const head: Column[] = [
    { label: "Task", column: "title" },
    { label: "Type", column: "type_code" },
    { label: "Status", column: "status_sort" },
    { label: "Assignee", column: "assignee_name" },
    { label: "Due", column: "due_on" },
    { label: "Priority", column: "priority" },
    "",
  ];

  const carry = {
    status: sp.status,
    assignee: sp.assignee,
    priority: sp.priority,
    type: sp.type,
  };

  return (
    <>
      <PageHeader eyebrow="Tasks" title="Work" />

      <TaskFilters
        statuses={(statuses ?? []).map((s) => ({ value: s.code, label: s.label }))}
        assignees={(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
        types={(types ?? []).map((t) => ({ value: t.code, label: t.label }))}
      />

      <form
        action={createTask}
        className="mb-12 flex flex-wrap items-end gap-4 border-b border-bone pb-6"
      >
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <label htmlFor="title" className="label">
            New task
          </label>
          <input
            id="title"
            name="title"
            required
            className="border border-bone bg-transparent px-4 py-3
                       focus:border-indigo focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="type_code" className="label">
            Type
          </label>
          <select
            id="type_code"
            name="type_code"
            defaultValue=""
            className="data border border-bone bg-transparent px-4 py-3
                       focus:border-indigo focus:outline-none"
          >
            <option value="">—</option>
            {(types ?? []).map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="assignee_id" className="label">
            Assignee
          </label>
          <select
            id="assignee_id"
            name="assignee_id"
            defaultValue=""
            className="border border-bone bg-transparent px-4 py-3
                       focus:border-indigo focus:outline-none"
          >
            <option value="">—</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="due_on" className="label">
            Due
          </label>
          <input
            id="due_on"
            name="due_on"
            type="date"
            className="data border border-bone bg-transparent px-4 py-3
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
            className="data border border-bone bg-transparent px-4 py-3
                       focus:border-indigo focus:outline-none"
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-indigo px-6 py-3 text-kora">
          Add
        </button>
      </form>

      {tasks && tasks.length > 0 ? (
        <Table head={head} sort={sort} dir={dir} params={carry}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              statuses={statuses ?? []}
              types={types ?? []}
              people={people ?? []}
              updateTask={updateTask}
              archiveTask={archiveTask}
            />
          ))}
        </Table>
      ) : (
        <Empty>Nothing matches these filters.</Empty>
      )}
    </>
  );
}
