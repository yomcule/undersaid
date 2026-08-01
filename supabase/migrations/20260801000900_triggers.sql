-- MICHI 0900 — trigger wiring

-- ---------------------------------------------------------------------------
-- updated_at on every table that has the column
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','vendors','fabric_lots','styles','batches','orders','order_lines',
    'return_items','tasks','content_items','resources','contracts','vendor_bills',
    'transactions','comments','attachments'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$I
         for each row execute function set_updated_at()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- No hard deletes on anything that has archived_at
--
-- RLS already withholds DELETE from end users. This also catches server-side
-- code running under the service role, which bypasses RLS entirely.
--
-- profiles is intentionally excluded: deleting an auth.users row must be able
-- to cascade, and any profile with real activity is protected by its inbound
-- foreign keys anyway.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'vendors','fabric_lots','styles','batches','orders','order_lines',
    'return_items','tasks','content_items','resources','contracts',
    'vendor_bills','transactions','comments','attachments'
  ] loop
    execute format(
      'create trigger trg_%1$s_no_delete before delete on %1$I
         for each row execute function block_hard_delete()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Content versioning
-- ---------------------------------------------------------------------------

create or replace function set_content_version_no()
returns trigger
language plpgsql
as $$
begin
  if new.version_no is null then
    -- Lock the parent row so two concurrent inserts cannot read the same max.
    -- Without this the loser fails on the unique constraint rather than
    -- getting the next number.
    perform 1 from content_items where id = new.content_id for update;

    select coalesce(max(version_no), 0) + 1
      into new.version_no
      from content_versions
     where content_id = new.content_id;
  end if;

  return new;
end
$$;

create trigger trg_content_versions_number
  before insert on content_versions
  for each row execute function set_content_version_no();

create or replace function bump_content_current_version()
returns trigger
language plpgsql
as $$
begin
  update content_items
     set current_version = greatest(current_version, new.version_no)
   where id = new.content_id;
  return null;
end
$$;

create trigger trg_content_versions_bump
  after insert on content_versions
  for each row execute function bump_content_current_version();

-- Versions are append-only. Editing content means adding a version.
create trigger trg_content_versions_immutable
  before update or delete on content_versions
  for each row execute function block_mutation();

-- A review records a judgement made at a point in time; it does not change.
create trigger trg_content_reviews_immutable
  before update on content_reviews
  for each row execute function block_mutation();

-- Keep published_at and the published flag from disagreeing.
create or replace function sync_content_published_at()
returns trigger
language plpgsql
as $$
declare
  v_is_published boolean;
begin
  select is_published into v_is_published
    from content_statuses where code = new.status_code;

  if v_is_published and new.published_at is null then
    new.published_at := now();
  elsif not v_is_published then
    new.published_at := null;
  end if;

  return new;
end
$$;

create trigger trg_content_items_published_at
  before insert or update of status_code on content_items
  for each row execute function sync_content_published_at();

-- ---------------------------------------------------------------------------
-- Task completion
-- ---------------------------------------------------------------------------

create or replace function sync_task_completed_at()
returns trigger
language plpgsql
as $$
declare
  v_is_open boolean;
begin
  select is_open into v_is_open from task_statuses where code = new.status_code;

  if not v_is_open and new.completed_at is null then
    new.completed_at := now();
  elsif v_is_open then
    new.completed_at := null;
  end if;

  return new;
end
$$;

create trigger trg_tasks_completed_at
  before insert or update of status_code on tasks
  for each row execute function sync_task_completed_at();

-- ---------------------------------------------------------------------------
-- Audit log
--
-- SECURITY DEFINER: the function is owned by postgres, which owns activity_log,
-- so the insert bypasses the RLS on that table. That is the point — users can
-- read the log but have no policy allowing them to write it.
-- ---------------------------------------------------------------------------

create or replace function log_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_id uuid;
  v_diff      jsonb;
begin
  if tg_op = 'INSERT' then
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_diff      := to_jsonb(new);

  elsif tg_op = 'UPDATE' then
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;

    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_diff
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n on n.key = o.key
     where o.value is distinct from n.value
       and n.key <> 'updated_at';

    -- Nothing of substance changed; do not write a row.
    if v_diff is null then
      return null;
    end if;
  end if;

  insert into activity_log (actor_id, action, entity_table, entity_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, v_entity_id, v_diff);

  return null;
end
$$;

-- Audited tables: the ones where "who changed this and when" is a real
-- question. Comments and attachments are excluded — they are already an
-- append-mostly record of who said what, and logging them doubles the writes.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','vendors','fabric_lots','batches','orders',
    'return_items','contracts','vendor_bills','transactions'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update on %1$I
         for each row execute function log_activity()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Provision a profile when someone signs up
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, full_name, role_code)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    'viewer'          -- deliberately the least privileged role
  )
  on conflict (id) do nothing;

  return new;
end
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
