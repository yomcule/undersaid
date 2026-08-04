import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Row, Cell, Empty, Money } from "@/components/ui";
import { TransactionForm } from "@/components/transaction-form";
import { textField, numberField } from "@/lib/form-data";
import { getRole } from "@/lib/role";
import { one } from "@/lib/embed";

const OUTGOING_KINDS = new Set(["purchase", "expense", "refund_out"]);
const INCOMING_KINDS = new Set(["sale", "refund_in", "other_income"]);

async function recordTransaction(formData: FormData) {
  "use server";
  const categoryCode = String(formData.get("category_code") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  if (!categoryCode || !amount) return;

  const text = (k: string) => textField(formData, k);
  const num = (k: string) => numberField(formData, k);

  const supabase = await createClient();
  const { data: txn, error } = await supabase
    .from("transactions")
    .insert({
      category_code: categoryCode,
      occurred_on: text("occurred_on") ?? undefined,
      description: text("description"),
      amount: Number(amount),
      tax_amount: num("tax_amount") ?? 0,
      vendor_id: text("vendor_id"),
      person_name: text("person_name"),
      invoice_no: text("invoice_no"),
      payment_method: text("payment_method"),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[michi] record transaction:", error.message);
    return;
  }

  const file = formData.get("attachment") as File | null;
  if (file && file.size > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `transactions/${txn.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("michi").upload(path, file);
    if (uploadError) {
      console.error("[michi] upload transaction attachment:", uploadError.message);
    } else {
      const { error: attError } = await supabase.from("attachments").insert({
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user?.id ?? null,
        transaction_id: txn.id,
      });
      if (attError) console.error("[michi] record transaction attachment:", attError.message);
    }
  }

  revalidatePath("/money");
}

// Every query on this page returns nothing for a user without
// can_see_financials. The page is not access control — RLS is.
export default async function MoneyPage() {
  const supabase = await createClient();
  const role = await getRole();

  const [{ data: payables }, { data: renewals }, { data: categories }, { data: vendors }, { data: ledger }] =
    await Promise.all([
      supabase.from("v_vendor_payables").select("*").order("due_on"),
      supabase.from("v_contract_renewals").select("*").order("expires_on"),
      supabase
        .from("transaction_categories")
        .select("code, label, kind_code")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("vendors").select("id, name").is("archived_at", null).order("name"),
      // The entry form has no confirmation screen, so this is where "did that
      // actually save" gets answered — the most recent rows, regardless of
      // whether they came from a bill payment or straight from this page.
      supabase
        .from("transactions")
        .select(
          "id, occurred_on, description, gross_amount, person_name, category_code, transaction_categories(label, kind_code), vendors(name)",
        )
        .is("archived_at", null)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const outgoing = (categories ?? []).filter((c) => OUTGOING_KINDS.has(c.kind_code));
  const incoming = (categories ?? []).filter((c) => INCOMING_KINDS.has(c.kind_code));

  const ledgerRows = ledger ?? [];
  const attachmentsRes = ledgerRows.length
    ? await supabase
        .from("attachments")
        .select("transaction_id, storage_path")
        .in(
          "transaction_id",
          ledgerRows.map((r) => r.id),
        )
        .is("archived_at", null)
    : { data: [] };

  // Signed on render, same as content attachments — the bucket is private,
  // so a bare storage_path is useless to a browser.
  const attachmentUrls = new Map(
    await Promise.all(
      (attachmentsRes.data ?? []).map(async (a) => {
        const { data: signed } = await supabase.storage
          .from("michi")
          .createSignedUrl(a.storage_path, 3600);
        return [a.transaction_id, signed?.signedUrl ?? null] as const;
      }),
    ),
  );

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Money"
        lede="Amounts are tax-exclusive. Input GST is recoverable, so counting it as cost would overstate every margin in the system."
      />

      {!role?.canSeeFinancials ? (
        <Empty>
          Nothing to show. Your role does not include financial access.
        </Empty>
      ) : null}

      {role?.canSeeFinancials ? (
        <section className="mb-24">
          <div className="flex items-center justify-between gap-8">
            <h2>Payable</h2>
            <Link href="/vendors/bills/new" className="label hover:text-ink">
              New bill
            </Link>
          </div>

          {!payables?.length ? (
            <Empty>Nothing outstanding.</Empty>
          ) : (
            <div className="mt-8">
              <Table head={["Vendor", "Bill", "Due", "Gross", "Paid", "Outstanding"]}>
              {payables.map((p) => (
                <Row key={p.bill_id}>
                  <Cell>
                    <Link href={`/vendors/bills/${p.bill_id}`} className="hover:text-indigo">
                      {p.vendor_name}
                    </Link>
                  </Cell>
                  <Cell mono>{p.bill_no}</Cell>
                  <Cell mono>
                    <span className={p.is_overdue ? "text-madder" : undefined}>
                      {p.due_on
                        ? new Date(p.due_on).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })
                        : "—"}
                    </span>
                  </Cell>
                  <Cell mono><Money amount={p.gross_amount} /></Cell>
                  <Cell mono><Money amount={p.paid_amount} /></Cell>
                  <Cell mono><Money amount={p.outstanding_amount} /></Cell>
                </Row>
              ))}
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {renewals?.length ? (
        <section>
          <h2>Contracts expiring</h2>
          <div className="mt-8">
            <Table head={["Contract", "Counterparty", "Expires", "Notice by", "Auto-renews"]}>
              {renewals.map((c) => (
                <Row key={c.id}>
                  <Cell>{c.title}</Cell>
                  <Cell>
                    <span className="text-iron">{c.counterparty}</span>
                  </Cell>
                  <Cell mono>
                    {new Date(c.expires_on).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </Cell>
                  <Cell mono>
                    <span className={c.notice_window_open ? "text-madder" : undefined}>
                      {c.notice_deadline
                        ? new Date(c.notice_deadline).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })
                        : "—"}
                    </span>
                  </Cell>
                  <Cell mono>{c.auto_renews ? "yes" : "no"}</Cell>
                </Row>
              ))}
            </Table>
          </div>
        </section>
      ) : null}

      {role?.canSeeFinancials ? (
        <section className="mt-24">
          <h2>Recent transactions</h2>
          {ledgerRows.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <div className="mt-8">
              <Table head={["Date", "Category", "By", "Vendor", "Amount", ""]}>
                {ledgerRows.map((t) => {
                  const cat = one<{ label: string; kind_code: string }>(t.transaction_categories);
                  const vendor = one<{ name: string }>(t.vendors);
                  const url = attachmentUrls.get(t.id);
                  return (
                    <Row key={t.id}>
                      <Cell mono>
                        {new Date(t.occurred_on).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </Cell>
                      <Cell>
                        {cat?.label ?? t.category_code}
                        {t.description ? (
                          <span className="ml-2 text-sm text-iron">{t.description}</span>
                        ) : null}
                      </Cell>
                      <Cell>
                        <span className="text-iron">{t.person_name ?? "—"}</span>
                      </Cell>
                      <Cell>
                        <span className="text-iron">{vendor?.name ?? "—"}</span>
                      </Cell>
                      <Cell mono>
                        <span className={OUTGOING_KINDS.has(cat?.kind_code ?? "") ? "text-madder" : undefined}>
                          {OUTGOING_KINDS.has(cat?.kind_code ?? "") ? "−" : "+"}
                          <Money amount={t.gross_amount} />
                        </span>
                      </Cell>
                      <Cell>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="label hover:text-indigo"
                          >
                            File
                          </a>
                        ) : null}
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {role?.canSeeFinancials ? (
        <div className="mt-24 border-t border-bone pt-16">
          <TransactionForm
            outgoing={outgoing}
            incoming={incoming}
            vendors={vendors ?? []}
            action={recordTransaction}
          />
        </div>
      ) : null}
    </>
  );
}
