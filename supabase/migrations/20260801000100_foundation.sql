-- MICHI 0100 — foundation
-- Extensions, shared helper functions, and the guard triggers that enforce
-- the conventions in docs/SCHEMA.md. Nothing in here creates a domain table.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Guards
--
-- The schema promises "never hard-DELETE" and "content versions are immutable".
-- Those promises are enforced here rather than left to convention. RLS already
-- withholds DELETE from users; these triggers also stop server-side code
-- running under the service role from doing it by accident.
-- ---------------------------------------------------------------------------

create or replace function block_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'hard delete is not allowed on %; set archived_at instead', tg_table_name
    using errcode = 'restrict_violation';
end
$$;

create or replace function block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% rows are immutable (attempted %)', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end
$$;
