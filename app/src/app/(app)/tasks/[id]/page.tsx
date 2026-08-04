import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Code, Empty } from "@/components/ui";
import { one } from "@/lib/embed";

async function updateTask(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const patch: Record<string, unknown> = {};

  // Only fields actually present in the submitted form are touched, so the
  // sidebar's small forms cannot blank out each other's values.
  for (const key of ["status_code", "priority", "assignee_id", "due_on", "description", "type_code"]) {
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "");
    patch[key] =
      key === "priority" ? Number(raw) : raw === "" ? null : raw;
  }

  const supabase = await createClient();
  await supabase.from("tasks").update(patch).eq("id", id);
  revalidatePath(`/tasks/${id}`);
}

async function archiveTask(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id);
  redirect("/tasks");
}

async function addComment(formData: FormData) {
  "use server";
  const taskId = String(formData.get("task_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const parent = String(formData.get("parent_id") ?? "");

  await supabase.from("comments").insert({
    body,
    author_id: user?.id ?? null,
    // A reply carries only parent_id — the trigger copies the parent's entity
    // across, so a reply can never end up attached to a different task.
    ...(parent ? { parent_id: parent } : { task_id: taskId }),
  });

  revalidatePath(`/tasks/${taskId}`);
}

async function toggleResolved(formData: FormData) {
  "use server";
  const id = String(formData.get("comment_id"));
  const taskId = String(formData.get("task_id"));
  const resolved = String(formData.get("resolved")) === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase
    .from("comments")
    .update({
      resolved_at: resolved ? null : new Date().toISOString(),
      resolved_by: resolved ? null : (user?.id ?? null),
    })
    .eq("id", id);
  revalidatePath(`/tasks/${taskId}`);
}

type C = {
  id: string;
  body: string;
  parent_id: string | null;
  resolved_at: string | null;
  created_at: string;
  author: { full_name: string } | { full_name: string }[] | null;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtWhen(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TaskDetail(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("v_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!task) notFound();

  const [{ data: statuses }, { data: people }, { data: types }, commentsRes, { data: context }] =
    await Promise.all([
      supabase.from("task_statuses").select("code, label").order("sort_order"),
      supabase.from("profiles").select("id, full_name").is("archived_at", null),
      supabase.from("task_types").select("code, label").order("sort_order"),
      supabase
        .from("comments")
        .select(
          "id, body, author_id, parent_id, resolved_at, created_at," +
            // Disambiguated by constraint name: comments has two FKs to
            // profiles, and a bare profiles(...) embed fails the query.
            " author:profiles!comments_author_id_fkey(full_name)",
        )
        .eq("task_id", id)
        .is("archived_at", null)
        .order("created_at"),
      task.batch_id
        ? supabase
            .from("batches")
            .select("batch_code, styles(name)")
            .eq("id", task.batch_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Log it. A silent [] here looks identical to "no comments yet", which is
  // exactly how the ambiguous embed above went unnoticed.
  if (commentsRes.error) console.error("[michi] comments:", commentsRes.error.message);
  const all: C[] = (commentsRes.data as unknown as C[] | null) ?? [];
  const roots = all.filter((c) => !c.parent_id);
  const repliesOf = (parentId: string) => all.filter((c) => c.parent_id === parentId);

  return (
    <>
      <Link href="/tasks" className="label hover:text-ink">
        ← Tasks
      </Link>

      <div className="mt-8 grid gap-16 lg:grid-cols-[1fr_18rem]">
        {/* ---- main column ---- */}
        <div>
          <h1 className="measure">{task.title}</h1>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-iron">
            <span>{task.status_label}</span>
            <span className="text-bone">·</span>
            <Code>P{task.priority}</Code>
            {task.type_label ? (
              <>
                <span className="text-bone">·</span>
                <span>{task.type_label}</span>
              </>
            ) : null}
            {task.is_overdue ? (
              <>
                <span className="text-bone">·</span>
                <span className="text-madder">overdue</span>
              </>
            ) : null}
            {context ? (
              <>
                <span className="text-bone">·</span>
                <Code>{context.batch_code}</Code>
              </>
            ) : null}
          </div>

          <form action={updateTask} className="mt-16">
            <input type="hidden" name="id" value={task.id} />
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={task.description ?? ""}
              placeholder="What does done look like?"
              className="mt-4 w-full border border-bone bg-transparent p-4
                         focus:border-indigo focus:outline-none"
            />
            <button type="submit" className="label mt-4 hover:text-ink">
              Save description
            </button>
          </form>

          <section className="mt-24">
            <h2>Comments</h2>

            <form action={addComment} className="mt-8 flex flex-col gap-4">
              <input type="hidden" name="task_id" value={task.id} />
              <label htmlFor="new-comment" className="label">
                Add a comment
              </label>
              <textarea
                id="new-comment"
                name="body"
                rows={3}
                required
                placeholder="What happened, what changed, what is blocked…"
                className="w-full border border-bone bg-transparent p-4
                           focus:border-indigo focus:outline-none"
              />
              {/* The one Indigo element on this page. */}
              <button type="submit" className="self-start bg-indigo px-6 py-4 text-kora">
                Comment
              </button>
            </form>

            <div className="mt-16 flex flex-col gap-12">
              {roots.length === 0 ? (
                <Empty>No comments yet.</Empty>
              ) : (
                roots.map((c) => (
                  <Comment
                    key={c.id}
                    comment={c}
                    replies={repliesOf(c.id)}
                    taskId={task.id}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        {/* ---- sidebar ---- */}
        <aside className="flex flex-col gap-8 lg:border-l lg:border-bone lg:pl-8">
          <Field label="Status">
            <AutoForm taskId={task.id} name="status_code" value={task.status_code}>
              {(statuses ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </AutoForm>
          </Field>

          <Field label="Type">
            <AutoForm taskId={task.id} name="type_code" value={task.type_code ?? ""}>
              <option value="">—</option>
              {(types ?? []).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </AutoForm>
          </Field>

          <Field label="Assignee">
            <AutoForm taskId={task.id} name="assignee_id" value={task.assignee_id ?? ""}>
              <option value="">Unassigned</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </AutoForm>
          </Field>

          <Field label="Priority">
            <AutoForm taskId={task.id} name="priority" value={String(task.priority)}>
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p} {p === 1 ? "(highest)" : p === 5 ? "(lowest)" : ""}
                </option>
              ))}
            </AutoForm>
          </Field>

          <Field label="Due">
            <form action={updateTask} className="flex items-center gap-2">
              <input type="hidden" name="id" value={task.id} />
              <input
                type="date"
                name="due_on"
                defaultValue={task.due_on ?? ""}
                className="data w-full border-b border-bone bg-transparent pb-2
                           focus:border-indigo focus:outline-none"
              />
              <button type="submit" className="label hover:text-ink">
                Set
              </button>
            </form>
          </Field>

          <div className="mt-8 border-t border-bone pt-8 text-sm text-iron">
            <p>Created {fmtWhen(task.created_at)}</p>
            {task.created_by_name ? <p className="mt-2">by {task.created_by_name}</p> : null}
            {task.completed_at ? (
              <p className="mt-2">Completed {fmtWhen(task.completed_at)}</p>
            ) : null}
            <p className="mt-2">Due {fmtDate(task.due_on)}</p>
          </div>

          <form action={archiveTask} className="border-t border-bone pt-8">
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" className="label hover:text-madder">
              Bin this task
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {children}
    </div>
  );
}

/** A select that submits on change, so there is no per-field Save button. */
function AutoForm({
  taskId,
  name,
  value,
  children,
}: {
  taskId: string;
  name: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <form action={updateTask}>
      <input type="hidden" name="id" value={taskId} />
      <select
        name={name}
        defaultValue={value}
        className="w-full border-b border-bone bg-transparent pb-2
                   focus:border-indigo focus:outline-none"
      >
        {children}
      </select>
      <button type="submit" className="label mt-2 hover:text-ink">
        Update
      </button>
    </form>
  );
}

function Comment({
  comment,
  replies,
  taskId,
}: {
  comment: C;
  replies: C[];
  taskId: string;
}) {
  const author = one<{ full_name: string }>(comment.author)?.full_name ?? "Someone";
  const resolved = Boolean(comment.resolved_at);

  return (
    <article className={resolved ? "opacity-60" : undefined}>
      <div className="flex flex-wrap items-baseline gap-4">
        <span>{author}</span>
        <span className="data text-sm text-iron">{fmtWhen(comment.created_at)}</span>
        {resolved ? <span className="label">resolved</span> : null}
      </div>

      <p className="measure mt-4 whitespace-pre-wrap">{comment.body}</p>

      <div className="mt-4 flex gap-6">
        <form action={toggleResolved}>
          <input type="hidden" name="comment_id" value={comment.id} />
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="resolved" value={String(resolved)} />
          <button type="submit" className="label hover:text-ink">
            {resolved ? "Reopen" : "Resolve"}
          </button>
        </form>
      </div>

      {replies.length > 0 ? (
        <div className="mt-8 flex flex-col gap-8 border-l border-bone pl-8">
          {replies.map((r) => {
            const rAuthor =
              one<{ full_name: string }>(r.author)?.full_name ?? "Someone";
            return (
              <div key={r.id}>
                <div className="flex flex-wrap items-baseline gap-4">
                  <span>{rAuthor}</span>
                  <span className="data text-sm text-iron">{fmtWhen(r.created_at)}</span>
                </div>
                <p className="measure mt-2 whitespace-pre-wrap">{r.body}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      <form action={addComment} className="mt-6 border-l border-bone pl-8">
        <input type="hidden" name="task_id" value={taskId} />
        <input type="hidden" name="parent_id" value={comment.id} />
        <input
          name="body"
          aria-label="Reply to this comment"
          placeholder="Reply…"
          className="w-full border-b border-bone bg-transparent pb-2
                     focus:border-indigo focus:outline-none"
        />
      </form>
    </article>
  );
}
