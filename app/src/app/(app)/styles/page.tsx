import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";
import { Field, Input, NumberInput, Textarea, Submit, FormGrid } from "@/components/form";
import { textField } from "@/lib/form-data";

async function addStyle(formData: FormData) {
  "use server";
  const code = String(formData.get("style_code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return;

  const text = (k: string) => textField(formData, k);
  const price = String(formData.get("target_price") ?? "").trim();

  const supabase = await createClient();
  const { data: style, error } = await supabase
    .from("styles")
    .insert({
      style_code: code,
      name,
      description: text("description"),
      collar_type: text("collar_type"),
      cuff_type: text("cuff_type"),
      placket_type: text("placket_type"),
      fit: text("fit"),
      target_price: price === "" ? null : Number(price),
    })
    .select("id")
    .single();

  if (error || !style) {
    console.error("[michi] add style:", error?.message);
    return;
  }

  // Which sizes this style is made in. Stored as rows, not a text[], so a
  // batch cannot plan a size the style does not come in.
  const sizes = formData.getAll("sizes").map(String);
  if (sizes.length) {
    await supabase.from("style_sizes").insert(
      sizes.map((size_code, i) => ({ style_id: style.id, size_code, sort_order: i })),
    );
  }

  revalidatePath("/styles");
}

export default async function StylesPage() {
  const supabase = await createClient();

  const [{ data: styles }, { data: sizes }] = await Promise.all([
    supabase
      .from("styles")
      .select("*, style_sizes(size_code)")
      .is("archived_at", null)
      .order("style_code"),
    supabase.from("sizes").select("code, scale, label").order("scale").order("sort_order"),
  ]);

  const chest = (sizes ?? []).filter((s) => s.scale === "chest");
  const alpha = (sizes ?? []).filter((s) => s.scale === "alpha");

  return (
    <>
      <PageHeader
        eyebrow="Design"
        title="Styles"
        lede="A style is the pattern; a batch is one run of it in one cloth. Sizes live here so a production run cannot plan a size the style is not cut in."
      />

      {styles && styles.length > 0 ? (
        <Table head={["Code", "Name", "Collar", "Cuff", "Fit", "Sizes", "Target"]}>
          {styles.map((s) => (
            <Row key={s.id}>
              <Cell mono>{s.style_code}</Cell>
              <Cell>{s.name}</Cell>
              <Cell>
                <span className="text-iron">{s.collar_type ?? "—"}</span>
              </Cell>
              <Cell>
                <span className="text-iron">{s.cuff_type ?? "—"}</span>
              </Cell>
              <Cell>
                <span className="text-iron">{s.fit ?? "—"}</span>
              </Cell>
              <Cell mono>
                {(s.style_sizes as { size_code: string }[] | null)
                  ?.map((x) => x.size_code)
                  .join(" ") || "—"}
              </Cell>
              <Cell mono>
                <Money amount={s.target_price} currency={s.currency_code} />
              </Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty>No styles yet.</Empty>
      )}

      <section className="mt-24 border-t border-bone pt-16">
        <h2>New style</h2>
        <form action={addStyle} className="mt-8 max-w-3xl">
          <FormGrid>
            <Field label="Style code" htmlFor="style_code" hint="e.g. ST-CHAM">
              <Input id="style_code" name="style_code" required className="data" />
            </Field>
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required placeholder="The Chambray" />
            </Field>

            <Field label="Collar" htmlFor="collar_type">
              <Input id="collar_type" name="collar_type" placeholder="Button-down" />
            </Field>
            <Field label="Cuff" htmlFor="cuff_type">
              <Input id="cuff_type" name="cuff_type" placeholder="Single button" />
            </Field>
            <Field label="Placket" htmlFor="placket_type">
              <Input id="placket_type" name="placket_type" placeholder="Concealed" />
            </Field>
            <Field label="Fit" htmlFor="fit">
              <Input id="fit" name="fit" placeholder="Regular" />
            </Field>

            <Field label="Target price" htmlFor="target_price" hint="Tax-exclusive.">
              <NumberInput id="target_price" name="target_price" step="1" min="0" />
            </Field>

            <Field label="Description" htmlFor="description" span={2}>
              <Textarea id="description" name="description" rows={3} />
            </Field>

            <Field label="Sizes" span={2} hint="Chest measurements, or alpha sizing.">
              <div className="flex flex-wrap gap-x-8 gap-y-4 pt-2">
                {[
                  { title: "Chest", list: chest, on: true },
                  { title: "Alpha", list: alpha, on: false },
                ].map((grp) => (
                  <fieldset key={grp.title} className="flex flex-wrap items-center gap-4">
                    <legend className="label">{grp.title}</legend>
                    {grp.list.map((s) => (
                      <label key={s.code} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="sizes"
                          value={s.code}
                          defaultChecked={grp.on && ["38", "40", "42", "44", "46"].includes(s.code)}
                          className="accent-indigo"
                        />
                        <span className="data">{s.code}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </Field>
          </FormGrid>

          <Submit>Add style</Submit>
        </form>
      </section>
    </>
  );
}
