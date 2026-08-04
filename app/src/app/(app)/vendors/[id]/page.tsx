import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Empty, Code } from "@/components/ui";
import { Field, Input, Select, Textarea, SubmitGhost } from "@/components/form";
import { one } from "@/lib/embed";

async function addTask(formData: FormData) {
  "use server";
  const vendorId = String(formData.get("vendor_id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dueOn = String(formData.get("due_on") ?? "").trim() || null;
  const assignee = String(formData.get("assignee_id") ?? "").trim() || null;

  const { error } = await supabase.from("tasks").insert({
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    vendor_id: vendorId,
    due_on: dueOn,
    assignee_id: assignee,
    created_by: user?.id ?? null,
  });
  if (error) console.error("[michi] add task:", error.message);
  revalidatePath(`/vendors/${vendorId}`);
}

export default async function VendorDetail(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*, vendor_types(label)")
    .eq("id", id)
    .maybeSingle();

  if (!vendor) notFound();

  const [tasksRes, peopleRes] = await Promise.all([
    supabase
      .from("v_tasks")
      .select("*")
      .eq("vendor_id", id)
      .order("is_open", { ascending: false })
      .order("due_on", { ascending: true, nullsFirst: false }),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
  ]);

  const tasks = tasksRes.data ?? [];

  return (
    <>
      <Link href="/vendors" className="label hover:text-ink">
        ← Vendors
      </Link>

      <div className="mt-8 grid gap-16 lg:grid-cols-[1fr_18rem]">
        <div>
          <PageHeader
            eyebrow={one<{ label: string }>(vendor.vendor_types)?.label ?? "Vendor"}
            title={vendor.name}
            lede={vendor.cluster ?? undefined}
          />

          {/* ---- tasks ---- */}
          <section>
            <h2>Tasks</h2>
            <p className="measure mt-4 text-iron">
              What this vendor is doing for us right now, and what&rsquo;s next.
            </p>

            <div className="mt-8 flex flex-col gap-8">
              {tasks.length === 0 ? (
                <Empty>No tasks tied to this vendor yet.</Empty>
              ) : (
                tasks.map((t) => (
                  <article key={t.id} className="border-l-2 border-bone pl-6">
                    <p className="flex flex-wrap items-baseline gap-4">
                      <Link href={`/tasks/${t.id}`} className="hover:text-indigo">
                        {t.title}
                      </Link>
                      <span
                        className={
                          t.is_overdue ? "label text-madder" : "label text-iron"
                        }
                      >
                        {t.status_label}
                      </span>
                      {t.due_on ? (
                        <span className="data text-sm text-iron">due {t.due_on}</span>
                      ) : null}
                    </p>
                    {t.description ? (
                      <p className="measure mt-2 text-iron">{t.description}</p>
                    ) : null}
                    {t.assignee_name ? (
                      <p className="mt-2 text-sm text-iron">{t.assignee_name}</p>
                    ) : null}
                  </article>
                ))
              )}
            </div>

            <form action={addTask} className="mt-16 flex flex-col gap-4 max-w-xl">
              <input type="hidden" name="vendor_id" value={vendor.id} />
              <Field label="New task" htmlFor="title">
                <Input id="title" name="title" required placeholder="Chase dye lot consistency" />
              </Field>
              <Field label="Details" htmlFor="description">
                <Textarea id="description" name="description" rows={3} />
              </Field>
              <div className="flex gap-8">
                <Field label="Due" htmlFor="due_on">
                  <Input id="due_on" name="due_on" type="date" />
                </Field>
                <Field label="Assignee" htmlFor="assignee_id">
                  <Select id="assignee_id" name="assignee_id">
                    <option value="">—</option>
                    {(peopleRes.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div>
                <SubmitGhost>Add task</SubmitGhost>
              </div>
            </form>
          </section>
        </div>

        {/* ---- sidebar: contact details ---- */}
        <aside className="flex flex-col gap-3 text-sm lg:border-l lg:border-bone lg:pl-8">
          <p className="label mb-2">Contact</p>
          <p>{vendor.contact_name ?? "—"}</p>
          <p className="text-iron">{vendor.contact_phone ?? "—"}</p>
          <p className="text-iron">{vendor.contact_email ?? "—"}</p>
          {vendor.address ? (
            <p className="mt-2 whitespace-pre-wrap text-iron">{vendor.address}</p>
          ) : null}

          <p className="label mb-2 mt-8">Terms</p>
          <p className="text-iron">
            {vendor.payment_terms_days ? `${vendor.payment_terms_days}d` : "—"}
            {vendor.payment_terms_note ? ` · ${vendor.payment_terms_note}` : ""}
          </p>
          <p className="text-iron">
            Lead time: {vendor.lead_time_days ? `${vendor.lead_time_days}d` : "—"}
          </p>
          {vendor.gstin ? (
            <p className="mt-2">
              <Code>{vendor.gstin}</Code>
            </p>
          ) : null}

          {vendor.notes ? (
            <>
              <p className="label mb-2 mt-8">Notes</p>
              <p className="whitespace-pre-wrap text-iron">{vendor.notes}</p>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
