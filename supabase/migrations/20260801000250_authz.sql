-- MICHI 0250 — authorisation helpers
--
-- These live after identity, not in foundation: a `language sql` function body
-- is parsed and validated at CREATE time, so they cannot be defined before
-- profiles and user_roles exist.

-- ---------------------------------------------------------------------------
-- Authorisation helpers
--
-- SECURITY DEFINER so they can read profiles/user_roles without tripping the
-- RLS policies that are themselves defined in terms of these functions.
-- That is not a loophole, it is the standard way to break the recursion: the
-- function is owned by postgres, and postgres owns profiles, so the read
-- inside the function bypasses RLS.
--
-- WARNING: `alter table profiles force row level security` would defeat this
-- and make every query on every table fail. Do not run it.
--
-- search_path is pinned so a caller cannot shadow `profiles` with a temp table.
-- ---------------------------------------------------------------------------

create or replace function app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role_code
    from profiles p
   where p.id = auth.uid()
     and p.archived_at is null
$$;

create or replace function app_can_write()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select ur.can_write
      from profiles p
      join user_roles ur on ur.code = p.role_code
     where p.id = auth.uid()
       and p.archived_at is null
  ), false)
$$;

create or replace function app_can_see_financials()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select ur.can_see_financials
      from profiles p
      join user_roles ur on ur.code = p.role_code
     where p.id = auth.uid()
       and p.archived_at is null
  ), false)
$$;

-- Admin is a separate axis from can_write. It gates the tables that define
-- authorisation itself (user_roles, other people's profiles), so that a
-- collaborator cannot grant themselves financial access.
create or replace function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select ur.is_admin
      from profiles p
      join user_roles ur on ur.code = p.role_code
     where p.id = auth.uid()
       and p.archived_at is null
  ), false)
$$;

comment on function app_can_write is 'True if the current user''s role may create/update records.';
comment on function app_can_see_financials is 'True if the current user may read contracts, bills, transactions and margin.';
comment on function app_is_admin is 'True if the current user may change roles and role definitions.';
