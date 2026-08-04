-- What kind of work a task is, orthogonal to which entity (if any) it's
-- attached to — a Production task can be tied to a batch or to nothing.
create table task_types (
  code text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

insert into task_types (code, label, sort_order) values
  ('production',      'Production',        1),
  ('order_fulfilment', 'Order Fulfilment', 2),
  ('sales_marketing',  'Sales & Marketing', 3),
  ('design',           'Design',            4),
  ('decision_making',  'Decision Making',   5);

alter table tasks
  add column type_code text references task_types(code);

alter table task_types enable row level security;

create policy task_types_read on task_types
  for select to authenticated using (true);

create policy task_types_insert on task_types
  for insert to authenticated with check (app_can_write());

create policy task_types_update on task_types
  for update to authenticated using (app_can_write()) with check (app_can_write());

grant select on task_types to authenticated;
grant insert, update on task_types to authenticated;

-- Appended, not inserted: create-or-replace can only add columns at the end.
create or replace view v_tasks with (security_invoker = on) as
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
  (ts.is_open and t.due_on is not null and t.due_on < current_date) as is_overdue,
  t.completed_at,
  t.vendor_id,
  t.batch_id,
  t.contract_id,
  t.content_id,
  t.tags,
  t.created_at,
  t.updated_at,
  t.type_code,
  tt.label as type_label
from tasks t
join task_statuses ts on ts.code = t.status_code
left join profiles pa on pa.id = t.assignee_id
left join profiles pc on pc.id = t.created_by
left join task_types tt on tt.code = t.type_code
where t.archived_at is null;

grant select on v_tasks to authenticated;
