-- MICHI 1200 — Google sign-in, invite allowlist, and the founder role
--
-- Switching to Google OAuth changes the threat model. Magic links were
-- effectively an allowlist already: `shouldCreateUser: false` meant a link
-- only worked for an account someone had already provisioned. OAuth does not
-- work that way — Supabase creates the user on first successful sign-in, so
-- without a gate ANY Google account can sign in and land on the default role.
--
-- The default role is `viewer`, which still reads vendors, fabric lots and
-- cost_per_metre. That is your supplier pricing. Hence the allowlist below:
-- sign-up now fails unless the email was invited first.

-- ---------------------------------------------------------------------------
-- founder replaces owner
--
-- `owner` was a placeholder. Two roles with identical flags is exactly the
-- ambiguity this schema tries to avoid, so this renames rather than adds.
-- ---------------------------------------------------------------------------

insert into user_roles (code, label, can_write, can_see_financials, is_admin, sort_order)
values ('founder', 'Founder', true, true, true, 1)
on conflict (code) do nothing;

update profiles set role_code = 'founder' where role_code = 'owner';
delete from user_roles where code = 'owner';

-- ---------------------------------------------------------------------------
-- Invite allowlist
-- ---------------------------------------------------------------------------

create table invited_emails (
  email       text primary key check (email = lower(btrim(email))),
  role_code   text not null references user_roles(code),
  note        text,
  invited_by  uuid references profiles(id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table invited_emails is
  'Who may create an account, and at what role. An email absent from this table cannot sign in at all — OAuth sign-up is rejected in handle_new_user().';

create trigger trg_invited_emails_updated_at
  before update on invited_emails
  for each row execute function set_updated_at();

alter table invited_emails enable row level security;

-- Admin-only, including reads: the invite list is who has access to the
-- business, and its role column is authorisation data.
create policy invited_emails_read on invited_emails
  for select to authenticated using (app_is_admin());
create policy invited_emails_insert on invited_emails
  for insert to authenticated with check (app_is_admin());
create policy invited_emails_update on invited_emails
  for update to authenticated using (app_is_admin()) with check (app_is_admin());

grant select, insert, update on invited_emails to authenticated;

-- ---------------------------------------------------------------------------
-- Provisioning now consults the allowlist
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(new.email));
  v_role  text;
begin
  select role_code into v_role from invited_emails where email = v_email;

  if v_role is null then
    -- Raising here rolls back the auth.users insert, so no orphan account is
    -- left behind. The user sees a failed sign-in, which is correct: they
    -- were never invited.
    raise exception 'no invitation exists for %', v_email
      using errcode = 'insufficient_privilege',
            hint = 'An admin must add this address to invited_emails first.';
  end if;

  insert into profiles (id, full_name, role_code)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),   -- Google sends `name`
      split_part(v_email, '@', 1)
    ),
    v_role
  )
  on conflict (id) do nothing;

  update invited_emails
     set accepted_at = coalesce(accepted_at, now())
   where email = v_email;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- The two real accounts
--
-- Roles are attached to the invitation, so each person lands on the right
-- role the moment they first sign in with Google — no manual promotion step,
-- and no window where they hold the default role.
-- ---------------------------------------------------------------------------

insert into invited_emails (email, role_code, note) values
  ('shouryamoy@gmail.com',   'founder',      'Shourya'),
  ('amrithapillay@gmail.com','collaborator', 'Amritha')
on conflict (email) do update
  set role_code = excluded.role_code,
      note      = excluded.note;
