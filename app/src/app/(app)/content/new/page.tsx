import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Field, Input, Select, Textarea, Submit, FormGrid } from "@/components/form";

async function createContent(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  const typeCode = String(formData.get("type_code") ?? "");
  if (!title || !typeCode) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emptyToNull = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      title,
      type_code: typeCode,
      channel_code: emptyToNull("channel_code"),
      author_id: user?.id ?? null,
      reviewer_id: emptyToNull("reviewer_id"),
      batch_id: emptyToNull("batch_id"),
      style_id: emptyToNull("style_id"),
    })
    .select("id")
    .single();

  if (error || !item) {
    console.error("[michi] create content:", error?.message);
    return;
  }

  // A content item with no version is a title and nothing else, so the first
  // draft is written here rather than as a separate step. current_version
  // starts at 0 and the trigger takes it to 1.
  const body = String(formData.get("body") ?? "").trim();
  if (body) {
    await supabase.from("content_versions").insert({
      content_id: item.id,
      body,
      created_by: user?.id ?? null,
    });
  }

  redirect(`/content/${item.id}`);
}

export default async function NewContentPage() {
  const supabase = await createClient();

  const [types, channels, people, batches, styles] = await Promise.all([
    supabase.from("content_types").select("code, label").order("sort_order"),
    supabase.from("sales_channels").select("code, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
    supabase
      .from("batches")
      .select("id, batch_code")
      .is("archived_at", null)
      .order("batch_code"),
    supabase
      .from("styles")
      .select("id, style_code, name")
      .is("archived_at", null)
      .order("style_code"),
  ]);

  return (
    <>
      <Link href="/content" className="label hover:text-ink">
        ← Content
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Editorial"
          title="New content"
          lede="Write the first draft here. Everything after this is versions and reviews — the text itself is never edited in place."
        />
      </div>

      <form action={createContent} className="max-w-3xl">
        <FormGrid>
          <Field label="Title" htmlFor="title" span={2}>
            <Input id="title" name="title" required autoFocus />
          </Field>

          <Field label="Type" htmlFor="type_code">
            <Select id="type_code" name="type_code" required>
              {(types.data ?? []).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Channel" htmlFor="channel_code" hint="Where it goes out.">
            <Select id="channel_code" name="channel_code">
              <option value="">—</option>
              {(channels.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reviewer" htmlFor="reviewer_id" hint="Who should read it.">
            <Select id="reviewer_id" name="reviewer_id">
              <option value="">—</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Batch" htmlFor="batch_id" hint="If it is about one run.">
            <Select id="batch_id" name="batch_id">
              <option value="">—</option>
              {(batches.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Style" htmlFor="style_id">
            <Select id="style_id" name="style_id">
              <option value="">—</option>
              {(styles.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.style_code} — {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="First draft" htmlFor="body" span={2}>
            <Textarea id="body" name="body" rows={10} />
          </Field>
        </FormGrid>

        <Submit>Create draft</Submit>
      </form>
    </>
  );
}
