-- MICHI 0300 — lookup tables
--
-- Every enumeration in Michi is a table, not a Postgres ENUM. Adding a value
-- is an INSERT that any writer can do from the UI; removing one is setting
-- is_active = false, which preserves history. Seed rows ship with the table.

-- Generic shape: code text pk, label text, sort_order int, is_active boolean.
-- Extra columns carry behaviour the application would otherwise hardcode.

create table currencies (
  code       char(3) primary key,
  label      text not null,
  symbol     text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true
);
insert into currencies (code, label, symbol, sort_order) values
  ('INR', 'Indian Rupee', '₹', 1),
  ('USD', 'US Dollar',    '$', 2),
  ('EUR', 'Euro',         '€', 3),
  ('GBP', 'Pound Sterling','£', 4);

create table sizes (
  code       text primary key,
  label      text not null,
  scale      text not null,           -- 'alpha' | 'neck' | 'chest'
  sort_order int not null default 0,
  is_active  boolean not null default true
);
comment on table sizes is
  'Shared size vocabulary. Replaces styles.size_range text[] so that size is joinable and sales can be tracked per size.';
insert into sizes (code, label, scale, sort_order) values
  ('XS','XS','alpha',1),('S','S','alpha',2),('M','M','alpha',3),
  ('L','L','alpha',4),('XL','XL','alpha',5),('XXL','XXL','alpha',6),
  ('38','38','chest',10),('40','40','chest',11),('42','42','chest',12),
  ('44','44','chest',13),('46','46','chest',14),('48','48','chest',15);

create table vendor_types (
  code text primary key, label text not null,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into vendor_types (code, label, sort_order) values
  ('weaver','Weaver',1),('dyer','Dyer / Processor',2),('mill','Mill',3),
  ('tailor','Tailor / CMT unit',4),('trims','Trims & Buttons',5),
  ('packaging','Packaging',6),('courier','Courier / Logistics',7),
  ('agency','Agency / Freelance',8),('other','Other',9);

create table task_statuses (
  code text primary key, label text not null, is_open boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into task_statuses (code, label, is_open, sort_order) values
  ('todo','To do',true,1),('in_progress','In progress',true,2),
  ('blocked','Blocked',true,3),('in_review','In review',true,4),
  ('done','Done',false,5),('cancelled','Cancelled',false,6);

create table content_statuses (
  code text primary key, label text not null, is_published boolean not null default false,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into content_statuses (code, label, is_published, sort_order) values
  ('draft','Draft',false,1),('in_review','In review',false,2),
  ('changes_requested','Changes requested',false,3),('approved','Approved',false,4),
  ('scheduled','Scheduled',false,5),('published','Published',true,6),
  ('archived','Archived',false,7);

create table content_types (
  code text primary key, label text not null,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into content_types (code, label, sort_order) values
  ('product_copy','Product copy',1),('lookbook','Lookbook',2),
  ('email','Email',3),('social_post','Social post',4),
  ('blog','Blog / Journal',5),('care_label','Care label',6),
  ('photoshoot_brief','Photoshoot brief',7),('other','Other',8);

create table contract_types (
  code text primary key, label text not null,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into contract_types (code, label, sort_order) values
  ('supply','Supply agreement',1),('job_work','Job work / CMT',2),
  ('nda','NDA',3),('lease','Lease',4),('services','Services',5),
  ('employment','Employment / Retainer',6),('other','Other',7);

create table contract_statuses (
  code text primary key, label text not null, is_active_state boolean not null default false,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into contract_statuses (code, label, is_active_state, sort_order) values
  ('draft','Draft',false,1),('under_review','Under review',false,2),
  ('signed','Signed',true,3),('active','Active',true,4),
  ('expired','Expired',false,5),('terminated','Terminated',false,6);

create table batch_statuses (
  code text primary key, label text not null, is_open boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into batch_statuses (code, label, is_open, sort_order) values
  ('planned','Planned',true,1),('fabric_ordered','Fabric ordered',true,2),
  ('fabric_received','Fabric received',true,3),('in_production','In production',true,4),
  ('qc','In QC',true,5),('qc_failed','QC failed',true,6),
  ('ready','Ready',true,7),('selling','Selling',true,8),
  ('sold_out','Sold out',false,9),('written_off','Written off',false,10);

create table resource_types (
  code text primary key, label text not null,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into resource_types (code, label, sort_order) values
  ('tech_pack','Tech pack',1),('pattern','Pattern',2),('swatch','Fabric swatch',3),
  ('photo','Photography',4),('brand_asset','Brand asset',5),
  ('sop','SOP / Process doc',6),('invoice_scan','Invoice scan',7),
  ('certificate','Certificate',8),('other','Other',9);

create table sales_channels (
  code text primary key, label text not null,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into sales_channels (code, label, sort_order) values
  ('shopify','Shopify',1),('whatsapp','WhatsApp',2),('retail','Retail / Popup',3),
  ('wholesale','Wholesale',4),('marketplace','Marketplace',5),('other','Other',6);

create table transaction_kinds (
  code text primary key, label text not null,
  direction smallint not null check (direction in (-1, 1)),
  sort_order int not null default 0, is_active boolean not null default true
);
comment on column transaction_kinds.direction is
  '-1 = money out (cost), +1 = money in (revenue). Amounts are always stored positive.';
insert into transaction_kinds (code, label, direction, sort_order) values
  ('purchase','Purchase / Bill payment',-1,1),
  ('expense','Operating expense',-1,2),
  ('refund_out','Refund to customer',-1,3),
  ('sale','Sale',1,4),
  ('refund_in','Refund from vendor',1,5),
  ('other_income','Other income',1,6);

create table transaction_categories (
  code       text primary key,
  label      text not null,
  kind_code  text not null references transaction_kinds(code),
  sort_order int not null default 0,
  is_active  boolean not null default true
);
insert into transaction_categories (code, label, kind_code, sort_order) values
  ('fabric','Fabric','purchase',1),
  ('cmt','Cut-make-trim','purchase',2),
  ('trims','Trims & buttons','purchase',3),
  ('packaging','Packaging','purchase',4),
  ('freight','Freight & logistics','expense',5),
  ('marketing','Marketing','expense',6),
  ('photography','Photography','expense',7),
  ('software','Software & tools','expense',8),
  ('rent','Rent & utilities','expense',9),
  ('professional','Professional fees','expense',10),
  ('customer_refund','Customer refund','refund_out',11),
  ('product_sale','Product sale','sale',12),
  ('vendor_credit','Vendor credit note','refund_in',13),
  ('other','Other','expense',99);

create table defect_categories (
  code text primary key, label text not null,
  is_defect boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true
);
comment on column defect_categories.is_defect is
  'False for reasons that are not quality failures (fit preference, changed mind). Keeps defect rates honest.';
insert into defect_categories (code, label, is_defect, sort_order) values
  ('fabric','Fabric',true,1),('construction','Construction',true,2),
  ('fit','Fit / Sizing',true,3),('finishing','Finishing',true,4),
  ('logistics','Logistics',true,5),('customer','Customer preference',false,6),
  ('other','Other',true,7);

create table defect_reasons (
  code          text primary key,
  label         text not null,
  category_code text not null references defect_categories(code),
  sort_order    int not null default 0,
  is_active     boolean not null default true
);
insert into defect_reasons (code, label, category_code, sort_order) values
  ('colour_bleed','Colour bleeding','fabric',1),
  ('shrinkage','Shrinkage beyond tolerance','fabric',2),
  ('weave_fault','Weave fault / slub','fabric',3),
  ('hole_tear','Hole or tear','fabric',4),
  ('seam_puckering','Seam puckering','construction',5),
  ('stitch_skip','Skipped stitches','construction',6),
  ('button_fault','Button / placket fault','construction',7),
  ('collar_fault','Collar or cuff fault','construction',8),
  ('measurement_off','Measurement out of spec','fit',9),
  ('size_mislabel','Size mislabelled','fit',10),
  ('press_marks','Pressing marks','finishing',11),
  ('stain','Stain or soiling','finishing',12),
  ('loose_threads','Loose threads','finishing',13),
  ('damaged_transit','Damaged in transit','logistics',14),
  ('wrong_item','Wrong item shipped','logistics',15),
  ('fit_preference','Fit preference (no defect)','customer',16),
  ('changed_mind','Changed mind (no defect)','customer',17);

create table order_statuses (
  code text primary key, label text not null, is_open boolean not null default true,
  counts_as_sold boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true
);
comment on column order_statuses.counts_as_sold is
  'Whether lines on an order in this status count toward units sold and revenue.';
insert into order_statuses (code, label, is_open, counts_as_sold, sort_order) values
  ('pending','Pending payment',true,false,1),
  ('confirmed','Confirmed',true,true,2),
  ('fulfilled','Fulfilled',false,true,3),
  ('cancelled','Cancelled',false,false,4),
  ('refunded','Refunded',false,false,5);

create table bill_statuses (
  code text primary key, label text not null, is_outstanding boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true
);
insert into bill_statuses (code, label, is_outstanding, sort_order) values
  ('draft','Draft',false,1),('awaiting_approval','Awaiting approval',true,2),
  ('approved','Approved',true,3),('part_paid','Part paid',true,4),
  ('paid','Paid',false,5),('disputed','Disputed',true,6),
  ('void','Void',false,7);
