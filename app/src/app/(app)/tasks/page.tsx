import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Table, Row, Cell, Empty } from "@/components/ui";

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

async function closeTask(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  // completed_at is set by trigger from the status's is_open flag.
  await supabase.from("tasks").update({ status_code: "done" }).eq("id", id);
  revalidatePath("/tasks");
}

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("v_open_tasks")
    .select("*")
    .order("priority")
    .order("due_on", { nullsFirst: false });

  return (
    <>
      <PageHeader
        eyebrow="Tasks"
        title="Open work"
        lede="Closed tasks are archived, never deleted — the schema has no DELETE path at all."
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
        <Table head={["Task", "Assignee", "Due", "Priority", ""]}>
          {tasks.map((t) => (
            <Row key={t.id}>
              <Cell>{t.title}</Cell>
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
              <Cell>
                <form action={closeTask}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="label hover:text-ink">
                    Done
                  </button>
                </form>
              </Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty>Nothing open. Add the first task above.</Empty>
      )}
    </>
  );
}
