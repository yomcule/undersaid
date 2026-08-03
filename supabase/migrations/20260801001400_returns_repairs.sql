-- MICHI 1400 — returns and repairs
--
-- The first cut treated a return as a single event: it came back, and a
-- boolean said whether it could be sold again. Real returns have a life —
-- received, inspected, sent for repair, repaired, restocked or written off —
-- and that life is exactly what someone needs a screen for.
--
-- is_resellable stays, but its meaning narrows to the inspection verdict
-- ("could this be sold again, once dealt with?"). Whether a unit is actually
-- back on the shelf is now a status, because a shirt away at the tailor is
-- not stock.

create table return_statuses (
  code          text primary key,
  label         text not null,
  -- Still needs someone to do something.
  is_open       boolean not null default true,
  -- Counts towards sellable inventory again.
  back_in_stock boolean not null default false,
  sort_order    int not null default 0
);

insert into return_statuses (code, label, is_open, back_in_stock, sort_order) values
  ('received',    'Received',     true,  false, 1),
  ('inspecting',  'Inspecting',   true,  false, 2),
  ('repairing',   'In repair',    true,  false, 3),
  ('repaired',    'Repaired',     true,  false, 4),
  ('restocked',   'Restocked',    false, true,  5),
  ('refunded',    'Refunded',     false, false, 6),
  ('exchanged',   'Exchanged',    false, false, 7),
  ('written_off', 'Written off',  false, false, 8);

alter table return_items
  add column status_code      text not null default 'received'
                              references return_statuses(code),
  add column repair_vendor_id uuid references vendors(id),
  add column repair_cost      numeric(14,2) check (repair_cost >= 0),
  add column repair_notes     text,
  add column resolved_on      date;

create index return_items_status_code_idx on return_items (status_code);
create index return_items_repair_vendor_idx on return_items (repair_vendor_id)
  where repair_vendor_id is not null;

comment on column return_items.is_resellable is
  'Inspection verdict: could this be sold again, possibly after repair? Whether it currently counts as stock is status_code -> back_in_stock.';

-- Existing rows: anything judged resellable was already counted as stock by
-- the old view, so restock it to keep inventory continuous. The rest are
-- written off rather than silently left open.
update return_items set status_code = 'restocked',   resolved_on = returned_on
 where is_resellable;
update return_items set status_code = 'written_off', resolved_on = returned_on
 where not is_resellable;

-- transactions.return_item_id already exists (0700), so a repair cost can be
-- attached to the return it belongs to without any new column here.

insert into transaction_categories (code, label, kind_code, sort_order)
values ('repair', 'Repairs', 'expense', 90)
on conflict (code) do nothing;

-- Keep resolved_on honest without making callers remember it.
create or replace function set_return_resolved_on()
returns trigger language plpgsql as $$
declare
  v_open boolean;
begin
  select is_open into v_open from return_statuses where code = new.status_code;
  if v_open then
    new.resolved_on := null;
  elsif new.resolved_on is null then
    new.resolved_on := current_date;
  end if;
  return new;
end
$$;

create trigger trg_return_resolved_on
  before insert or update of status_code on return_items
  for each row execute function set_return_resolved_on();

-- ---------------------------------------------------------------------------
-- Inventory follows status, not the verdict
-- ---------------------------------------------------------------------------

create or replace view v_batch_size_inventory with (security_invoker = on) as
select
  bs.batch_id,
  b.batch_code,
  b.status_code,
  s.style_code,
  bs.size_code,
  bs.units_planned,
  bs.units_produced,
  bs.units_rejected,
  coalesce(sold.units_sold, 0)        as units_sold,
  coalesce(ret.units_returned, 0)     as units_returned,
  coalesce(ret.units_restocked, 0)    as units_resellable,
  bs.units_produced
    - coalesce(sold.units_sold, 0)
    + coalesce(ret.units_restocked, 0) as units_on_hand,
  -- Appended, not inserted: `create or replace view` can only add columns at
  -- the end, never renumber the existing ones.
  coalesce(ret.units_in_repair, 0)    as units_in_repair
from batch_sizes bs
join batches b on b.id = bs.batch_id
join styles  s on s.id = b.style_id
left join lateral (
  select sum(ol.quantity)::int as units_sold
    from order_lines ol
    join orders o on o.id = ol.order_id
    join order_statuses os on os.code = o.status_code
   where ol.batch_id = bs.batch_id
     and ol.size_code = bs.size_code
     and ol.archived_at is null
     and o.archived_at is null
     and os.counts_as_sold
) sold on true
left join lateral (
  select
    sum(ri.quantity)::int as units_returned,
    sum(case when rs.back_in_stock then ri.quantity else 0 end)::int as units_restocked,
    sum(case when rs.is_open then ri.quantity else 0 end)::int       as units_in_repair
    from return_items ri
    join return_statuses rs on rs.code = ri.status_code
    join order_lines ol on ol.id = ri.order_line_id
   where ol.batch_id = bs.batch_id
     and ol.size_code = bs.size_code
     and ri.archived_at is null
) ret on true
where b.archived_at is null
  -- Lost when this view was redefined here: units_sold and units_on_hand are
  -- derived from orders, which are financially gated. Without this the view
  -- also lost its archived-batch filter, so a written-off batch reappeared
  -- as sellable stock.
  and app_can_see_financials();

-- ---------------------------------------------------------------------------
-- The returns desk
-- ---------------------------------------------------------------------------

create view v_returns with (security_invoker = on) as
select
  ri.id,
  ri.returned_on,
  ri.quantity,
  ri.status_code,
  rs.label            as status_label,
  rs.is_open,
  rs.back_in_stock,
  rs.sort_order       as status_sort,
  ri.reason_code,
  dr.label            as reason_label,
  dc.is_defect,
  dc.label            as reason_category,
  ri.is_resellable,
  -- The refund lives on the transaction, not on the return — storing it in
  -- both places is what let the two disagree. Under security_invoker this
  -- reads as null for anyone without financial access, which is correct.
  refund.amount       as refund_amount,
  ri.repair_cost,
  ri.repair_notes,
  ri.repair_vendor_id,
  rv.name             as repair_vendor_name,
  ri.resolved_on,
  ol.id               as order_line_id,
  ol.size_code,
  o.id                as order_id,
  o.order_ref,
  o.customer_name,
  b.id                as batch_id,
  b.batch_code,
  st.style_code,
  st.name             as style_name,
  -- How long it has been sitting. The queue is sorted by this.
  current_date - ri.returned_on as days_open,
  ri.created_at
from return_items ri
join return_statuses rs on rs.code = ri.status_code
join defect_reasons dr    on dr.code = ri.reason_code
join defect_categories dc on dc.code = dr.category_code
join order_lines ol on ol.id = ri.order_line_id
join orders o       on o.id = ol.order_id
join batches b      on b.id = ol.batch_id
join styles st      on st.id = b.style_id
left join vendors rv on rv.id = ri.repair_vendor_id
left join lateral (
  select sum(t.base_amount) as amount
    from transactions t
    join transaction_categories tc on tc.code = t.category_code
   where t.return_item_id = ri.id
     and tc.kind_code = 'refund_out'
     and t.archived_at is null
) refund on true
where ri.archived_at is null;

comment on view v_returns is
  'The returns and repairs desk: one row per returned item with its status, reason, garment and repair details.';

grant select on v_returns to authenticated;

-- return_statuses is a lookup like any other: readable by all, writable by
-- anyone who can write.
alter table return_statuses enable row level security;
create policy return_statuses_read on return_statuses
  for select to authenticated using (true);
create policy return_statuses_insert on return_statuses
  for insert to authenticated with check (app_can_write());
create policy return_statuses_update on return_statuses
  for update to authenticated using (app_can_write()) with check (app_can_write());

grant select, insert, update on return_statuses to authenticated;
