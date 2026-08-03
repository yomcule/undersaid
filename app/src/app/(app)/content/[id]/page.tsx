import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Code, Empty } from "@/components/ui";
import { one } from "@/lib/embed";

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

  const [versionsRes, reviewsRes, transitionsRes, meRes] = await Promise.all([
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
            <textarea
              id="body"
              name="body"
              rows={8}
              defaultValue={item.current_body ?? ""}
              className="w-full border border-bone bg-transparent p-4
                         focus:border-indigo focus:outline-none"
            />
            <button type="submit" className="self-start bg-indigo px-6 py-4 text-kora">
              Save as v{item.current_version + 1}
            </button>
          </form>

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
        </aside>
      </div>
    </>
  );
}
