-- MICHI 0700 — contracts, payables, transactions
--
-- Money conventions, stated once and enforced:
--
--   * `amount` is ALWAYS tax-exclusive (net) and ALWAYS positive.
--     Direction comes from transaction_kinds.direction (-1 out, +1 in).
--   * `tax_amount` is GST on top of `amount`. gross_amount is generated.
--     COGS and margin use net, because input GST is recoverable against
--     output GST — counting gross would overstate cost.
--   * Foreign-currency rows carry fx_rate to the base currency (INR).
--     base_amount is generated. Every aggregate sums base_amount, never
--     amount, so totals cannot silently add rupees to dollars.

create table contracts (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(btrim(title)) > 0),
  type_code          text not null references contract_types(code),
  status_code        text not null default 'draft' references contract_statuses(code),
  vendor_id          uuid references vendors(id),
  counterparty_name  text,
  effective_on       date,
  expires_on         date,
  notice_period_days int check (notice_period_days is null or notice_period_days >= 0),
  auto_renews        boolean not null default false,
  value_amount       numeric(14,2) check (value_amount is null or value_amount >= 0),
  currency_code      char(3) not null default 'INR' references currencies(code),
  storage_path       text,
  esign_ref          text,
  owner_id           uuid references profiles(id),
  notes              text,
  metadata           jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  constraint contracts_dates
    check (expires_on is null or effective_on is null or expires_on >= effective_on),
  constraint contracts_has_counterparty
    check (vendor_id is not null or counterparty_name is not null)
);

create index contracts_vendor_id_idx on contracts (vendor_id) where vendor_id is not null;
create index contracts_status_code_idx on contracts (status_code);
create index contracts_expires_on_idx on contracts (expires_on)
  where expires_on is not null and archived_at is null;
create index contracts_owner_id_idx on contracts (owner_id);

alter table tasks add constraint tasks_contract_id_fkey
  foreign key (contract_id) references contracts(id);
create index tasks_contract_id_idx on tasks (contract_id) where contract_id is not null;

-- ---------------------------------------------------------------------------
-- Accounts payable
--
-- Vendors are the spine and job work runs on advances and credit, so "what do
-- I owe this weaver, and when" needs somewhere to live. A bill is the
-- obligation; payments against it are transactions.
-- ---------------------------------------------------------------------------

create table vendor_bills (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id),
  bill_no       text not null,
  status_code   text not null default 'draft' references bill_statuses(code),
  contract_id   uuid references contracts(id),
  issued_on     date not null default current_date,
  due_on        date,
  amount        numeric(14,2) not null check (amount >= 0),
  tax_amount    numeric(14,2) not null default 0 check (tax_amount >= 0),
  gross_amount  numeric(14,2) generated always as (amount + tax_amount) stored,
  currency_code char(3) not null default 'INR' references currencies(code),
  fx_rate       numeric(18,8) not null default 1 check (fx_rate > 0),
  base_amount   numeric(14,2) generated always as (round(amount * fx_rate, 2)) stored,
  storage_path  text,
  notes         text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint vendor_bills_dates check (due_on is null or due_on >= issued_on)
);

comment on column vendor_bills.amount is 'Tax-exclusive. gross_amount = amount + tax_amount is what you actually pay.';

create unique index vendor_bills_vendor_no_uidx
  on vendor_bills (vendor_id, bill_no) where archived_at is null;
create index vendor_bills_vendor_id_idx on vendor_bills (vendor_id);
create index vendor_bills_status_code_idx on vendor_bills (status_code);
create index vendor_bills_due_on_idx on vendor_bills (due_on)
  where due_on is not null and archived_at is null;

-- Default due_on from the vendor's payment terms when not given.
create or replace function set_bill_due_on()
returns trigger
language plpgsql
as $$
declare
  v_terms int;
begin
  if new.due_on is null then
    select payment_terms_days into v_terms from vendors where id = new.vendor_id;
    if v_terms is not null then
      new.due_on := new.issued_on + v_terms;
    end if;
  end if;
  return new;
end
$$;

create trigger trg_vendor_bills_due_on
  before insert on vendor_bills
  for each row execute function set_bill_due_on();

-- ---------------------------------------------------------------------------
-- Transactions — actual money movement
-- ---------------------------------------------------------------------------

create table transactions (
  id             uuid primary key default gen_random_uuid(),
  occurred_on    date not null default current_date,
  category_code  text not null references transaction_categories(code),
  description    text,

  amount         numeric(14,2) not null check (amount >= 0),
  tax_amount     numeric(14,2) not null default 0 check (tax_amount >= 0),
  gross_amount   numeric(14,2) generated always as (amount + tax_amount) stored,
  tax_recoverable boolean not null default true,

  currency_code  char(3) not null default 'INR' references currencies(code),
  fx_rate        numeric(18,8) not null default 1 check (fx_rate > 0),
  base_amount    numeric(14,2) generated always as (round(amount * fx_rate, 2)) stored,

  -- What this money relates to. All optional and not mutually exclusive:
  -- a fabric payment legitimately points at a vendor, a bill and a lot.
  vendor_id      uuid references vendors(id),
  vendor_bill_id uuid references vendor_bills(id),
  batch_id       uuid references batches(id),
  fabric_lot_id  uuid references fabric_lots(id),
  contract_id    uuid references contracts(id),
  order_id       uuid references orders(id),
  return_item_id uuid references return_items(id),

  invoice_no     text,
  payment_method text,
  is_reconciled  boolean not null default false,
  reconciled_at  timestamptz,
  storage_path   text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);

comment on column transactions.amount is
  'Tax-exclusive and always positive. Sign comes from transaction_categories -> transaction_kinds.direction.';
comment on column transactions.tax_recoverable is
  'True when input GST on this row can be claimed as credit. False for blocked credits and non-GST spend.';
comment on column transactions.base_amount is
  'amount converted to INR at fx_rate. All reporting sums this column.';

create index transactions_occurred_on_idx on transactions (occurred_on desc);
create index transactions_category_code_idx on transactions (category_code);
create index transactions_vendor_id_idx on transactions (vendor_id) where vendor_id is not null;
create index transactions_vendor_bill_id_idx on transactions (vendor_bill_id) where vendor_bill_id is not null;
create index transactions_batch_id_idx on transactions (batch_id) where batch_id is not null;
create index transactions_fabric_lot_id_idx on transactions (fabric_lot_id) where fabric_lot_id is not null;
create index transactions_contract_id_idx on transactions (contract_id) where contract_id is not null;
create index transactions_order_id_idx on transactions (order_id) where order_id is not null;
create index transactions_unreconciled_idx on transactions (occurred_on)
  where is_reconciled = false and archived_at is null;

-- Fabric bought for stock is not yet a cost of any batch; it becomes one when
-- metres are consumed (batch_fabric_usage). Pinning a whole lot's cost to one
-- batch was how the first draft got cost-per-unit wrong.
alter table transactions add constraint transactions_fabric_not_batch_costed
  check (not (category_code = 'fabric' and batch_id is not null));

comment on constraint transactions_fabric_not_batch_costed on transactions is
  'Fabric spend attaches to the lot, never directly to a batch. Batch fabric cost is allocated by metres consumed.';
