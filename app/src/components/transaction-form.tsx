"use client";

import { useState } from "react";
import { Field, Input, NumberInput, Select, Textarea, Submit, FormGrid } from "@/components/form";

type Category = { code: string; label: string };
type Vendor = { id: string; name: string };

/**
 * One form, one screen. Expense and income used to be two separate stacked
 * forms — same fields, different category list — which meant scrolling past
 * one to reach the other. A radio toggle switches the category list and
 * labels instead; the fields themselves never move.
 */
export function TransactionForm({
  outgoing,
  incoming,
  vendors,
  action,
}: {
  outgoing: Category[];
  incoming: Category[];
  vendors: Vendor[];
  action: (formData: FormData) => void;
}) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const categories = kind === "expense" ? outgoing : incoming;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-8">
        <h2>Record a transaction</h2>
        <div className="flex gap-6" role="radiogroup" aria-label="Kind">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="expense"
              checked={kind === "expense"}
              onChange={() => setKind("expense")}
              className="accent-indigo"
            />
            <span className="label">Expense</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="income"
              checked={kind === "income"}
              onChange={() => setKind("income")}
              className="accent-indigo"
            />
            <span className="label">Income</span>
          </label>
        </div>
      </div>

      <p className="measure mt-4 text-sm text-iron">
        {kind === "expense"
          ? "Money that left. Name whoever actually spent it, even if that wasn’t you."
          : "Money that came in outside the normal order flow. Name whoever received it."}
      </p>

      <form action={action} className="mt-8 max-w-3xl">
        <FormGrid>
          <Field label="Category" htmlFor="category_code" span={2}>
            {/* Remounted on kind change so the browser resets to the first
                option of the new list rather than keeping a stale value. */}
            <Select id="category_code" name="category_code" required key={kind}>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Amount" htmlFor="amount" hint="Tax-exclusive.">
            <NumberInput id="amount" name="amount" step="0.01" min="0" required />
          </Field>
          <Field label="Tax amount" htmlFor="tax_amount">
            <NumberInput id="tax_amount" name="tax_amount" step="0.01" min="0" />
          </Field>

          <Field label={kind === "expense" ? "Spent by" : "Received by"} htmlFor="person_name">
            <Input id="person_name" name="person_name" />
          </Field>
          <Field
            label="Vendor"
            htmlFor="vendor_id"
            hint={kind === "income" ? "If a vendor credit or refund." : undefined}
          >
            <Select id="vendor_id" name="vendor_id">
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="occurred_on">
            <Input id="occurred_on" name="occurred_on" type="date" />
          </Field>
          <Field label="Attachment" htmlFor="attachment" hint="Receipt or invoice, if you have one.">
            <input
              id="attachment"
              name="attachment"
              type="file"
              className="w-full border-b border-bone bg-transparent pb-2 text-sm text-iron
                         file:mr-4 file:border-0 file:bg-transparent file:text-ink file:underline"
            />
          </Field>

          <Field label="Description" htmlFor="description" span={2}>
            <Textarea id="description" name="description" rows={2} />
          </Field>
        </FormGrid>

        <Submit>{kind === "expense" ? "Record expense" : "Record income"}</Submit>
      </form>
    </section>
  );
}
