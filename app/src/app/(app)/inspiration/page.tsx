import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Empty, Code } from "@/components/ui";

async function addInspiration(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  const section = String(formData.get("section_code") ?? "");
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  if (!title || !section || (!sourceUrl && !imageUrl)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("inspirations").insert({
    title,
    section_code: section,
    note: String(formData.get("note") ?? "") || null,
    source_url: sourceUrl || null,
    source_name: String(formData.get("source_name") ?? "") || null,
    image_url: imageUrl || null,
    added_by: user?.id ?? null,
  });
  if (error) console.error("[michi] inspiration:", error.message);

  revalidatePath("/inspiration");
}

function host(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default async function InspirationPage() {
  const supabase = await createClient();

  const [{ data: items, error }, { data: sections }] = await Promise.all([
    supabase
      .from("v_inspirations")
      .select("*")
      .order("section_sort")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("inspiration_sections")
      .select("code, label, blurb, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (error) console.error("[michi] inspiration:", error.message);

  const all = items ?? [];
  const secs = (sections ?? []).filter((s) => all.some((i) => i.section_code === s.code));

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Inspiration"
        lede="Every card says what we are taking from it. A board of images with no reasoning stops being a reference and starts being a copying instrument."
      />

      {/* Jump links — the page is long by design. */}
      {secs.length > 1 ? (
        <nav className="mb-24 flex flex-wrap gap-6 border-b border-bone pb-8">
          {secs.map((s) => (
            <a key={s.code} href={`#${s.code}`} className="label hover:text-ink">
              {s.label}
            </a>
          ))}
        </nav>
      ) : null}

      {all.length === 0 ? (
        <Empty>Nothing pinned yet.</Empty>
      ) : (
        <div className="flex flex-col gap-24">
          {secs.map((section) => {
            const rows = all.filter((i) => i.section_code === section.code);
            return (
              <section key={section.code} id={section.code} className="scroll-mt-24">
                <h2>{section.label}</h2>
                {section.blurb ? (
                  <p className="measure mt-4 text-iron">{section.blurb}</p>
                ) : null}

                <div className="mt-12 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((i) => (
                    <article key={i.id} className="flex flex-col">
                      {/* The image is the hero when there is one. When there
                          isn't, a Kora-deep block keeps the grid honest
                          instead of collapsing the card. */}
                      {i.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.image_url}
                          alt=""
                          loading="lazy"
                          className="mb-6 aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="mb-6 flex aspect-[4/5] w-full items-end bg-kora-deep p-6">
                          <span className="label">
                            {host(i.source_url) ?? "reference"}
                          </span>
                        </div>
                      )}

                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="text-base">{i.title}</h3>
                        {i.is_pinned ? <span className="label">pinned</span> : null}
                      </div>

                      {/* The reason it is here. This is the payload. */}
                      {i.note ? (
                        <p className="measure mt-4 text-iron">{i.note}</p>
                      ) : null}

                      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                        {i.source_url ? (
                          <a
                            href={i.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm underline decoration-bone underline-offset-4
                                       hover:decoration-indigo"
                          >
                            {i.source_name ?? host(i.source_url) ?? "Source"}
                          </a>
                        ) : null}
                        {i.style_code ? <Code>{i.style_code}</Code> : null}
                        {i.tags?.length ? (
                          <span className="label">{i.tags.join(" · ")}</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ---- add ---- */}
      <section className="mt-24 border-t border-bone pt-16">
        <h2>Pin something</h2>
        <form action={addInspiration} className="mt-8 grid gap-6 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="label">Title</span>
            <input
              name="title"
              required
              className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="label">Section</span>
            <select
              name="section_code"
              defaultValue="product_design"
              className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
            >
              {(sections ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="label">What are we taking from it?</span>
            <textarea
              name="note"
              rows={3}
              placeholder="The specific thing worth stealing — and why it suits handloom."
              className="border border-bone bg-transparent p-4 focus:border-indigo focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="label">Source link</span>
            <input
              name="source_url"
              type="url"
              placeholder="https://"
              className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="label">Credit</span>
            <input
              name="source_name"
              placeholder="Who made it"
              className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="label">Image URL (optional)</span>
            <input
              name="image_url"
              type="url"
              placeholder="https://"
              className="border-b border-bone bg-transparent pb-2 focus:border-indigo focus:outline-none"
            />
          </label>

          <button type="submit" className="justify-self-start bg-indigo px-6 py-4 text-kora">
            Pin it
          </button>
        </form>
      </section>
    </>
  );
}
