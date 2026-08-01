-- MICHI 0500 — sales and returns
--
-- The first draft had batches.units_sold as an int you maintained by hand,
-- and v_batch_economics divided return counts by it. Every margin and return
-- rate in the system therefore rested on a number nothing reconciled.
--
-- Orders are the source of truth for units sold. If Shopify is the real
-- system of record, sync into these tables; do not maintain a counter.

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_ref      text not null,               -- Shopify order name, e.g. '#1042'
  channel_code   text not null default 'shopify' references sales_channels(code),
  status_code    text not null default 'confirmed' references order_statuses(code),
  placed_at      timestamptz not null default now(),
  customer_ref   text,                        -- external id or email hash; no PII duplication
  customer_name  text,
  shipping_city  text,
  shipping_state text,
  subtotal       numeric(14,2) not null default 0 check (subtotal >= 0),
  shipping_amount numeric(14,2) not null default 0 check (shipping_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount     numeric(14,2) not null default 0 check (tax_amount >= 0),
  currency_code  char(3) not null default 'INR' references currencies(code),
  fx_rate        numeric(18,8) not null default 1 check (fx_rate > 0),
  external_source text,                     -- 'shopify' etc, for sync provenance
  external_id    text,
  notes          text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);

comment on column orders.subtotal is
  'Tax-exclusive sum of line totals before shipping and discount. Revenue in the economics view is line-level, not this column.';

create unique index orders_ref_channel_uidx
  on orders (channel_code, order_ref) where archived_at is null;
create unique index orders_external_uidx
  on orders (external_source, external_id) where external_id is not null;
create index orders_placed_at_idx on orders (placed_at desc);
create index orders_status_code_idx on orders (status_code);

create table order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  batch_id     uuid not null,
  size_code    text not null,
  quantity     int not null check (quantity > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount   numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_net     numeric(14,2) generated always as
                 (round(quantity * unit_price - discount_amount, 2)) stored,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  -- Composite FK: you cannot sell a size the batch never cut.
  constraint order_lines_batch_size_fk
    foreign key (batch_id, size_code) references batch_sizes (batch_id, size_code)
);

comment on column order_lines.line_net is
  'Tax-exclusive revenue for this line. tax_amount is GST charged on top.';

create index order_lines_order_id_idx on order_lines (order_id);
create index order_lines_batch_size_idx on order_lines (batch_id, size_code);

create table return_items (
  id             uuid primary key default gen_random_uuid(),
  order_line_id  uuid not null references order_lines(id),
  quantity       int not null check (quantity > 0),
  reason_code    text not null references defect_reasons(code),
  is_resellable  boolean not null default false,
  returned_on    date not null default current_date,
  inspected_by   uuid references profiles(id),
  notes          text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);

-- Renamed from `returns`: unambiguous against SQL keywords and against
-- "returns" in the financial sense, and it reads correctly in an ORM.
comment on table return_items is
  'A returned quantity from one order line. Batch and size are inherited through the line, so they cannot disagree with what was sold.';
-- There is deliberately no refund_amount column. The refund is a cash
-- movement, so it is a transaction with category customer_refund and
-- return_item_id set. Storing the amount in both places invites
-- double-counting in margin, and would leak money figures into a table that
-- QC staff need to read.

create index return_items_order_line_id_idx on return_items (order_line_id);
create index return_items_reason_code_idx on return_items (reason_code);
create index return_items_returned_on_idx on return_items (returned_on desc);

-- A line cannot be returned more times than it was sold.
create or replace function check_return_quantity()
returns trigger
language plpgsql
as $$
declare
  v_sold int;
  v_returned int;
begin
  select quantity into v_sold from order_lines where id = new.order_line_id;

  select coalesce(sum(quantity), 0) into v_returned
    from return_items
   where order_line_id = new.order_line_id
     and archived_at is null
     and id is distinct from new.id;

  if v_returned + new.quantity > v_sold then
    raise exception
      'returning % units would exceed the % sold on this line (% already returned)',
      new.quantity, v_sold, v_returned
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

create trigger trg_return_items_quantity
  before insert or update on return_items
  for each row execute function check_return_quantity();
