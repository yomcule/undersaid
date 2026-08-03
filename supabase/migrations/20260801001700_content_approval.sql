-- MICHI 1700 — content approval, enforced
--
-- The statuses for a review workflow already existed, but nothing held them
-- to it: any status could jump to any other, and 'published' was reachable
-- from 'draft' without a review ever happening.
--
-- The hole that actually matters is subtler. Approve version 2, let the
-- author edit to version 3, and the item is still marked approved — so what
-- ships is a version nobody reviewed. Approval has to be *of a version*, not
-- of an item.

alter table content_items
  add column approved_version int check (approved_version is null or approved_version > 0),
  add column approved_by      uuid references profiles(id),
  add column approved_at      timestamptz;

comment on column content_items.approved_version is
  'Which version was signed off. Cleared automatically when a newer version lands, because approval does not carry forward to text nobody has read.';

-- ---------------------------------------------------------------------------
-- A new version invalidates approval
-- ---------------------------------------------------------------------------

create or replace function set_content_version_no()
returns trigger language plpgsql as $$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1 into new.version_no
      from content_versions where content_id = new.content_id;
  end if;

  update content_items
     set current_version = greatest(current_version, new.version_no),
         -- Any approval on record is now stale: it referred to older text.
         -- Send it back to draft rather than leaving a green light on.
         status_code = case
           when status_code in ('approved', 'scheduled') then 'draft'
           else status_code
         end,
         approved_version = null,
         approved_by      = null,
         approved_at      = null
   where id = new.content_id;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Legal transitions
-- ---------------------------------------------------------------------------

create table content_transitions (
  from_code text not null references content_statuses(code),
  to_code   text not null references content_statuses(code),
  primary key (from_code, to_code)
);

insert into content_transitions (from_code, to_code) values
  ('draft','in_review'),             ('draft','archived'),
  ('in_review','changes_requested'), ('in_review','approved'),
  ('in_review','draft'),             ('in_review','archived'),
  ('changes_requested','in_review'), ('changes_requested','draft'),
  ('changes_requested','archived'),
  ('approved','scheduled'),          ('approved','published'),
  ('approved','changes_requested'),  ('approved','draft'),
  ('approved','archived'),
  ('scheduled','published'),         ('scheduled','approved'),
  ('scheduled','draft'),             ('scheduled','archived'),
  ('published','archived'),
  ('archived','draft');

create or replace function guard_content_status()
returns trigger language plpgsql as $$
begin
  if new.status_code = old.status_code then
    return new;
  end if;

  if not exists (
    select 1 from content_transitions
     where from_code = old.status_code and to_code = new.status_code
  ) then
    raise exception 'cannot move content from % to %', old.status_code, new.status_code
      using errcode = 'check_violation';
  end if;

  -- Publishing or scheduling requires that the *current* version is the one
  -- that was approved. This is the check the stale-approval bug defeats.
  if new.status_code in ('scheduled', 'published')
     and (new.approved_version is null
          or new.approved_version <> new.current_version) then
    raise exception
      'version % is not approved (approved: %)',
      new.current_version, coalesce(new.approved_version::text, 'none')
      using errcode = 'check_violation';
  end if;

  if new.status_code = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end
$$;

create trigger trg_content_status_guard
  before update of status_code on content_items
  for each row execute function guard_content_status();

-- ---------------------------------------------------------------------------
-- Recording a review drives the status
--
-- Doing this in a trigger means a review and the status it implies cannot
-- disagree — there is no path where someone approves and forgets to move it.
-- ---------------------------------------------------------------------------

create or replace function apply_content_review()
returns trigger language plpgsql as $$
begin
  if new.decision = 'approved' then
    update content_items
       set status_code      = 'approved',
           approved_version = new.version_no,
           approved_by      = new.reviewer_id,
           approved_at      = now()
     where id = new.content_id
       and current_version = new.version_no;

    if not found then
      raise exception 'cannot approve version % — it is not the current version',
        new.version_no using errcode = 'check_violation';
    end if;
  else
    update content_items
       set status_code      = 'changes_requested',
           approved_version = null,
           approved_by      = null,
           approved_at      = null
     where id = new.content_id;
  end if;

  return new;
end
$$;

create trigger trg_apply_content_review
  after insert on content_reviews
  for each row execute function apply_content_review();

-- content_reviews is already immutable (0900): a review is a record of a
-- moment, and you disagree with it by adding another review.

-- ---------------------------------------------------------------------------
-- The review queue
-- ---------------------------------------------------------------------------

create view v_content with (security_invoker = on) as
select
  ci.id,
  ci.title,
  ci.type_code,
  ct.label            as type_label,
  ci.status_code,
  cs.label            as status_label,
  cs.is_published,
  cs.sort_order       as status_sort,
  ci.channel_code,
  ci.author_id,
  pa.full_name        as author_name,
  ci.reviewer_id,
  pr.full_name        as reviewer_name,
  ci.current_version,
  ci.approved_version,
  ci.approved_at,
  pv.full_name        as approved_by_name,
  -- The signal the whole migration exists for.
  (ci.approved_version is not null
   and ci.approved_version <> ci.current_version) as approval_is_stale,
  ci.scheduled_for,
  ci.published_at,
  ci.published_url,
  ci.batch_id,
  b.batch_code,
  ci.style_id,
  st.style_code,
  cv.body             as current_body,
  cv.body_format,
  cv.created_at       as version_created_at,
  (select count(*) from content_reviews r where r.content_id = ci.id) as review_count,
  ci.created_at,
  ci.updated_at
from content_items ci
join content_types ct    on ct.code = ci.type_code
join content_statuses cs on cs.code = ci.status_code
left join profiles pa on pa.id = ci.author_id
left join profiles pr on pr.id = ci.reviewer_id
left join profiles pv on pv.id = ci.approved_by
left join batches b   on b.id = ci.batch_id
left join styles st   on st.id = ci.style_id
left join content_versions cv
       on cv.content_id = ci.id and cv.version_no = ci.current_version
where ci.archived_at is null;

grant select on v_content to authenticated;

alter table content_transitions enable row level security;
create policy content_transitions_read on content_transitions
  for select to authenticated using (true);
grant select on content_transitions to authenticated;
