-- MICHI 0400 — the spine: vendors -> fabric_lots -> styles -> batches
--
-- Two structural changes from the first draft:
--
--   1. batches.fabric_lot_id is gone. A lot can feed several batches and a
--      batch can use several lots, so consumption lives in batch_fabric_usage
--      with actual metres. Without it, fabric cost cannot be allocated and
--      cost-per-unit is not comparable between batches.
--
--   2. batches.units_produced / units_rejected / units_sold are gone. Unit
--      counts are per size in batch_sizes (production) and derived from
--      order_lines (sales). Hand-maintained counters silently drift, and
--      return rate was being divided by one of them.

create table vendors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type_code       text not null references vendor_types(code),
  cluster         text,                        -- e.g. 'Bhiwandi', 'Tiruppur'
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  address         text,
  gstin           text,
  payment_terms_days int check (payment_terms_days is null or payment_terms_days >= 0),
  payment_terms_note text,
  lead_time_days  int check (lead_time_days is null or lead_time_days >= 0),
  notes           text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

-- Indian GSTIN: 2-digit state, 10-char PAN, entity digit, 'Z', checksum.
alter table vendors add constraint vendors_gstin_format
  check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$');

-- payment_terms_days is structured so payables can compute a due date;
-- the free-text note carries the rest ("40% advance, balance on delivery").

comment on column vendors.payment_terms_days is
  'Net days from bill date. Drives vendor_bills.due_on and the payables view.';

create unique index vendors_name_active_uidx on vendors (lower(name)) where archived_at is null;
create index vendors_type_code_idx on vendors (type_code);
create index vendors_active_idx on vendors (id) where archived_at is null;
create index vendors_name_trgm_idx on vendors using gin (name extensions.gin_trgm_ops);

create table fabric_lots (
  id               uuid primary key default gen_random_uuid(),
  lot_code         text not null,
  vendor_id        uuid not null references vendors(id),
  fibre            text,
  composition      text,
  weave            text,
  gsm              int check (gsm is null or gsm > 0),
  width_cm         numeric(6,2) check (width_cm is null or width_cm > 0),
  colour_name      text,
  colour_hex       text check (colour_hex is null or colour_hex ~ '^#[0-9a-fA-F]{6}$'),
  metres_ordered   numeric(10,2) check (metres_ordered is null or metres_ordered >= 0),
  metres_received  numeric(10,2) check (metres_received is null or metres_received >= 0),
  cost_per_metre   numeric(14,2) check (cost_per_metre is null or cost_per_metre >= 0),
  currency_code    char(3) not null default 'INR' references currencies(code),
  fx_rate          numeric(18,8) not null default 1 check (fx_rate > 0),
  base_cost_per_metre numeric(14,2)
                     generated always as (round(cost_per_metre * fx_rate, 2)) stored,
  shrinkage_pct    numeric(5,2) check (shrinkage_pct is null or shrinkage_pct between 0 and 100),
  received_on      date,
  notes            text,
  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

comment on column fabric_lots.cost_per_metre is
  'Landed cost per metre, tax-exclusive. Used to allocate fabric cost to batches via batch_fabric_usage.';

-- Partial unique: archiving a lot frees its code, so a typo can be corrected
-- by archive-and-recreate. A plain UNIQUE burns the code permanently.
create unique index fabric_lots_lot_code_uidx on fabric_lots (lot_code) where archived_at is null;
create index fabric_lots_vendor_id_idx on fabric_lots (vendor_id);
create index fabric_lots_active_idx on fabric_lots (id) where archived_at is null;

create table styles (
  id            uuid primary key default gen_random_uuid(),
  style_code    text not null,
  name          text not null,
  description   text,
  collar_type   text,
  cuff_type     text,
  placket_type  text,
  fit           text,
  target_price  numeric(14,2) check (target_price is null or target_price >= 0),
  currency_code char(3) not null default 'INR' references currencies(code),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create unique index styles_style_code_uidx on styles (style_code) where archived_at is null;
create index styles_active_idx on styles (id) where archived_at is null;

-- Replaces styles.size_range text[]: joinable, and constrains what a batch
-- may be cut in.
create table style_sizes (
  style_id   uuid not null references styles(id) on delete cascade,
  size_code  text not null references sizes(code),
  sort_order int not null default 0,
  primary key (style_id, size_code)
);

create table batches (
  id                 uuid primary key default gen_random_uuid(),
  batch_code         text not null,
  style_id           uuid not null references styles(id),
  tailor_vendor_id   uuid references vendors(id),
  status_code        text not null default 'planned' references batch_statuses(code),
  cut_on             date,
  expected_ready_on  date,
  ready_on           date,
  cmt_cost_per_unit  numeric(14,2) check (cmt_cost_per_unit is null or cmt_cost_per_unit >= 0),
  currency_code      char(3) not null default 'INR' references currencies(code),
  fx_rate            numeric(18,8) not null default 1 check (fx_rate > 0),
  base_cmt_cost_per_unit numeric(14,2)
                       generated always as (round(cmt_cost_per_unit * fx_rate, 2)) stored,
  aql_level          text,
  qc_notes           text,
  notes              text,
  metadata           jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  constraint batches_dates_sane
    check (expected_ready_on is null or cut_on is null or expected_ready_on >= cut_on)
);

comment on column batches.cmt_cost_per_unit is
  'Planned CMT rate, for costing before invoices land. Actuals come from transactions; v_batch_economics reports both.';

create unique index batches_batch_code_uidx on batches (batch_code) where archived_at is null;
create index batches_style_id_idx on batches (style_id);
create index batches_tailor_vendor_id_idx on batches (tailor_vendor_id);
create index batches_status_code_idx on batches (status_code);
create index batches_active_idx on batches (id) where archived_at is null;

-- Per-size production. This is the grain at which shirting is actually
-- managed: "how many 42s are left" is the daily question.
create table batch_sizes (
  batch_id        uuid not null references batches(id) on delete cascade,
  size_code       text not null references sizes(code),
  units_planned   int not null default 0 check (units_planned >= 0),
  units_produced  int not null default 0 check (units_produced >= 0),
  units_rejected  int not null default 0 check (units_rejected >= 0),
  primary key (batch_id, size_code)
);

comment on table batch_sizes is
  'Actual production per size. units_produced = good units that passed QC; units_rejected = failed QC. Total cut = produced + rejected.';

create table batch_fabric_usage (
  batch_id      uuid not null references batches(id) on delete cascade,
  fabric_lot_id uuid not null references fabric_lots(id),
  metres_used   numeric(10,2) not null check (metres_used >= 0),
  notes         text,
  primary key (batch_id, fabric_lot_id)
);

comment on table batch_fabric_usage is
  'Allocates fabric to batches by actual metres. Fabric cost for a batch = sum(metres_used * lot.cost_per_metre).';

create index batch_fabric_usage_lot_idx on batch_fabric_usage (fabric_lot_id);
