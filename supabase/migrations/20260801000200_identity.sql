-- MICHI 0200 — identity and authorisation
--
-- user_roles is NOT an ordinary lookup table. It is the authorisation policy
-- stored as data: editing a row here changes what people can do. It therefore
-- gets admin-only writes, unlike vendor_types or task_statuses.

create table user_roles (
  code               text primary key,
  label              text not null,
  can_write          boolean not null default false,
  can_see_financials boolean not null default false,
  is_admin           boolean not null default false,
  sort_order         int not null default 0
);

comment on table user_roles is
  'Authorisation policy. Admin-only writes. Adding a row grants nothing until a profile references it.';

insert into user_roles (code, label, can_write, can_see_financials, is_admin, sort_order) values
  ('owner',        'Owner',        true,  true,  true,  1),
  ('collaborator', 'Collaborator', true,  true,  false, 2),
  ('contributor',  'Contributor',  true,  false, false, 3),
  ('viewer',       'Viewer',       false, false, false, 4);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role_code   text not null default 'viewer' references user_roles(code),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- The email lives in auth.users and is not duplicated here; join or use the
-- JWT claim. Duplicating it creates two sources of truth for the login
-- identity and a second thing to keep in sync on email change.

comment on column profiles.role_code is
  'Only an admin may change this column; see the profiles RLS policies.';

-- New default is 'viewer', not 'collaborator': a freshly signed-up account
-- should be able to see nothing sensitive and write nothing until promoted.

create index profiles_role_code_idx on profiles (role_code);
create index profiles_active_idx on profiles (id) where archived_at is null;
