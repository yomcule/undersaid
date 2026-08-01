-- MICHI 1100 — row level security
--
-- Model:
--
--   read   general      any authenticated user
--   read   financial    can_see_financials
--   write  general      can_write
--   write  financial    can_write AND can_see_financials
--   delete NOBODY, ever — there is no DELETE policy on any table, and
--                          block_hard_delete() catches the service role too
--   authz  user_roles and other people's profiles: is_admin only
--
-- The `contributor` role (can_write, no financials) is the test case: a
-- freelancer who can move tasks and draft content but must not be able to
-- see contract values, vendor payables or batch margins — and must not be
-- able to grant themselves that access.

-- ---------------------------------------------------------------------------
-- Baseline privileges
--
-- RLS narrows what a role can reach; it cannot widen it. Start by taking
-- everything away from anon (Michi has no public surface) and granting
-- authenticated exactly select/insert/update — never delete.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update on tables to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. A table with no policy and RLS on denies everything,
-- which is the correct default for anything added later and forgotten.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Lookup tables: everyone reads, writers may add values.
--
-- user_roles is NOT in this list. It is authorisation policy, not a
-- vocabulary — in the first draft a contributor could
-- `update user_roles set can_see_financials = true where code = 'contributor'`
-- and grant themselves the books.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'currencies','sizes','vendor_types','task_statuses','content_statuses',
    'content_types','contract_types','contract_statuses','batch_statuses',
    'resource_types','sales_channels','transaction_kinds',
    'transaction_categories','defect_categories','defect_reasons',
    'order_statuses','bill_statuses'
  ] loop
    execute format($p$
      create policy %1$s_read on public.%1$I
        for select to authenticated using (true);
      create policy %1$s_insert on public.%1$I
        for insert to authenticated with check (app_can_write());
      create policy %1$s_update on public.%1$I
        for update to authenticated using (app_can_write()) with check (app_can_write());
    $p$, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- General entity tables
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'vendors','fabric_lots','styles','style_sizes','batches','batch_sizes',
    'batch_fabric_usage','return_items','tasks','content_items',
    'content_reviews','resources'
  ] loop
    execute format($p$
      create policy %1$s_read on public.%1$I
        for select to authenticated using (true);
      create policy %1$s_insert on public.%1$I
        for insert to authenticated with check (app_can_write());
      create policy %1$s_update on public.%1$I
        for update to authenticated using (app_can_write()) with check (app_can_write());
    $p$, t);
  end loop;
end
$$;

-- content_versions is append-only: insert and select, no update policy.
-- block_mutation() enforces the same rule against the service role.
create policy content_versions_read on content_versions
  for select to authenticated using (true);
create policy content_versions_insert on content_versions
  for insert to authenticated with check (app_can_write());

-- ---------------------------------------------------------------------------
-- Financial tables
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'contracts','vendor_bills','transactions','orders','order_lines'
  ] loop
    execute format($p$
      create policy %1$s_read on public.%1$I
        for select to authenticated using (app_can_see_financials());
      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (app_can_write() and app_can_see_financials());
      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (app_can_write() and app_can_see_financials())
        with check (app_can_write() and app_can_see_financials());
    $p$, t);
  end loop;
end
$$;

-- Orders carry unit prices and revenue, so they sit behind the financial
-- gate. Consequence: v_batch_size_inventory returns produced-but-unsold
-- counts only for financial users. A contributor sees batches and sizes but
-- not what they sold for. That is the intended trade.

-- ---------------------------------------------------------------------------
-- profiles and user_roles
-- ---------------------------------------------------------------------------

create policy profiles_read on profiles
  for select to authenticated using (true);

create policy profiles_insert on profiles
  for insert to authenticated with check (app_is_admin());

-- You may edit your own profile; an admin may edit anyone's. Which COLUMNS
-- you may change is enforced by guard_profile_role() below, because a
-- WITH CHECK expression cannot see the pre-update value of role_code.
create policy profiles_update on profiles
  for update to authenticated
  using (id = auth.uid() or app_is_admin())
  with check (id = auth.uid() or app_is_admin());

create or replace function guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null when the statement comes from the SQL editor, a
  -- migration, or the service role — i.e. someone with direct database
  -- access, who can bypass any check here anyway. Without this exemption
  -- there is no way to appoint the FIRST admin: every promotion requires an
  -- admin that does not yet exist.
  if auth.uid() is not null and not app_is_admin() then
    if new.role_code is distinct from old.role_code then
      raise exception 'only an admin may change role_code'
        using errcode = 'insufficient_privilege';
    end if;
    if new.archived_at is distinct from old.archived_at then
      raise exception 'only an admin may archive or restore a profile'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

create trigger trg_profiles_guard_role
  before update on profiles
  for each row execute function guard_profile_role();

-- Do not let the last admin remove their own admin access and lock everyone
-- out of role management.
create or replace function guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admins int;
begin
  select count(*) into v_admins
    from profiles p
    join user_roles ur on ur.code = p.role_code
   where ur.is_admin
     and p.archived_at is null;

  if v_admins = 0 then
    raise exception 'this change would leave Michi with no admin'
      using errcode = 'restrict_violation';
  end if;

  return null;
end
$$;

create constraint trigger trg_profiles_last_admin
  after update or delete on profiles
  deferrable initially deferred
  for each row execute function guard_last_admin();

create constraint trigger trg_user_roles_last_admin
  after update on user_roles
  deferrable initially deferred
  for each row execute function guard_last_admin();

create policy user_roles_read on user_roles
  for select to authenticated using (true);
create policy user_roles_insert on user_roles
  for insert to authenticated with check (app_is_admin());
create policy user_roles_update on user_roles
  for update to authenticated using (app_is_admin()) with check (app_is_admin());

-- ---------------------------------------------------------------------------
-- Comments and attachments
--
-- These tables can point at a contract, a bill or a transaction. Reading
-- "vendor wants 12L for this order, pushed back to 9.5L" or the filename
-- `TATA-invoice-Mar-2026.pdf` leaks the financials the role gate exists to
-- protect, so rows attached to a financial record inherit that gate.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['comments','attachments'] loop
    execute format($p$
      create policy %1$s_read on public.%1$I
        for select to authenticated
        using (
          case
            when contract_id is not null
              or vendor_bill_id is not null
              or transaction_id is not null
            then app_can_see_financials()
            else true
          end
        );

      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (
          app_can_write() and case
            when contract_id is not null
              or vendor_bill_id is not null
              or transaction_id is not null
            then app_can_see_financials()
            else true
          end
        );

      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (
          app_can_write() and case
            when contract_id is not null
              or vendor_bill_id is not null
              or transaction_id is not null
            then app_can_see_financials()
            else true
          end
        )
        with check (
          app_can_write() and case
            when contract_id is not null
              or vendor_bill_id is not null
              or transaction_id is not null
            then app_can_see_financials()
            else true
          end
        );
    $p$, t);
  end loop;
end
$$;

-- Editing someone else's comment is not a thing. Authorship is checked in a
-- trigger rather than the policy so the message is legible.
create or replace function guard_comment_author()
returns trigger
language plpgsql
as $$
begin
  -- Same exemption as guard_profile_role: null uid means direct DB access.
  if auth.uid() is not null
     and old.author_id is distinct from auth.uid()
     and old.body is distinct from new.body then
    raise exception 'you can only edit your own comments'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger trg_comments_guard_author
  before update on comments
  for each row execute function guard_comment_author();

-- ---------------------------------------------------------------------------
-- Activity log — readable, never writable by users.
--
-- No insert/update/delete policy exists, so PostgREST cannot write it. Rows
-- arrive only through log_activity(), which is SECURITY DEFINER and therefore
-- bypasses this table's RLS.
--
-- Diffs of financial tables contain amounts, so they inherit the gate.
-- ---------------------------------------------------------------------------

create policy activity_log_read on activity_log
  for select to authenticated
  using (
    case
      when entity_table in ('contracts', 'vendor_bills', 'transactions', 'orders', 'order_lines')
      then app_can_see_financials()
      else true
    end
  );

revoke insert, update on activity_log from authenticated;

-- ---------------------------------------------------------------------------
-- Supabase Storage
--
-- storage.objects has its OWN row level security. Gating the `resources` or
-- `attachments` row does nothing to the file behind storage_path — anyone
-- with the path could fetch it. Path prefix decides the gate.
--
--   michi/contracts/**      financial
--   michi/bills/**          financial
--   michi/transactions/**   financial
--   michi/**                everything else: any authenticated user
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('michi', 'michi', false)
on conflict (id) do nothing;

create policy michi_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'michi'
    and case
      when (storage.foldername(name))[1] in ('contracts', 'bills', 'transactions')
      then app_can_see_financials()
      else true
    end
  );

create policy michi_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'michi'
    and app_can_write()
    and case
      when (storage.foldername(name))[1] in ('contracts', 'bills', 'transactions')
      then app_can_see_financials()
      else true
    end
  );

create policy michi_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'michi' and app_can_write())
  with check (bucket_id = 'michi' and app_can_write());

-- No storage delete policy: files are orphaned by archiving the row that
-- points at them, not removed. Clean up out of band if it ever matters.
