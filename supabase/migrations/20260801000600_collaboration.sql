-- MICHI 0600 — tasks, content, resources

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  description text,
  status_code text not null default 'todo' references task_statuses(code),
  priority    smallint not null default 3 check (priority between 1 and 5),
  assignee_id uuid references profiles(id),
  created_by  uuid references profiles(id),
  due_on      date,
  completed_at timestamptz,
  parent_id   uuid references tasks(id),
  tags        text[] not null default '{}',

  -- Optional context. At most one, so a task belongs to one thing on a board.
  vendor_id   uuid references vendors(id),
  batch_id    uuid references batches(id),
  contract_id uuid,          -- FK added in 0700, after contracts exists
  content_id  uuid,          -- FK added below, after content_items exists

  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,

  constraint tasks_one_context
    check (num_nonnulls(vendor_id, batch_id, contract_id, content_id) <= 1)
);

comment on constraint tasks_one_context on tasks is
  'At most one context FK. The first draft documented this rule but did not enforce it.';

create index tasks_status_code_idx on tasks (status_code);
create index tasks_assignee_id_idx on tasks (assignee_id);
create index tasks_created_by_idx on tasks (created_by);
create index tasks_parent_id_idx on tasks (parent_id);
create index tasks_due_on_idx on tasks (due_on) where archived_at is null;
create index tasks_vendor_id_idx on tasks (vendor_id) where vendor_id is not null;
create index tasks_batch_id_idx on tasks (batch_id) where batch_id is not null;
create index tasks_tags_gin on tasks using gin (tags);

create table content_items (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) > 0),
  type_code       text not null references content_types(code),
  status_code     text not null default 'draft' references content_statuses(code),
  channel_code    text references sales_channels(code),
  author_id       uuid references profiles(id),
  reviewer_id     uuid references profiles(id),
  batch_id        uuid references batches(id),
  style_id        uuid references styles(id),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  published_url   text,
  current_version int not null default 0 check (current_version >= 0),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

-- default 0, not 1: a freshly created item has no versions yet, and claiming
-- version 1 exists makes every "fetch current version" query return nothing
-- with no way to tell that apart from a bug.
comment on column content_items.current_version is
  'Maintained by trigger from content_versions. 0 means no version written yet. Do not set by hand.';

create index content_items_status_code_idx on content_items (status_code);
create index content_items_type_code_idx on content_items (type_code);
create index content_items_author_id_idx on content_items (author_id);
create index content_items_reviewer_id_idx on content_items (reviewer_id);
create index content_items_batch_id_idx on content_items (batch_id) where batch_id is not null;
create index content_items_style_id_idx on content_items (style_id) where style_id is not null;
create index content_items_scheduled_idx on content_items (scheduled_for)
  where scheduled_for is not null and archived_at is null;

alter table tasks add constraint tasks_content_id_fkey
  foreign key (content_id) references content_items(id);
create index tasks_content_id_idx on tasks (content_id) where content_id is not null;

-- Immutable. Editing content means writing a new version, which is the whole
-- point of the table. Enforced by trigger in 0900, not just by comment.
create table content_versions (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references content_items(id) on delete cascade,
  version_no  int not null check (version_no > 0),
  body        text,
  body_format text not null default 'markdown'
                check (body_format in ('markdown', 'html', 'plain')),
  asset_path  text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (content_id, version_no)
);

comment on table content_versions is
  'Append-only. No updated_at or archived_at by design: a version that can be edited or hidden is not a version. This is a deliberate exception to the timestamp convention.';

create index content_versions_content_id_idx on content_versions (content_id, version_no desc);

create table content_reviews (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null,
  version_no  int not null,
  reviewer_id uuid not null references profiles(id),
  decision    text not null check (decision in ('approved', 'changes_requested')),
  comment     text,
  created_at  timestamptz not null default now(),
  -- Composite FK, free because of the unique on content_versions: you cannot
  -- approve a version that does not exist.
  constraint content_reviews_version_fk
    foreign key (content_id, version_no)
    references content_versions (content_id, version_no) on delete cascade
);

create index content_reviews_content_idx on content_reviews (content_id, version_no);
create index content_reviews_reviewer_idx on content_reviews (reviewer_id);

create table resources (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  type_code     text not null references resource_types(code),
  storage_path  text,
  external_url  text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  tags          text[] not null default '{}',
  vendor_id     uuid references vendors(id),
  style_id      uuid references styles(id),
  batch_id      uuid references batches(id),
  uploaded_by   uuid references profiles(id),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint resources_has_location
    check (storage_path is not null or external_url is not null)
);

comment on column resources.storage_path is
  'Path in the Supabase Storage bucket. Storage has its own RLS on storage.objects; see 1100_rls.sql. Gating this row does not gate the file.';

create index resources_type_code_idx on resources (type_code);
create index resources_tags_gin on resources using gin (tags);
create index resources_vendor_id_idx on resources (vendor_id) where vendor_id is not null;
create index resources_batch_id_idx on resources (batch_id) where batch_id is not null;

-- Full-text search. "Maintain resources" is only useful if you can find them.
--
-- Tags are deliberately not folded into this vector: array_to_string() is
-- STABLE, not IMMUTABLE, so Postgres rejects it in a generated column. Tag
-- filtering is a different operation anyway — use `tags && array['linen']`
-- against resources_tags_gin, and combine the two in the query.
alter table resources add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index resources_search_idx on resources using gin (search_tsv);
