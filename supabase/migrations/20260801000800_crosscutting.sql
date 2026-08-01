-- MICHI 0800 — comments, attachments, activity log
--
-- Comments and attachments use nullable typed FKs plus a num_nonnulls CHECK
-- rather than a generic (entity_type text, entity_id uuid) pair. The columns
-- are wide but every link is a real foreign key: you cannot orphan a comment,
-- and the planner can use an index. Adding an entity means one ALTER, which
-- is the deliberate trade.

create table comments (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id),
  body           text not null check (length(btrim(body)) > 0),
  parent_id      uuid references comments(id),
  resolved_at    timestamptz,
  resolved_by    uuid references profiles(id),

  vendor_id      uuid references vendors(id),
  fabric_lot_id  uuid references fabric_lots(id),
  style_id       uuid references styles(id),
  batch_id       uuid references batches(id),
  task_id        uuid references tasks(id),
  content_id     uuid references content_items(id),
  resource_id    uuid references resources(id),
  order_id       uuid references orders(id),
  return_item_id uuid references return_items(id),
  contract_id    uuid references contracts(id),
  vendor_bill_id uuid references vendor_bills(id),
  transaction_id uuid references transactions(id),

  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,

  constraint comments_one_parent check (
    num_nonnulls(
      vendor_id, fabric_lot_id, style_id, batch_id, task_id, content_id,
      resource_id, order_id, return_item_id, contract_id, vendor_bill_id,
      transaction_id
    ) = 1
  )
);

create index comments_parent_id_idx on comments (parent_id) where parent_id is not null;
create index comments_author_id_idx on comments (author_id);
create index comments_vendor_id_idx on comments (vendor_id) where vendor_id is not null;
create index comments_fabric_lot_id_idx on comments (fabric_lot_id) where fabric_lot_id is not null;
create index comments_style_id_idx on comments (style_id) where style_id is not null;
create index comments_batch_id_idx on comments (batch_id) where batch_id is not null;
create index comments_task_id_idx on comments (task_id) where task_id is not null;
create index comments_content_id_idx on comments (content_id) where content_id is not null;
create index comments_resource_id_idx on comments (resource_id) where resource_id is not null;
create index comments_order_id_idx on comments (order_id) where order_id is not null;
create index comments_return_item_id_idx on comments (return_item_id) where return_item_id is not null;
create index comments_contract_id_idx on comments (contract_id) where contract_id is not null;
create index comments_vendor_bill_id_idx on comments (vendor_bill_id) where vendor_bill_id is not null;
create index comments_transaction_id_idx on comments (transaction_id) where transaction_id is not null;

-- A reply inherits its parent's entity. Without this a reply can be attached
-- to a different record than the comment it answers, and the thread renders
-- in two places.
create or replace function sync_comment_thread()
returns trigger
language plpgsql
as $$
declare
  p comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a comment cannot reply to itself' using errcode = 'check_violation';
  end if;

  select * into p from comments where id = new.parent_id;
  if not found then
    raise exception 'parent comment % not found', new.parent_id using errcode = 'foreign_key_violation';
  end if;

  new.vendor_id      := p.vendor_id;
  new.fabric_lot_id  := p.fabric_lot_id;
  new.style_id       := p.style_id;
  new.batch_id       := p.batch_id;
  new.task_id        := p.task_id;
  new.content_id     := p.content_id;
  new.resource_id    := p.resource_id;
  new.order_id       := p.order_id;
  new.return_item_id := p.return_item_id;
  new.contract_id    := p.contract_id;
  new.vendor_bill_id := p.vendor_bill_id;
  new.transaction_id := p.transaction_id;

  return new;
end
$$;

create trigger trg_comments_thread
  before insert or update of parent_id on comments
  for each row execute function sync_comment_thread();

create table attachments (
  id             uuid primary key default gen_random_uuid(),
  filename       text not null,
  storage_path   text not null,
  mime_type      text,
  size_bytes     bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by    uuid references profiles(id),

  vendor_id      uuid references vendors(id),
  fabric_lot_id  uuid references fabric_lots(id),
  style_id       uuid references styles(id),
  batch_id       uuid references batches(id),
  task_id        uuid references tasks(id),
  content_id     uuid references content_items(id),
  comment_id     uuid references comments(id),
  order_id       uuid references orders(id),
  return_item_id uuid references return_items(id),
  contract_id    uuid references contracts(id),
  vendor_bill_id uuid references vendor_bills(id),
  transaction_id uuid references transactions(id),

  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,

  constraint attachments_one_parent check (
    num_nonnulls(
      vendor_id, fabric_lot_id, style_id, batch_id, task_id, content_id,
      comment_id, order_id, return_item_id, contract_id, vendor_bill_id,
      transaction_id
    ) = 1
  )
);

create index attachments_vendor_id_idx on attachments (vendor_id) where vendor_id is not null;
create index attachments_batch_id_idx on attachments (batch_id) where batch_id is not null;
create index attachments_task_id_idx on attachments (task_id) where task_id is not null;
create index attachments_content_id_idx on attachments (content_id) where content_id is not null;
create index attachments_comment_id_idx on attachments (comment_id) where comment_id is not null;
create index attachments_contract_id_idx on attachments (contract_id) where contract_id is not null;
create index attachments_vendor_bill_id_idx on attachments (vendor_bill_id) where vendor_bill_id is not null;
create index attachments_transaction_id_idx on attachments (transaction_id) where transaction_id is not null;

-- ---------------------------------------------------------------------------
-- Activity log
--
-- Two deliberate exceptions to the schema conventions, justified here so the
-- next person does not copy the pattern without the reason:
--
--   1. bigserial, not uuid. Nothing links to a log row and nothing exposes its
--      id in a URL, so there is no enumeration risk, and monotonic ids make
--      "everything since X" a cheap index scan.
--
--   2. (entity_table text, entity_id uuid) — the generic pattern banned
--      everywhere else. An audit row must outlive the record it describes,
--      so a real FK would be wrong: it would either block archival or cascade
--      away the evidence.
--
-- Written only by the log_activity() trigger, which is SECURITY DEFINER.
-- Users have no insert, update or delete policy: the audited party cannot
-- edit the audit trail.
-- ---------------------------------------------------------------------------

create table activity_log (
  id           bigint primary key generated always as identity,
  actor_id     uuid references profiles(id),
  action       text not null,
  entity_table text not null,
  entity_id    uuid,
  diff         jsonb,
  created_at   timestamptz not null default now()
);

create index activity_log_entity_idx on activity_log (entity_table, entity_id, created_at desc);
create index activity_log_actor_idx on activity_log (actor_id, created_at desc);
create index activity_log_created_at_idx on activity_log (created_at desc);
