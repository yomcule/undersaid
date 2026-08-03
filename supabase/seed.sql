-- Local development seed. Applied automatically by `supabase db reset`.
-- Never run against production.

-- Local sign-in identities. No password is set: locally you sign in by magic
-- link, caught by Mailpit at http://127.0.0.1:54324 rather than sent anywhere.
--
-- Every account must be invited first — handle_new_user() rejects any email
-- absent from invited_emails, which is what stops a stray Google account from
-- signing itself in once OAuth is live.
insert into invited_emails (email, role_code, note) values
  ('owner@michi.test',   'founder',     'local test — founder'),
  ('shooter@michi.test', 'contributor', 'local test — the financial gate');

-- GoTrue scans the token columns into Go strings, so they must be '' and never
-- NULL, or every sign-in fails with "converting NULL to string is unsupported".
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at, email_confirmed_at,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change,
                        email_change_token_current, reauthentication_token)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'owner@michi.test',
  '{"full_name":"Michi Owner"}',
  now(), now(), now(), '', '', '', '', '', ''
),
(
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'shooter@michi.test',
  '{"full_name":"Freelance Photographer"}',
  now(), now(), now(), '', '', '', '', '', ''
);

-- No promotion step needed: handle_new_user() reads each role off the
-- invitation, so both profiles already exist at the right level.

-- ---------------------------------------------------------------------------
-- The spine
-- ---------------------------------------------------------------------------

insert into vendors (id, name, type_code, cluster, contact_name, payment_terms_days, lead_time_days, gstin) values
  ('a0000000-0000-0000-0000-000000000001','Bhiwandi Handloom Co-op','weaver','Bhiwandi','Rafiq Ansari',30,45,'27AABCU9603R1ZM'),
  ('a0000000-0000-0000-0000-000000000002','Sunrise CMT Unit','tailor','Dharavi','Priya Nair',15,21,null),
  ('a0000000-0000-0000-0000-000000000003','Erode Dyeing Works','dyer','Erode','S. Kumar',45,30,null),
  ('a0000000-0000-0000-0000-000000000004','Trims & Co','trims','Mumbai','Anil Shah',30,10,null);

insert into fabric_lots (id, lot_code, vendor_id, fibre, composition, weave, gsm, width_cm,
                         colour_name, colour_hex, metres_ordered, metres_received,
                         cost_per_metre, shrinkage_pct, received_on) values
  ('b0000000-0000-0000-0000-000000000001','LOT-2026-001','a0000000-0000-0000-0000-000000000001',
   'Cotton','100% Handloom Cotton','Plain', 140, 112, 'Undyed Kora','#f4efe6', 200, 196, 320.00, 3.5, current_date - 90),
  ('b0000000-0000-0000-0000-000000000002','LOT-2026-002','a0000000-0000-0000-0000-000000000001',
   'Cotton','100% Handloom Cotton','Oxford', 165, 110, 'Indigo','#2c3a4f', 150, 150, 385.00, 4.0, current_date - 60),
  ('b0000000-0000-0000-0000-000000000003','LOT-2026-003','a0000000-0000-0000-0000-000000000003',
   'Linen','60% Linen 40% Cotton','Chambray', 130, 114, 'Madder','#7a4a3c', 120, 118, 445.00, 5.0, current_date - 20);

insert into styles (id, style_code, name, description, collar_type, cuff_type, fit, target_price) values
  ('c0000000-0000-0000-0000-000000000001','ST-OXF','The Oxford','Button-down in handloom oxford.','Button-down','Single button','Regular', 3200),
  ('c0000000-0000-0000-0000-000000000002','ST-KORA','The Kora','Undyed everyday shirt.','Spread','Single button','Relaxed', 2800);

insert into style_sizes (style_id, size_code, sort_order)
select s.id, sz.code, sz.sort_order
  from styles s cross join sizes sz
 where sz.scale = 'chest' and sz.code in ('38','40','42','44','46');

insert into batches (id, batch_code, style_id, tailor_vendor_id, status_code,
                     cut_on, expected_ready_on, ready_on, cmt_cost_per_unit, aql_level) values
  ('d0000000-0000-0000-0000-000000000001','B-2026-001','c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002','selling', current_date - 70, current_date - 45, current_date - 42, 480, '2.5'),
  ('d0000000-0000-0000-0000-000000000002','B-2026-002','c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002','selling', current_date - 50, current_date - 28, current_date - 30, 430, '2.5'),
  ('d0000000-0000-0000-0000-000000000003','B-2026-003','c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002','in_production', current_date - 10, current_date + 12, null, 495, '2.5');

insert into batch_sizes (batch_id, size_code, units_planned, units_produced, units_rejected) values
  ('d0000000-0000-0000-0000-000000000001','38', 8,  8, 0),
  ('d0000000-0000-0000-0000-000000000001','40', 14, 13, 1),
  ('d0000000-0000-0000-0000-000000000001','42', 16, 15, 2),
  ('d0000000-0000-0000-0000-000000000001','44', 10, 10, 0),
  ('d0000000-0000-0000-0000-000000000001','46', 6,  5, 1),
  ('d0000000-0000-0000-0000-000000000002','40', 12, 12, 0),
  ('d0000000-0000-0000-0000-000000000002','42', 18, 17, 1),
  ('d0000000-0000-0000-0000-000000000002','44', 12, 12, 0),
  ('d0000000-0000-0000-0000-000000000003','40', 15, 0, 0),
  ('d0000000-0000-0000-0000-000000000003','42', 20, 0, 0),
  ('d0000000-0000-0000-0000-000000000003','44', 15, 0, 0);

-- 1.6 m per shirt, so batch 001 (54 cut) consumed ~86 m of the indigo lot.
insert into batch_fabric_usage (batch_id, fabric_lot_id, metres_used) values
  ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002', 86.4),
  ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001', 67.2),
  ('d0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001', 80.0);

-- ---------------------------------------------------------------------------
-- Sales. Orders are the source of truth for units sold.
-- ---------------------------------------------------------------------------

do $$
declare
  v_order uuid;
  v_line  uuid;
  i int;
  sizes text[] := array['38','40','42','44','46'];
  s text;
  qty int;
  price numeric;
begin
  for i in 1..14 loop
    v_order := gen_random_uuid();
    insert into orders (id, order_ref, channel_code, status_code, placed_at,
                        customer_name, shipping_city, shipping_state, tax_amount)
    values (v_order, '#' || (1000 + i)::text,
            case when i % 4 = 0 then 'whatsapp' else 'shopify' end,
            case when i = 13 then 'cancelled' when i = 14 then 'pending' else 'fulfilled' end,
            now() - (i * 4 || ' days')::interval,
            'Customer ' || i, 'Mumbai', 'MH', 0);

    s := sizes[1 + (i % 5)];
    qty := 1 + (i % 2);
    price := case when i % 3 = 0 then 2800 else 3200 end;

    -- Alternate between the two selling batches, honouring what each cut.
    if i % 2 = 0 then
      if s = '38' or s = '46' then s := '42'; end if;
      insert into order_lines (id, order_id, batch_id, size_code, quantity, unit_price)
      values (gen_random_uuid(), v_order, 'd0000000-0000-0000-0000-000000000002', s, qty, price);
    else
      insert into order_lines (id, order_id, batch_id, size_code, quantity, unit_price)
      values (gen_random_uuid(), v_order, 'd0000000-0000-0000-0000-000000000001', s, qty, price);
    end if;
  end loop;
end
$$;

-- A few returns, including two that are not defects at all.
with ranked as (
  -- Deterministic: created_at alone ties across every row in one statement,
  -- so the offsets collided and one line was returned twice.
  select id, row_number() over (order by id) as n
    from order_lines
   where archived_at is null
),
picks (n, reason, resell, days) as (
  values (1, 'seam_puckering',  false, 12),
         (2, 'measurement_off', false,  9),
         (3, 'changed_mind',    true,   6),
         (4, 'fit_preference',  true,   3)
)
insert into return_items (order_line_id, quantity, reason_code, is_resellable, returned_on)
select r.id, 1, p.reason, p.resell, current_date - p.days
  from picks p join ranked r on r.n = p.n;

-- ---------------------------------------------------------------------------
-- Money. Amounts are tax-exclusive; GST sits in tax_amount.
-- ---------------------------------------------------------------------------

insert into vendor_bills (id, vendor_id, bill_no, status_code, issued_on, amount, tax_amount) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','BHW-1183','approved', current_date - 55, 57750, 2887.50),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','SUN-0441','part_paid', current_date - 38, 25920, 4665.60),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','ERD-0912','approved', current_date - 12, 52510, 2625.50);

insert into transactions (occurred_on, category_code, description, amount, tax_amount,
                          vendor_id, vendor_bill_id, fabric_lot_id) values
  (current_date - 50,'fabric','Indigo oxford lot', 57750, 2887.50,
   'a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');

insert into transactions (occurred_on, category_code, description, amount, tax_amount,
                          vendor_id, vendor_bill_id, batch_id) values
  (current_date - 30,'cmt','CMT batch 001 (part payment)', 12960, 2332.80,
   'a0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001'),
  (current_date - 25,'cmt','CMT batch 002', 17630, 3173.40,
   'a0000000-0000-0000-0000-000000000002', null,'d0000000-0000-0000-0000-000000000002');

insert into transactions (occurred_on, category_code, description, amount, tax_amount, batch_id) values
  (current_date - 28,'trims','Buttons and labels, batch 001', 2160, 388.80,'d0000000-0000-0000-0000-000000000001'),
  (current_date - 20,'packaging','Cotton bags and boxes', 4400, 792.00, null),
  (current_date - 15,'photography','Lookbook shoot', 18000, 3240.00, null),
  (current_date - 8, 'marketing','Instagram promotion', 6000, 1080.00, null);

insert into contracts (id, title, type_code, status_code, vendor_id, counterparty_name,
                       effective_on, expires_on,
                       notice_period_days, auto_renews, value_amount, owner_id) values
  ('f0000000-0000-0000-0000-000000000001','Handloom supply agreement','supply','active',
   'a0000000-0000-0000-0000-000000000001', null, current_date - 300, current_date + 45, 30, true, 1200000,
   '11111111-1111-1111-1111-111111111111'),
  ('f0000000-0000-0000-0000-000000000002','CMT job work rate card','job_work','active',
   'a0000000-0000-0000-0000-000000000002', null, current_date - 180, current_date + 110, 15, false, 600000,
   '11111111-1111-1111-1111-111111111111'),
  ('f0000000-0000-0000-0000-000000000003','Studio NDA','nda','signed',
   null, 'Aperture Studio', current_date - 60, current_date + 400, null, false, null,
   '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Collaboration
-- ---------------------------------------------------------------------------

insert into tasks (title, description, status_code, priority, assignee_id, created_by, due_on, batch_id) values
  ('Approve QC report for B-2026-001','4 rejects across 40s and 42s — check the seam issue with Sunrise.',
   'in_review', 2, '11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',
   current_date - 2, 'd0000000-0000-0000-0000-000000000001'),
  ('Shoot Batch 002 on the roof','Raking side light, late afternoon. Macro weave shot is the priority.',
   'todo', 2, '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
   current_date + 3, 'd0000000-0000-0000-0000-000000000002');

insert into tasks (title, status_code, priority, created_by, due_on, vendor_id) values
  ('Chase Erode on dye lot consistency','todo', 3,'11111111-1111-1111-1111-111111111111',
   current_date + 6, 'a0000000-0000-0000-0000-000000000003');

insert into tasks (title, status_code, priority, created_by, due_on, contract_id) values
  ('Decide on handloom supply renewal','todo', 1,'11111111-1111-1111-1111-111111111111',
   current_date + 10, 'f0000000-0000-0000-0000-000000000001');

insert into tasks (title, status_code, priority, created_by, due_on) values
  ('Run trademark search, Class 25','todo', 1,'11111111-1111-1111-1111-111111111111', current_date + 1),
  ('Order paper samples from two printers','todo', 4,'11111111-1111-1111-1111-111111111111', current_date + 14),
  ('Write care card copy','in_progress', 3,'11111111-1111-1111-1111-111111111111', current_date + 8);

insert into content_items (id, title, type_code, status_code, channel_code, author_id, reviewer_id, batch_id) values
  ('10000000-0000-0000-0000-000000000001','Oxford product page copy','product_copy','in_review','shopify',
   '11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000001');

insert into content_versions (content_id, body, created_by) values
  ('10000000-0000-0000-0000-000000000001','Woven on a pit loom in Bhiwandi. 165 gsm oxford, undyed.',
   '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000001','Woven on a pit loom in Bhiwandi, cut to a regular fit. 165 gsm.',
   '11111111-1111-1111-1111-111111111111');

insert into comments (author_id, body, batch_id) values
  ('11111111-1111-1111-1111-111111111111','Seam puckering on the 42s — worth a conversation before the next run.',
   'd0000000-0000-0000-0000-000000000001');

insert into comments (author_id, body, contract_id) values
  ('11111111-1111-1111-1111-111111111111','They opened at 14L, settled at 12L. Do not go above 12.5 on renewal.',
   'f0000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Returns desk: one at each stage, so the queue shows the whole workflow.
-- ---------------------------------------------------------------------------

with ranked as (
  select id, row_number() over (order by id) as n from return_items
)
update return_items ri set
  status_code      = v.status,
  repair_vendor_id = v.vendor,
  repair_cost      = v.cost,
  repair_notes     = v.notes
from (values
  (1, 'repairing',   'a0000000-0000-0000-0000-000000000002'::uuid, 180.00,
      'Reinforce side seam, press and re-fold.'),
  (2, 'inspecting',  null::uuid, null::numeric, null),
  (3, 'restocked',   null::uuid, null::numeric, null),
  (4, 'refunded',    null::uuid, null::numeric, null)
) as v(n, status, vendor, cost, notes)
join ranked r on r.n = v.n
where ri.id = r.id;

-- ---------------------------------------------------------------------------
-- Logistics: who is chasing what.
-- ---------------------------------------------------------------------------

update batches set tracked_by = '11111111-1111-1111-1111-111111111111'
 where batch_code in ('B-2026-003');

insert into shipments (reference, leg_code, status_code, carrier_vendor_id, carrier_name,
                       tracking_ref, tracked_by, origin, destination,
                       dispatched_on, expected_on, units, batch_id, fabric_lot_id, notes) values
  ('SHP-0007','to_tailor','in_transit', null, 'Local tempo',
   'TMP-4471','11111111-1111-1111-1111-111111111111','Bhiwandi','Dharavi',
   current_date - 3, current_date + 1, 80,
   'd0000000-0000-0000-0000-000000000003', null, 'Cut fabric for the third run.'),
  ('SHP-0008','fabric_in','delayed', null, 'Weaver''s own transport',
   'BHW-DEL-22','22222222-2222-2222-2222-222222222222','Bhiwandi','Studio',
   current_date - 12, current_date - 4, null,
   null, 'b0000000-0000-0000-0000-000000000003', 'Chased twice. Dyer ran late on the madder lot.');

insert into shipments (reference, leg_code, status_code, carrier_name, tracking_ref,
                       tracked_by, origin, destination, dispatched_on, expected_on,
                       units, order_id, notes)
select 'SHP-0009','to_customer','in_transit','Delhivery','DL' || (7700000 + row_number() over (order by o.placed_at))::text,
       '11111111-1111-1111-1111-111111111111','Studio', o.shipping_city,
       current_date - 1, current_date + 2, 1, o.id, null
  from orders o
 where o.status_code = 'pending'
 limit 1;
