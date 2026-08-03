-- MICHI 1500 — logistics
--
-- The schema could say a batch was in production but not where anything
-- physically was. Fabric leaves the weaver, sits at the dyer, goes to the
-- tailor, comes back as finished garments, then goes to a customer — and at
-- every one of those hops someone has to be chasing it.
--
-- A shipment is that hop: what moved, who is carrying it, when it was
-- promised, and who is on the hook for chasing it.

-- "Who is making it" already exists as batches.tailor_vendor_id. "Who is
-- chasing it" did not, so the production half of the board had nobody to name.
alter table batches add column tracked_by uuid references profiles(id);
create index batches_tracked_by_idx on batches (tracked_by) where tracked_by is not null;

create table shipment_statuses (
  code        text primary key,
  label       text not null,
  -- Still moving, or still owed to us. These are the rows the desk works.
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

insert into shipment_statuses (code, label, is_active, sort_order) values
  ('planned',    'Planned',      true,  1),
  ('dispatched', 'Dispatched',   true,  2),
  ('in_transit', 'In transit',   true,  3),
  ('delayed',    'Delayed',      true,  4),
  ('delivered',  'Delivered',    false, 5),
  ('lost',       'Lost',         false, 6),
  ('cancelled',  'Cancelled',    false, 7);

create table shipment_legs (
  code       text primary key,
  label      text not null,
  sort_order int not null default 0
);

-- The named hops of a shirt's life, so the board reads as a route rather than
-- a pile of undifferentiated parcels.
insert into shipment_legs (code, label, sort_order) values
  ('fabric_in',    'Fabric to us',        1),
  ('to_dyer',      'To dyer',             2),
  ('to_tailor',    'To tailor',           3),
  ('from_tailor',  'Finished goods back', 4),
  ('to_customer',  'To customer',         5),
  ('return_in',    'Customer return',     6),
  ('to_repair',    'Out for repair',      7),
  ('other',        'Other',               8);

create table shipments (
  id              uuid primary key default gen_random_uuid(),
  reference       text,
  leg_code        text not null references shipment_legs(code),
  status_code     text not null default 'planned' references shipment_statuses(code),

  -- Who is carrying it, and how it is tracked.
  carrier_vendor_id uuid references vendors(id),
  carrier_name      text,
  tracking_ref      text,
  tracking_url      text,

  -- Who is chasing it. The whole point of the screen.
  tracked_by      uuid references profiles(id),

  origin          text,
  destination     text,

  dispatched_on   date,
  expected_on     date,
  delivered_on    date,

  units           int check (units is null or units >= 0),
  notes           text,

  -- What is in the box. At most one context, following the same rule as
  -- comments and tasks: typed FKs, never a generic entity_type pair.
  fabric_lot_id   uuid references fabric_lots(id),
  batch_id        uuid references batches(id),
  order_id        uuid references orders(id),
  return_item_id  uuid references return_items(id),

  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,

  constraint shipments_one_context
    check (num_nonnulls(fabric_lot_id, batch_id, order_id, return_item_id) <= 1),
  constraint shipments_dates
    check (delivered_on is null or dispatched_on is null
           or delivered_on >= dispatched_on)
);

create index shipments_status_idx     on shipments (status_code);
create index shipments_leg_idx        on shipments (leg_code);
create index shipments_tracked_by_idx on shipments (tracked_by);
create index shipments_expected_idx   on shipments (expected_on) where archived_at is null;
create index shipments_batch_idx      on shipments (batch_id)       where batch_id is not null;
create index shipments_fabric_idx     on shipments (fabric_lot_id)  where fabric_lot_id is not null;
create index shipments_order_idx      on shipments (order_id)       where order_id is not null;
create index shipments_return_idx     on shipments (return_item_id) where return_item_id is not null;

create unique index shipments_tracking_uidx
  on shipments (carrier_vendor_id, tracking_ref)
  where tracking_ref is not null and archived_at is null;

create trigger trg_shipments_updated_at
  before update on shipments
  for each row execute function set_updated_at();

create trigger trg_shipments_no_delete
  before delete on shipments
  for each row execute function block_hard_delete();

-- Delivered means delivered: stamp the date rather than trusting callers.
create or replace function set_shipment_delivered_on()
returns trigger language plpgsql as $$
begin
  if new.status_code = 'delivered' and new.delivered_on is null then
    new.delivered_on := current_date;
  elsif new.status_code <> 'delivered' then
    new.delivered_on := null;
  end if;
  return new;
end
$$;

create trigger trg_shipment_delivered_on
  before insert or update of status_code on shipments
  for each row execute function set_shipment_delivered_on();

-- ---------------------------------------------------------------------------
-- The logistics board
--
-- Two questions, one view: what is being made and by whom, and what is moving
-- and who is chasing it. They are unioned because the answer to "where is my
-- order" is sometimes "still on a loom" and sometimes "in a van", and a desk
-- that shows only one of those is not a logistics desk.
-- ---------------------------------------------------------------------------

create view v_logistics with (security_invoker = on) as
-- 1. Work in progress: a batch being made is not a shipment, but it is
--    absolutely something someone is waiting on.
select
  'production'::text                as kind,
  b.id                              as id,
  b.batch_code                      as reference,
  bs.label                          as leg_label,
  bs.label                          as status_label,
  b.status_code                     as status_code,
  v.name                            as counterparty,
  null::text                        as tracking_ref,
  null::text                        as tracking_url,
  pt.full_name                      as tracked_by_name,
  b.cut_on                          as started_on,
  b.expected_ready_on               as expected_on,
  b.ready_on                        as completed_on,
  (select sum(x.units_planned)::int from batch_sizes x where x.batch_id = b.id) as units,
  b.id                              as batch_id,
  null::uuid                        as order_id,
  st.style_code,
  st.name                           as style_name,
  case
    when b.ready_on is not null then false
    when b.expected_ready_on is null then false
    else b.expected_ready_on < current_date
  end                               as is_late,
  b.expected_ready_on - current_date as days_to_expected
from batches b
join batch_statuses bs on bs.code = b.status_code
join styles st on st.id = b.style_id
left join vendors v on v.id = b.tailor_vendor_id
left join profiles pt on pt.id = b.tracked_by
where b.archived_at is null
  and bs.is_open
  -- A batch that is ready and selling is no longer being made. `is_open`
  -- alone includes 'selling', which put finished stock on the make board.
  and b.ready_on is null

union all

-- 2. Everything physically moving.
select
  'shipment'::text,
  s.id,
  coalesce(s.reference, s.tracking_ref),
  sl.label,
  ss.label,
  s.status_code,
  coalesce(v.name, s.carrier_name),
  s.tracking_ref,
  s.tracking_url,
  p.full_name,
  s.dispatched_on,
  s.expected_on,
  s.delivered_on,
  s.units,
  s.batch_id,
  s.order_id,
  st.style_code,
  st.name,
  case
    when s.delivered_on is not null then false
    when s.expected_on is null then false
    else s.expected_on < current_date
  end,
  s.expected_on - current_date
from shipments s
join shipment_statuses ss on ss.code = s.status_code
join shipment_legs sl on sl.code = s.leg_code
left join vendors v on v.id = s.carrier_vendor_id
left join profiles p on p.id = s.tracked_by
left join batches b on b.id = s.batch_id
left join styles st on st.id = b.style_id
where s.archived_at is null
  and ss.is_active;

comment on view v_logistics is
  'What is being made and what is moving, in one list: production runs with their tailor, and shipments with their carrier, tracking reference and the person chasing them.';

grant select on v_logistics to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Shipments are operational, not financial: a contributor chasing a parcel
-- needs to see it. They carry no amounts.
-- ---------------------------------------------------------------------------

alter table shipments enable row level security;
create policy shipments_read on shipments
  for select to authenticated using (true);
create policy shipments_insert on shipments
  for insert to authenticated with check (app_can_write());
create policy shipments_update on shipments
  for update to authenticated using (app_can_write()) with check (app_can_write());

grant select, insert, update on shipments to authenticated;

do $$
declare t text;
begin
  foreach t in array array['shipment_statuses','shipment_legs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)',
                   t || '_read', t);
    execute format('create policy %I on %I for insert to authenticated with check (app_can_write())',
                   t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (app_can_write()) with check (app_can_write())',
                   t || '_update', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end
$$;

create trigger trg_shipments_audit
  after insert or update on shipments
  for each row execute function log_activity();
