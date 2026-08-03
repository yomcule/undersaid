-- MICHI 1600 — the inspiration board
--
-- Not the same thing as `resources`. A resource is an asset you own and need
-- to find again: a tech pack, a pattern, an invoice scan. An inspiration is
-- someone else's work you are learning from, and it carries two things a
-- resource never does — a source to credit, and a note saying what you are
-- actually taking from it.
--
-- That note is the point. A board of pretty images with no reasoning becomes
-- a mood board nobody revisits, and quietly turns into a copying instrument.
-- The brand guidelines are explicit that reference is not permission.

create table inspiration_sections (
  code       text primary key,
  label      text not null,
  blurb      text,
  is_active  boolean not null default true,
  sort_order int not null default 0
);

insert into inspiration_sections (code, label, blurb, sort_order) values
  ('product_design', 'Product design',
   'Construction, collars, cuffs, seams — how the garment is made.', 1),
  ('product',        'Product & range',
   'What to make, how a range hangs together, pricing and assortment.', 2),
  ('communication',  'Communication',
   'Voice, copy, campaigns — how other people say things well.', 3),
  ('fabric',         'Fabric & material',
   'Weaves, weights, finishes, colour.', 4),
  ('photography',    'Photography & art direction',
   'Light, styling, how cloth is made to read on a screen.', 5),
  ('packaging',      'Packaging & unboxing',
   'The physical object that arrives.', 6),
  ('retail',         'Retail & space',
   'Shops, stalls, how clothes are shown in person.', 7),
  ('other',          'Other', null, 8);

create table inspirations (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  section_code  text not null references inspiration_sections(code),

  -- Why this is on the board. Not decoration: this is the reason to keep it.
  note          text,

  -- The image, if there is one. Either an uploaded file or a remote URL.
  image_path    text,
  image_url     text,

  -- Where it came from. Credit is not optional in a business whose own
  -- guidelines say never to copy.
  source_url    text,
  source_name   text,

  tags          text[] not null default '{}',
  -- Pinned items lead the section.
  is_pinned     boolean not null default false,

  -- Optional tie back to the spine, when a reference drove a real decision.
  style_id      uuid references styles(id),
  batch_id      uuid references batches(id),

  added_by      uuid references profiles(id),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,

  -- A card with neither a picture nor a link is just a note; those belong on
  -- a task or a comment.
  constraint inspirations_has_content
    check (image_path is not null or image_url is not null or source_url is not null)
);

create index inspirations_section_idx on inspirations (section_code);
create index inspirations_pinned_idx  on inspirations (is_pinned) where is_pinned;
create index inspirations_style_idx   on inspirations (style_id) where style_id is not null;
create index inspirations_batch_idx   on inspirations (batch_id) where batch_id is not null;
create index inspirations_tags_gin    on inspirations using gin (tags);

create trigger trg_inspirations_updated_at
  before update on inspirations
  for each row execute function set_updated_at();

create trigger trg_inspirations_no_delete
  before delete on inspirations
  for each row execute function block_hard_delete();

create view v_inspirations with (security_invoker = on) as
select
  i.id,
  i.title,
  i.section_code,
  s.label       as section_label,
  s.blurb       as section_blurb,
  s.sort_order  as section_sort,
  i.note,
  i.image_path,
  i.image_url,
  i.source_url,
  i.source_name,
  i.tags,
  i.is_pinned,
  i.style_id,
  st.style_code,
  i.batch_id,
  b.batch_code,
  i.added_by,
  p.full_name   as added_by_name,
  i.created_at
from inspirations i
join inspiration_sections s on s.code = i.section_code
left join styles st on st.id = i.style_id
left join batches b on b.id = i.batch_id
left join profiles p on p.id = i.added_by
where i.archived_at is null;

grant select on v_inspirations to authenticated;

-- Inspiration is not financial. Everyone reads it; anyone who can write adds
-- to it — a freelance photographer is exactly who should be pinning
-- references here.
alter table inspirations enable row level security;
create policy inspirations_read on inspirations
  for select to authenticated using (true);
create policy inspirations_insert on inspirations
  for insert to authenticated with check (app_can_write());
create policy inspirations_update on inspirations
  for update to authenticated using (app_can_write()) with check (app_can_write());

grant select, insert, update on inspirations to authenticated;

alter table inspiration_sections enable row level security;
create policy inspiration_sections_read on inspiration_sections
  for select to authenticated using (true);
create policy inspiration_sections_insert on inspiration_sections
  for insert to authenticated with check (app_can_write());
create policy inspiration_sections_update on inspiration_sections
  for update to authenticated using (app_can_write()) with check (app_can_write());

grant select, insert, update on inspiration_sections to authenticated;
