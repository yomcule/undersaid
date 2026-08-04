import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Code, Empty } from "@/components/ui";
import { Field, Select } from "@/components/form";
import { WordCountTextarea } from "@/components/word-count-textarea";
import { textField } from "@/lib/form-data";
import { one } from "@/lib/embed";

async function updateFields(formData: FormData) {
  "use server";
  const id = String(formData.get("content_id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const text = (k: string) => textField(formData, k);

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_items")
    .update({
      title,
      type_code: String(formData.get("type_code") ?? ""),
      channel_code: text("channel_code"),
      reviewer_id: text("reviewer_id"),
      batch_id: text("batch_id"),
      style_id: text("style_id"),
    })
    .eq("id", id);
  if (error) console.error("[michi] update content fields:", error.message);
  revalidatePath(`/content/${id}`);
}

async function archiveContent(formData: FormData) {
  "use server";
  const id = String(formData.get("content_id"));
  const supabase = await createClient();
  await supabase
    .from("content_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  redirect("/content");
}

async function uploadAttachment(formData: FormData) {
  "use server";
  const contentId = String(formData.get("content_id"));
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = `content/${contentId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("michi").upload(path, file);
  if (uploadError) {
    console.error("[michi] upload attachment:", uploadError.message);
    return;
  }

  const { error } = await supabase.from("attachments").insert({
    filename: file.name,
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user?.id ?? null,
    content_id: contentId,
  });
  if (error) console.error("[michi] record attachment:", error.message);
  revalidatePath(`/content/${contentId}`);
}

async function saveVersion(formData: FormData) {
  "use server";
  const contentId = String(formData.get("content_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Versions are append-only. The trigger assigns version_no, bumps
  // current_version, and clears any approval that referred to older text.
  await supabase.from("content_versions").insert({
    content_id: contentId,
    body,
    created_by: user?.id ?? null,
  });

  revalidatePath(`/content/${contentId}`);
}

async function setStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("content_id"));
  const status = String(formData.get("status"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_items")
    .update({ status_code: status })
    .eq("id", id);
  // The database refuses illegal transitions and unapproved publishes; show
  // its reason rather than a generic failure.
  if (error) console.error("[michi] transition:", error.message);
  revalidatePath(`/content/${id}`);
}

async function review(formData: FormData) {
  "use server";
  const id = String(formData.get("content_id"));
  const decision = String(formData.get("decision"));
  const versionNo = Number(formData.get("version_no"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Inserting the review is what moves the status — the trigger owns that, so
  // a decision and the state it implies can never disagree.
  const { error } = await supabase.from("content_reviews").insert({
    content_id: id,
    version_no: versionNo,
    reviewer_id: user?.id ?? null,
    decision,
    comment: String(formData.get("comment") ?? "") || null,
  });
  if (error) console.error("[michi] review:", error.message);

  revalidatePath(`/content/${id}`);
}

function when(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ContentDetail(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("v_content")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const [
    versionsRes,
    reviewsRes,
    transitionsRes,
    meRes,
    typesRes,
    channelsRes,
    peopleRes,
    batchesRes,
    stylesRes,
    attachmentsRes,
  ] = await Promise.all([
    supabase
      .from("content_versions")
      .select("id, version_no, body, created_at, profiles(full_name)")
      .eq("content_id", id)
      .order("version_no", { ascending: false }),
    supabase
      .from("content_reviews")
      .select("id, version_no, decision, comment, created_at, profiles(full_name)")
      .eq("content_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("content_transitions").select("to_code").eq("from_code", item.status_code),
    supabase.auth.getUser(),
    supabase.from("content_types").select("code, label").order("sort_order"),
    supabase.from("sales_channels").select("code, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name").is("archived_at", null),
    supabase.from("batches").select("id, batch_code").is("archived_at", null).order("batch_code"),
    supabase
      .from("styles")
      .select("id, style_code, name")
      .is("archived_at", null)
      .order("style_code"),
    supabase
      .from("attachments")
      .select("id, filename, storage_path, mime_type, size_bytes, created_at")
      .eq("content_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);

  for (const [n, r] of [
    ["versions", versionsRes],
    ["reviews", reviewsRes],
  ] as const) {
    if (r.error) console.error(`[michi] ${n}:`, r.error.message);
  }

  const versions = versionsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
  const nextStates = (transitionsRes.data ?? []).map((t) => t.to_code);
  const me = meRes.data.user?.id;

  // The bucket is private, so a plain public URL would 400 — sign each file
  // for this render rather than storing a URL that would eventually expire
  // anyway.
  const attachments = await Promise.all(
    (attachmentsRes.data ?? []).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from("michi")
        .createSignedUrl(a.storage_path, 3600);
      return { ...a, url: signed?.signedUrl ?? null };
    }),
  );

  const canPublish =
    item.approved_version !== null && item.approved_version === item.current_version;
  const isAuthor = me && item.author_id === me;

  return (
    <>
      <Link href="/content" className="label hover:text-ink">
        ← Content
      </Link>

      <div className="mt-8 grid gap-16 lg:grid-cols-[1fr_18rem]">
        <div>
          <h1 className="measure">{item.title}</h1>
          <p className="mt-6 text-iron">
            {item.type_label} · {item.status_label} · <Code>v{item.current_version}</Code>
          </p>

          {item.approval_is_stale ? (
            <p className="measure mt-8 border-l-2 border-madder pl-6 text-madder">
              Version {item.approved_version} was approved, but the current text is
              version {item.current_version}. The approval no longer applies and this
              cannot be published until it is reviewed again.
            </p>
          ) : null}

          {/* ---- write a new version ---- */}
          <form action={saveVersion} className="mt-16 flex flex-col gap-4">
            <input type="hidden" name="content_id" value={item.id} />
            <label htmlFor="body" className="label">
              New version
            </label>
            <p className="measure text-sm text-iron">
              Versions are never edited or deleted. Saving adds v
              {item.current_version + 1} and, if this was approved, sends it back to
              draft for another read.
            </p>
            <WordCountTextarea
              id="body"
              name="body"
              rows={8}
              defaultValue={item.current_body ?? ""}
            />
            <button type="submit" className="self-start bg-indigo px-6 py-4 text-kora">
              Save as v{item.current_version + 1}
            </button>
          </form>

          {/* ---- attachments ---- */}
          <section className="mt-24 border-t border-bone pt-16">
            <h2>Attachments</h2>
            <p className="measure mt-4 text-sm text-iron">
              Images, copy documents, video — anything this piece needs beside
              the text above.
            </p>

            <div className="mt-8 flex flex-col gap-6">
              {attachments.length === 0 ? (
                <Empty>No attachments yet.</Empty>
              ) : (
                attachments.map((a) => (
                  <div key={a.id} className="flex flex-col gap-2">
                    {a.url && a.mime_type?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset Next can optimise.
                      <img
                        src={a.url}
                        alt={a.filename}
                        className="max-h-64 max-w-full border border-bone object-contain"
                      />
                    ) : a.url && a.mime_type?.startsWith("video/") ? (
                      <video src={a.url} controls className="max-h-64 max-w-full border border-bone" />
                    ) : null}
                    <a
                      href={a.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm hover:text-indigo"
                    >
                      {a.filename}
                    </a>
                  </div>
                ))
              )}
            </div>

            <form action={uploadAttachment} className="mt-8 flex flex-wrap items-end gap-4">
              <input type="hidden" name="content_id" value={item.id} />
              <input
                type="file"
                name="file"
                required
                className="text-sm file:mr-4 file:border file:border-bone file:bg-transparent
                           file:px-4 file:py-2 file:text-ink"
              />
              <button type="submit" className="border border-bone px-6 py-2 text-ink hover:border-indigo">
                Upload
              </button>
            </form>
          </section>

          {/* ---- review ---- */}
          {item.status_code === "in_review" ? (
            <section className="mt-24 border-t border-bone pt-16">
              <h2>Review v{item.current_version}</h2>
              {isAuthor ? (
                <p className="measure mt-4 text-sm text-madder">
                  You wrote this. With two people that is sometimes unavoidable, but
                  the review will record that author and reviewer were the same person.
                </p>
              ) : null}

              <form action={review} className="mt-8 flex flex-col gap-4">
                <input type="hidden" name="content_id" value={item.id} />
                <input type="hidden" name="version_no" value={item.current_version} />
                <label htmlFor="comment" className="label">
                  Comment
                </label>
                <textarea
                  id="comment"
                  name="comment"
                  rows={3}
                  className="w-full border border-bone bg-transparent p-4
                             focus:border-indigo focus:outline-none"
                />
                <div className="flex flex-wrap gap-4">
                  <button
                    name="decision"
                    value="approved"
                    type="submit"
                    className="bg-indigo px-6 py-4 text-kora"
                  >
                    Approve
                  </button>
                  <button
                    name="decision"
                    value="changes_requested"
                    type="submit"
                    className="border border-bone px-6 py-4 hover:border-madder hover:text-madder"
                  >
                    Request changes
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {/* ---- history ---- */}
          <section className="mt-24">
            <h2>History</h2>
            <div className="mt-8 flex flex-col gap-12">
              {reviews.length === 0 && versions.length === 0 ? (
                <Empty>Nothing yet.</Empty>
              ) : null}

              {reviews.map((r) => (
                <article key={r.id} className="border-l-2 border-bone pl-6">
                  <p className="flex flex-wrap items-baseline gap-4">
                    <span
                      className={
                        r.decision === "approved" ? "text-ink" : "text-madder"
                      }
                    >
                      {r.decision === "approved" ? "Approved" : "Changes requested"}
                    </span>
                    <Code>v{r.version_no}</Code>
                    <span className="text-iron">
                      {one<{ full_name: string }>(r.profiles)?.full_name ?? "Someone"}
                    </span>
                    <span className="data text-sm text-iron">{when(r.created_at)}</span>
                  </p>
                  {r.comment ? (
                    <p className="measure mt-2 whitespace-pre-wrap">{r.comment}</p>
                  ) : null}
                </article>
              ))}

              {versions.map((v) => (
                <article key={v.id}>
                  <p className="flex flex-wrap items-baseline gap-4">
                    <Code>v{v.version_no}</Code>
                    <span className="text-iron">
                      {one<{ full_name: string }>(v.profiles)?.full_name ?? "Someone"}
                    </span>
                    <span className="data text-sm text-iron">{when(v.created_at)}</span>
                    {v.version_no === item.approved_version ? (
                      <span className="label">approved</span>
                    ) : null}
                  </p>
                  <p className="measure mt-2 whitespace-pre-wrap text-iron">{v.body}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* ---- sidebar ---- */}
        <aside className="flex flex-col gap-8 lg:border-l lg:border-bone lg:pl-8">
          <div>
            <p className="label mb-4">Move to</p>
            <div className="flex flex-col items-start gap-2">
              {nextStates.length === 0 ? (
                <span className="text-sm text-iron">Nowhere from here.</span>
              ) : (
                nextStates.map((s) => {
                  const blocked = (s === "published" || s === "scheduled") && !canPublish;
                  return (
                    <form key={s} action={setStatus}>
                      <input type="hidden" name="content_id" value={item.id} />
                      <input type="hidden" name="status" value={s} />
                      <button
                        type="submit"
                        disabled={blocked}
                        title={
                          blocked
                            ? "The current version has not been approved."
                            : undefined
                        }
                        className={
                          blocked
                            ? "label cursor-not-allowed opacity-40"
                            : "label hover:text-ink"
                        }
                      >
                        {s.replace("_", " ")}
                      </button>
                    </form>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-t border-bone pt-8 text-sm text-iron">
            <p>Author: {item.author_name ?? "—"}</p>
            <p className="mt-2">Reviewer: {item.reviewer_name ?? "—"}</p>
            <p className="mt-2">
              Approved:{" "}
              {item.approved_version
                ? `v${item.approved_version} by ${item.approved_by_name ?? "—"}`
                : "not yet"}
            </p>
            {item.published_at ? (
              <p className="mt-2">Published {when(item.published_at)}</p>
            ) : null}
          </div>

          {/* ---- edit fields ---- */}
          <form action={updateFields} className="flex flex-col gap-4 border-t border-bone pt-8">
            <input type="hidden" name="content_id" value={item.id} />
            <p className="label">Details</p>

            <Field label="Title">
              <input
                name="title"
                defaultValue={item.title}
                required
                className="w-full border-b border-bone bg-transparent pb-2
                           focus:border-indigo focus:outline-none"
              />
            </Field>

            <Field label="Type">
              <Select name="type_code" defaultValue={item.type_code}>
                {(typesRes.data ?? []).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Channel">
              <Select name="channel_code" defaultValue={item.channel_code ?? ""}>
                <option value="">—</option>
                {(channelsRes.data ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reviewer">
              <Select name="reviewer_id" defaultValue={item.reviewer_id ?? ""}>
                <option value="">—</option>
                {(peopleRes.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Batch">
              <Select name="batch_id" defaultValue={item.batch_id ?? ""}>
                <option value="">—</option>
                {(batchesRes.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Style">
              <Select name="style_id" defaultValue={item.style_id ?? ""}>
                <option value="">—</option>
                {(stylesRes.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.style_code} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <button type="submit" className="label self-start hover:text-ink">
              Save details
            </button>
          </form>

          <form action={archiveContent} className="border-t border-bone pt-8">
            <input type="hidden" name="content_id" value={item.id} />
            <button type="submit" className="label hover:text-madder">
              Bin this item
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
