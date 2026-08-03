-- MICHI 1300 — every task, flattened for sorting
--
-- v_open_tasks powers the overview and only ever contains open work, so it
-- has no use for a status column. The tasks screen needs the opposite: all
-- statuses, sortable by any column.
--
-- Sorting is why this is a view rather than an embedded join. PostgREST can
-- only order a resource by its own columns, so `status_label` and
-- `assignee_name` have to be flat here or the UI cannot sort on them.

create view v_tasks with (security_invoker = on) as
select
  t.id,
  t.title,
  t.description,
  t.status_code,
  ts.label                as status_label,
  ts.is_open,
  ts.sort_order           as status_sort,
  t.priority,
  t.assignee_id,
  pa.full_name            as assignee_name,
  t.created_by,
  pc.full_name            as created_by_name,
  t.due_on,
  t.due_on - current_date as days_until_due,
  -- A finished task is never overdue, however far past its date it sits.
  -- v_open_tasks never had to make this distinction.
  (ts.is_open and t.due_on is not null and t.due_on < current_date) as is_overdue,
  t.completed_at,
  t.vendor_id,
  t.batch_id,
  t.contract_id,
  t.content_id,
  t.tags,
  t.created_at,
  t.updated_at
from tasks t
join task_statuses ts on ts.code = t.status_code
left join profiles pa on pa.id = t.assignee_id
left join profiles pc on pc.id = t.created_by
where t.archived_at is null;

comment on view v_tasks is
  'All live tasks with status, assignee and creator flattened so any column is sortable. security_invoker keeps task RLS in force.';

grant select on v_tasks to authenticated;
