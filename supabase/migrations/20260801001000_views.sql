-- MICHI 1000 — reporting views
--
-- EVERY view here declares `with (security_invoker = on)`.
--
-- This is not optional decoration. Postgres views default to
-- security_invoker = off, which means the view executes as its OWNER. On
-- Supabase the owner is postgres, which owns these tables and is therefore
-- exempt from RLS. A view without this setting hands every authenticated
-- user the full contents of the underlying tables through PostgREST,
-- regardless of policy. That is how the first draft leaked contract values
-- and batch margins to the `contributor` role.
--
-- If you add a view, add the setting. There is no case where you want it off.

-- ---------------------------------------------------------------------------
-- Per-size inventory: "how many 42s of this batch are left?"
-- ---------------------------------------------------------------------------

create view v_batch_size_inventory with (security_invoker = on) as
select
  bs.batch_id,
  b.batch_code,
  b.status_code,
  s.style_code,
  bs.size_code,
  bs.units_planned,
  bs.units_produced,
  bs.units_rejected,
  coalesce(sold.units_sold, 0)               as units_sold,
  coalesce(ret.units_returned, 0)            as units_returned,
  coalesce(ret.units_resellable, 0)          as units_resellable,
  bs.units_produced
    - coalesce(sold.units_sold, 0)
    + coalesce(ret.units_resellable, 0)      as units_on_hand
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
    sum(ri.quantity)::int                                            as units_returned,
    sum(case when ri.is_resellable then ri.quantity else 0 end)::int as units_resellable
    from return_items ri
    join order_lines ol on ol.id = ri.order_line_id
   where ol.batch_id = bs.batch_id
     and ol.size_code = bs.size_code
     and ri.archived_at is null
) ret on true
where b.archived_at is null
  -- units_sold and units_returned come from orders, which are financially
  -- gated, so a contributor would see produced counts with zero sales and
  -- conclude nothing had shipped. Gate the whole view rather than serve a
  -- confidently wrong stock figure.
  and app_can_see_financials();

-- ---------------------------------------------------------------------------
-- Batch economics — the question the whole system exists to answer:
-- did this batch make money, and was it any good?
--
-- Revenue comes from order_lines, not from transactions, so it cannot be
-- inflated by also recording a payout. Refunds come from transactions, not
-- from return_items.refund_amount, so a recorded return and its cash
-- movement cannot both be counted.
--
-- All money is base currency (INR): line values are multiplied by the order's
-- fx_rate, and transactions contribute base_amount.
-- ---------------------------------------------------------------------------

create view v_batch_economics with (security_invoker = on) as
select
  b.id                                  as batch_id,
  b.batch_code,
  b.status_code,
  b.style_id,
  s.style_code,
  s.name                                as style_name,
  b.tailor_vendor_id,
  v.name                                as tailor_name,

  coalesce(prod.units_planned, 0)       as units_planned,
  coalesce(prod.units_produced, 0)      as units_produced,
  coalesce(prod.units_rejected, 0)      as units_rejected,
  coalesce(sold.units_sold, 0)          as units_sold,
  coalesce(ret.units_returned, 0)       as units_returned,

  coalesce(fab.fabric_cost, 0)          as fabric_cost,
  coalesce(cost.other_cost, 0)          as other_cost,
  coalesce(fab.fabric_cost, 0) + coalesce(cost.other_cost, 0) as total_cost,

  coalesce(sold.gross_revenue, 0)       as gross_revenue,
  coalesce(refund.refund_total, 0)      as refund_total,
  coalesce(sold.gross_revenue, 0) - coalesce(refund.refund_total, 0) as net_revenue,

  coalesce(sold.gross_revenue, 0)
    - coalesce(refund.refund_total, 0)
    - coalesce(fab.fabric_cost, 0)
    - coalesce(cost.other_cost, 0)      as gross_margin,

  round(
    (coalesce(fab.fabric_cost, 0) + coalesce(cost.other_cost, 0))
    / nullif(coalesce(prod.units_produced, 0), 0), 2
  )                                     as cost_per_unit,

  round(
    100.0 * coalesce(ret.units_returned, 0)
    / nullif(coalesce(sold.units_sold, 0), 0), 2
  )                                     as return_rate_pct,

  round(
    100.0 * coalesce(ret.defective_returns, 0)
    / nullif(coalesce(sold.units_sold, 0), 0), 2
  )                                     as defect_return_rate_pct,

  round(
    100.0 * coalesce(prod.units_rejected, 0)
    / nullif(coalesce(prod.units_produced, 0) + coalesce(prod.units_rejected, 0), 0), 2
  )                                     as qc_reject_rate_pct,

  round(
    100.0 * (coalesce(sold.gross_revenue, 0) - coalesce(refund.refund_total, 0)
             - coalesce(fab.fabric_cost, 0) - coalesce(cost.other_cost, 0))
    / nullif(coalesce(sold.gross_revenue, 0) - coalesce(refund.refund_total, 0), 0), 2
  )                                     as gross_margin_pct

from batches b
join styles s on s.id = b.style_id
left join vendors v on v.id = b.tailor_vendor_id

left join lateral (
  select
    sum(bs.units_planned)::int  as units_planned,
    sum(bs.units_produced)::int as units_produced,
    sum(bs.units_rejected)::int as units_rejected
    from batch_sizes bs
   where bs.batch_id = b.id
) prod on true

left join lateral (
  select
    sum(ol.quantity)::int              as units_sold,
    sum(ol.line_net * o.fx_rate)       as gross_revenue
    from order_lines ol
    join orders o on o.id = ol.order_id
    join order_statuses os on os.code = o.status_code
   where ol.batch_id = b.id
     and ol.archived_at is null
     and o.archived_at is null
     and os.counts_as_sold
) sold on true

left join lateral (
  select
    sum(ri.quantity)::int as units_returned,
    sum(case when dc.is_defect then ri.quantity else 0 end)::int as defective_returns
    from return_items ri
    join order_lines ol on ol.id = ri.order_line_id
    join defect_reasons dr on dr.code = ri.reason_code
    join defect_categories dc on dc.code = dr.category_code
   where ol.batch_id = b.id
     and ri.archived_at is null
) ret on true

-- Fabric cost allocated by metres actually consumed, not by whoever the
-- purchase invoice happened to be tagged against.
left join lateral (
  select sum(bfu.metres_used * fl.base_cost_per_metre) as fabric_cost
    from batch_fabric_usage bfu
    join fabric_lots fl on fl.id = bfu.fabric_lot_id
   where bfu.batch_id = b.id
) fab on true

left join lateral (
  select sum(t.base_amount) as other_cost
    from transactions t
    join transaction_categories tc on tc.code = t.category_code
    join transaction_kinds tk on tk.code = tc.kind_code
   where t.batch_id = b.id
     and t.archived_at is null
     and tk.direction = -1
     and tc.code <> 'customer_refund'
) cost on true

left join lateral (
  select sum(t.base_amount) as refund_total
    from transactions t
    join return_items ri on ri.id = t.return_item_id
    join order_lines ol on ol.id = ri.order_line_id
   where ol.batch_id = b.id
     and t.archived_at is null
) refund on true

where b.archived_at is null
  -- security_invoker alone is not enough here. Fabric cost is derived from
  -- fabric_lots and batch_fabric_usage, which are NOT financially gated, so
  -- without this predicate a contributor sees real cost figures and a margin
  -- of minus-the-fabric-bill. Partial visibility of a money view is worse
  -- than none: the numbers look authoritative and are wrong.
  and app_can_see_financials();

comment on view v_batch_economics is
  'Cost, revenue and quality per batch. Costs are tax-exclusive because input GST is recoverable. Requires can_see_financials to return rows.';

-- ---------------------------------------------------------------------------
-- Defect analysis
-- ---------------------------------------------------------------------------

create view v_defect_analysis with (security_invoker = on) as
select
  dr.code                as reason_code,
  dr.label               as reason_label,
  dc.code                as category_code,
  dc.label               as category_label,
  dc.is_defect,
  b.id                   as batch_id,
  b.batch_code,
  s.style_code,
  b.tailor_vendor_id,
  v.name                 as tailor_name,
  count(*)               as return_events,
  sum(ri.quantity)::int  as units_returned,
  sum(case when ri.is_resellable then ri.quantity else 0 end)::int as units_resellable,
  min(ri.returned_on)    as first_seen_on,
  max(ri.returned_on)    as last_seen_on
from return_items ri
join order_lines ol on ol.id = ri.order_line_id
join batches b on b.id = ol.batch_id
join styles s on s.id = b.style_id
left join vendors v on v.id = b.tailor_vendor_id
join defect_reasons dr on dr.code = ri.reason_code
join defect_categories dc on dc.code = dr.category_code
where ri.archived_at is null
group by dr.code, dr.label, dc.code, dc.label, dc.is_defect,
         b.id, b.batch_code, s.style_code, b.tailor_vendor_id, v.name;

-- ---------------------------------------------------------------------------
-- Vendor scorecard — replaces the hand-entered vendors.rating column, which
-- would have gone stale and contradicted this data.
-- ---------------------------------------------------------------------------

create view v_vendor_scorecard with (security_invoker = on) as
select
  v.id                     as vendor_id,
  v.name,
  v.type_code,
  coalesce(b.batch_count, 0)      as batches,
  coalesce(b.units_produced, 0)   as units_produced,
  coalesce(b.units_rejected, 0)   as units_rejected,
  round(100.0 * coalesce(b.units_rejected, 0)
        / nullif(coalesce(b.units_produced, 0) + coalesce(b.units_rejected, 0), 0), 2)
                                  as qc_reject_rate_pct,
  coalesce(r.defective_returns, 0) as defective_returns,
  round(100.0 * coalesce(r.defective_returns, 0)
        / nullif(coalesce(b.units_produced, 0), 0), 2)
                                  as defect_return_rate_pct,
  b.avg_days_late
from vendors v
left join lateral (
  select
    count(distinct bt.id)::int                    as batch_count,
    sum(coalesce(bsz.units_produced, 0))::int     as units_produced,
    sum(coalesce(bsz.units_rejected, 0))::int     as units_rejected,
    round(avg(bt.ready_on - bt.expected_ready_on)
          filter (where bt.ready_on is not null and bt.expected_ready_on is not null), 1)
                                                  as avg_days_late
    from batches bt
    left join batch_sizes bsz on bsz.batch_id = bt.id
   where bt.tailor_vendor_id = v.id
     and bt.archived_at is null
) b on true
left join lateral (
  select sum(ri.quantity)::int as defective_returns
    from return_items ri
    join order_lines ol on ol.id = ri.order_line_id
    join batches bt on bt.id = ol.batch_id
    join defect_reasons dr on dr.code = ri.reason_code
    join defect_categories dc on dc.code = dr.category_code
   where bt.tailor_vendor_id = v.id
     and dc.is_defect
     and ri.archived_at is null
) r on true
where v.archived_at is null;

-- ---------------------------------------------------------------------------
-- Payables — "what do I owe, and when is it due?"
-- ---------------------------------------------------------------------------

create view v_vendor_payables with (security_invoker = on) as
select
  vb.id                as bill_id,
  vb.vendor_id,
  v.name               as vendor_name,
  vb.bill_no,
  vb.status_code,
  vb.issued_on,
  vb.due_on,
  vb.gross_amount,
  vb.currency_code,
  coalesce(p.paid_amount, 0)                       as paid_amount,
  vb.gross_amount - coalesce(p.paid_amount, 0)     as outstanding_amount,
  vb.due_on - current_date                         as days_until_due,
  (vb.due_on is not null
     and vb.due_on < current_date
     and vb.gross_amount - coalesce(p.paid_amount, 0) > 0) as is_overdue
from vendor_bills vb
join vendors v on v.id = vb.vendor_id
left join lateral (
  select sum(t.gross_amount) as paid_amount
    from transactions t
   where t.vendor_bill_id = vb.id
     and t.archived_at is null
) p on true
join bill_statuses bst on bst.code = vb.status_code
where vb.archived_at is null
  and bst.is_outstanding;

-- ---------------------------------------------------------------------------
-- Contract renewals
--
-- Explicit column list rather than c.* so that adding a column to contracts
-- does not silently widen what this view exposes.
-- ---------------------------------------------------------------------------

create view v_contract_renewals with (security_invoker = on) as
select
  c.id,
  c.title,
  c.type_code,
  c.status_code,
  c.vendor_id,
  coalesce(v.name, c.counterparty_name) as counterparty,
  c.effective_on,
  c.expires_on,
  c.notice_period_days,
  c.auto_renews,
  c.owner_id,
  c.expires_on - current_date                             as days_until_expiry,
  c.expires_on - coalesce(c.notice_period_days, 0)        as notice_deadline,
  (c.expires_on - coalesce(c.notice_period_days, 0)) <= current_date as notice_window_open
from contracts c
left join vendors v on v.id = c.vendor_id
join contract_statuses cs on cs.code = c.status_code
where c.archived_at is null
  and cs.is_active_state
  and c.expires_on is not null
  and c.expires_on <= current_date + 120;

-- ---------------------------------------------------------------------------
-- Open tasks
--
-- No ORDER BY: a view's ordering is discarded the moment anything wraps it.
-- Sort in the query or the client.
-- ---------------------------------------------------------------------------

create view v_open_tasks with (security_invoker = on) as
select
  t.id,
  t.title,
  t.status_code,
  ts.label            as status_label,
  t.priority,
  t.assignee_id,
  pa.full_name        as assignee_name,
  t.created_by,
  t.due_on,
  t.due_on - current_date as days_until_due,
  (t.due_on is not null and t.due_on < current_date) as is_overdue,
  t.vendor_id,
  t.batch_id,
  t.contract_id,
  t.content_id,
  t.tags,
  t.created_at
from tasks t
join task_statuses ts on ts.code = t.status_code
left join profiles pa on pa.id = t.assignee_id
where t.archived_at is null
  and ts.is_open;
