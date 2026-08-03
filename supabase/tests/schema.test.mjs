import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIG = '/Users/moy/Documents/Michi/supabase/migrations';
const db = new PGlite({ extensions: { pg_trgm } });

await db.exec(readFileSync(new URL('./supabase-stubs.sql', import.meta.url), 'utf8'));
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(MIG, f), 'utf8'));
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const CONTRIB = '22222222-2222-2222-2222-222222222222';

// ---- seed as superuser -----------------------------------------------------
await db.exec(`
insert into invited_emails (email, role_code) values
  ('owner@michi.test',   'founder'),
  ('shooter@michi.test', 'contributor');

insert into auth.users (id, email, raw_user_meta_data) values
  ('${OWNER}',   'owner@michi.test',   '{"full_name":"Owner"}'),
  ('${CONTRIB}', 'shooter@michi.test', '{"full_name":"Photographer"}');

insert into vendors (id, name, type_code, payment_terms_days)
values ('aaaa0000-0000-0000-0000-000000000001','Bhiwandi Weaves','weaver',30),
       ('aaaa0000-0000-0000-0000-000000000002','Dharavi CMT','tailor',15);

insert into fabric_lots (id, lot_code, vendor_id, cost_per_metre, metres_received)
values ('bbbb0000-0000-0000-0000-000000000001','LOT-001',
        'aaaa0000-0000-0000-0000-000000000001', 300.00, 200);

insert into styles (id, style_code, name)
values ('cccc0000-0000-0000-0000-000000000001','ST-OXF','Oxford Button-Down');

insert into batches (id, batch_code, style_id, tailor_vendor_id, status_code, cmt_cost_per_unit)
values ('dddd0000-0000-0000-0000-000000000001','B-001',
        'cccc0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000002','selling', 450);

insert into batch_sizes (batch_id, size_code, units_planned, units_produced, units_rejected) values
  ('dddd0000-0000-0000-0000-000000000001','M',30,28,2),
  ('dddd0000-0000-0000-0000-000000000001','L',30,30,0);

-- 100 metres of the 200-metre lot went into this batch: 100 * 300 = 30,000
insert into batch_fabric_usage (batch_id, fabric_lot_id, metres_used)
values ('dddd0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',100);

-- CMT invoice for the batch, tax-exclusive 26,100 + 18% GST
insert into transactions (category_code, amount, tax_amount, batch_id, vendor_id)
values ('cmt', 26100, 4698, 'dddd0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000002');

insert into orders (id, order_ref, status_code)
values ('eeee0000-0000-0000-0000-000000000001','#1001','fulfilled');

insert into order_lines (id, order_id, batch_id, size_code, quantity, unit_price)
values ('ffff0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001',
        'dddd0000-0000-0000-0000-000000000001','M',10,2500),
       ('ffff0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000001',
        'dddd0000-0000-0000-0000-000000000001','L',20,2500);

-- status_code now decides whether a returned unit is stock again. The
-- resellable verdict alone is not enough: a shirt away at the tailor is not
-- on the shelf.
insert into return_items (order_line_id, quantity, reason_code, is_resellable, status_code)
values ('ffff0000-0000-0000-0000-000000000001',2,'seam_puckering',false,'written_off'),
       ('ffff0000-0000-0000-0000-000000000002',1,'changed_mind',true,'restocked');

insert into contracts (id, title, type_code, status_code, vendor_id, value_amount, expires_on)
values ('99990000-0000-0000-0000-000000000001','CMT rate card','job_work','active',
        'aaaa0000-0000-0000-0000-000000000002', 1200000, current_date + 30);

insert into comments (author_id, body, contract_id)
values ('${OWNER}','They asked for 12L, settled at 9.5L','99990000-0000-0000-0000-000000000001');
insert into comments (author_id, body, batch_id)
values ('${OWNER}','Shoot this on Thursday','dddd0000-0000-0000-0000-000000000001');
`);

// ---- helpers ---------------------------------------------------------------
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function as(uid, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  try { return await fn(); }
  finally { await db.exec(`reset role; reset request.jwt.claim.sub;`); }
}
async function denied(uid, sql) {
  return as(uid, async () => {
    try { await db.query(sql); return null; } catch (e) { return e.message; }
  });
}

// ---- 1. the headline leak: views bypassing RLS ------------------------------
console.log('\nviews respect RLS (security_invoker):');
{
  const o = await as(OWNER,   () => db.query('select * from v_batch_economics'));
  const c = await as(CONTRIB, () => db.query('select * from v_batch_economics'));
  ok('owner sees batch economics', o.rows.length === 1);
  ok('contributor sees NO batch economics', c.rows.length === 0, `got ${c.rows.length} rows`);

  const oc = await as(OWNER,   () => db.query('select * from v_contract_renewals'));
  const cc = await as(CONTRIB, () => db.query('select * from v_contract_renewals'));
  ok('owner sees contract renewals', oc.rows.length === 1);
  ok('contributor sees NO contract renewals', cc.rows.length === 0, `got ${cc.rows.length} rows`);

  const op = await as(OWNER,   () => db.query('select * from v_vendor_payables'));
  ok('payables view runs for owner', Array.isArray(op.rows));
}

// ---- 2. privilege escalation ------------------------------------------------
console.log('\nprivilege escalation is blocked:');
{
  await as(CONTRIB, () => db.query(
    `update user_roles set can_see_financials = true where code = 'contributor'`));
  const r = await db.query(`select can_see_financials from user_roles where code='contributor'`);
  ok('contributor cannot grant financials via user_roles', r.rows[0].can_see_financials === false);

  const e = await denied(CONTRIB, `update profiles set role_code='owner' where id='${CONTRIB}'`);
  ok('contributor cannot promote own role_code', /only an admin/.test(e || ''), `got: ${e}`);

  await as(CONTRIB, () => db.query(
    `update profiles set role_code='viewer' where id='${OWNER}'`));
  const r2 = await db.query(`select role_code from profiles where id='${OWNER}'`);
  ok('contributor cannot demote the founder', r2.rows[0].role_code === 'founder');

  const e3 = await denied(CONTRIB, `select * from transactions`);
  const rows = await as(CONTRIB, () => db.query('select * from transactions'));
  ok('contributor reads zero transactions', rows.rows.length === 0);
  const cRows = await as(CONTRIB, () => db.query('select * from contracts'));
  ok('contributor reads zero contracts', cRows.rows.length === 0);
  const oRows = await as(CONTRIB, () => db.query('select * from orders'));
  ok('contributor reads zero orders', oRows.rows.length === 0);
}

// ---- 2b. the invite allowlist (the gate OAuth sign-up relies on) ------------
console.log('\ninvite allowlist:');
{
  let e = null;
  try {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data)
                    values (gen_random_uuid(), 'stranger@gmail.com', '{}')`);
  } catch (err) { e = err.message; }
  ok('an uninvited Google address cannot create an account',
     /no invitation exists/.test(e || ''), `got: ${e}`);

  const orphan = await db.query(`select count(*)::int n from auth.users where email='stranger@gmail.com'`);
  ok('the rejected sign-up leaves no orphan auth row', orphan.rows[0].n === 0);

  const inv = await denied(CONTRIB, `select * from invited_emails`);
  const rows = await as(CONTRIB, () => db.query('select * from invited_emails'));
  ok('contributor cannot read the invite list', rows.rows.length === 0);

  await as(CONTRIB, () => db.query(
    `insert into invited_emails (email, role_code) values ('self@gmail.com','founder')`).catch(() => {}));
  const added = await db.query(`select count(*)::int n from invited_emails where email='self@gmail.com'`);
  ok('contributor cannot invite themselves a founder account', added.rows[0].n === 0);
}

// ---- 2c. content approval is of a version, not an item --------------------
console.log('\ncontent approval:');
{
  await db.query(`insert into content_items (id, title, type_code, author_id)
                  values ('c0c0c0c0-0000-0000-0000-000000000001','Launch copy','product_copy','${OWNER}')`);
  await db.query(`insert into content_versions (content_id, body, created_by)
                  values ('c0c0c0c0-0000-0000-0000-000000000001','First draft.','${OWNER}')`);

  const bad = await db.query(`select status_code from content_items where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  ok('a new item starts as draft', bad.rows[0].status_code === 'draft');

  let e = null;
  try {
    await db.query(`update content_items set status_code='published'
                     where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  } catch (err) { e = err.message; }
  ok('cannot jump straight from draft to published', /cannot move content/.test(e || ''), `got: ${e}`);

  await db.query(`update content_items set status_code='in_review' where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  await db.query(`insert into content_reviews (content_id, version_no, reviewer_id, decision)
                  values ('c0c0c0c0-0000-0000-0000-000000000001',1,'${OWNER}','approved')`);
  const appr = await db.query(`select status_code, approved_version from content_items where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  ok('approving sets status and records the version',
     appr.rows[0].status_code === 'approved' && appr.rows[0].approved_version === 1);

  // The bug this whole workflow exists to prevent.
  await db.query(`insert into content_versions (content_id, body, created_by)
                  values ('c0c0c0c0-0000-0000-0000-000000000001','Edited after sign-off.','${OWNER}')`);
  const stale = await db.query(`select status_code, approved_version, current_version
                                  from content_items where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  ok('a new version revokes the approval',
     stale.rows[0].approved_version === null && stale.rows[0].status_code === 'draft',
     JSON.stringify(stale.rows[0]));

  e = null;
  try {
    await db.query(`update content_items set status_code='in_review' where id='c0c0c0c0-0000-0000-0000-000000000001'`);
    await db.query(`update content_items set status_code='published' where id='c0c0c0c0-0000-0000-0000-000000000001'`);
  } catch (err) { e = err.message; }
  ok('unreviewed text cannot be published', /cannot move content|not approved/.test(e || ''), `got: ${e}`);
}

// ---- 3. financial leakage through comments ----------------------------------
console.log('\ncomments do not leak financials:');
{
  const c = await as(CONTRIB, () => db.query('select body, contract_id from comments'));
  ok('contributor sees only the non-financial comment', c.rows.length === 1, `got ${c.rows.length}`);
  ok('the contract negotiation comment is hidden',
     !c.rows.some(r => /9.5L/.test(r.body)));
  const o = await as(OWNER, () => db.query('select body from comments'));
  ok('owner sees both comments', o.rows.length === 2, `got ${o.rows.length}`);
}

// ---- 4. no hard deletes ------------------------------------------------------
console.log('\nhard deletes are impossible:');
{
  const e1 = await denied(OWNER, `delete from vendors where name='Dharavi CMT'`);
  ok('owner cannot delete a vendor via RLS/grant', e1 !== null, `got: ${e1}`);
  let e2 = null;
  try { await db.query(`delete from vendors where name='Dharavi CMT'`); }
  catch (err) { e2 = err.message; }
  ok('even superuser is stopped by block_hard_delete', /hard delete is not allowed/.test(e2 || ''), `got: ${e2}`);
}

// ---- 5. content versioning ---------------------------------------------------
console.log('\ncontent versions:');
{
  await db.exec(`insert into content_items (id, title, type_code, author_id)
                 values ('77770000-0000-0000-0000-000000000001','Oxford PDP copy','product_copy','${OWNER}')`);
  const fresh = await db.query(`select current_version from content_items where id='77770000-0000-0000-0000-000000000001'`);
  ok('new item starts at version 0', fresh.rows[0].current_version === 0);

  await db.exec(`insert into content_versions (content_id, body, created_by)
                 values ('77770000-0000-0000-0000-000000000001','v1 body','${OWNER}'),
                        ('77770000-0000-0000-0000-000000000001','v2 body','${OWNER}')`);
  const v = await db.query(`select version_no from content_versions
                            where content_id='77770000-0000-0000-0000-000000000001' order by version_no`);
  ok('versions auto-number 1,2', v.rows.map(r => r.version_no).join(',') === '1,2');
  const cur = await db.query(`select current_version from content_items where id='77770000-0000-0000-0000-000000000001'`);
  ok('current_version tracks to 2', cur.rows[0].current_version === 2);

  let e = null;
  try { await db.query(`update content_versions set body='tampered' where version_no=1`); }
  catch (err) { e = err.message; }
  ok('versions are immutable', /immutable/.test(e || ''), `got: ${e}`);

  let e2 = null;
  try {
    await db.query(`insert into content_reviews (content_id, version_no, reviewer_id, decision)
                    values ('77770000-0000-0000-0000-000000000001', 9, '${OWNER}', 'approved')`);
  } catch (err) { e2 = err.message; }
  ok('cannot review a version that does not exist', e2 !== null);
}

// ---- 6. domain integrity -----------------------------------------------------
console.log('\ndomain integrity:');
{
  let e = null;
  try {
    await db.query(`insert into order_lines (order_id, batch_id, size_code, quantity, unit_price)
                    values ('eeee0000-0000-0000-0000-000000000001',
                            'dddd0000-0000-0000-0000-000000000001','XS',1,2500)`);
  } catch (err) { e = err.message; }
  ok('cannot sell a size the batch never cut', e !== null);

  let e2 = null;
  try {
    await db.query(`insert into return_items (order_line_id, quantity, reason_code)
                    values ('ffff0000-0000-0000-0000-000000000001', 20, 'stain')`);
  } catch (err) { e2 = err.message; }
  ok('cannot return more than were sold', /exceed the 10 sold/.test(e2 || ''), `got: ${e2}`);

  let e3 = null;
  try {
    await db.query(`insert into transactions (category_code, amount, batch_id)
                    values ('fabric', 5000, 'dddd0000-0000-0000-0000-000000000001')`);
  } catch (err) { e3 = err.message; }
  ok('fabric spend cannot be pinned to a batch', /transactions_fabric_not_batch_costed/.test(e3 || ''), `got: ${e3}`);

  let e4 = null;
  try {
    await db.query(`insert into tasks (title, vendor_id, batch_id)
                    values ('two contexts','aaaa0000-0000-0000-0000-000000000001',
                            'dddd0000-0000-0000-0000-000000000001')`);
  } catch (err) { e4 = err.message; }
  ok('a task cannot have two contexts', /tasks_one_context/.test(e4 || ''), `got: ${e4}`);

  // threaded comment inherits its parent's entity
  const parent = await db.query(`select id from comments where batch_id is not null limit 1`);
  await db.query(`insert into comments (author_id, body, parent_id, task_id)
                  values ('${OWNER}','reply', '${parent.rows[0].id}', null)`);
  const reply = await db.query(`select batch_id, task_id from comments where body='reply'`);
  ok('reply inherits parent batch_id', reply.rows[0].batch_id !== null && reply.rows[0].task_id === null);
}

// ---- 7. the economics actually add up ----------------------------------------
console.log('\nbatch economics arithmetic:');
{
  const r = (await as(OWNER, () => db.query('select * from v_batch_economics'))).rows[0];
  //   fabric  100m * 300            = 30,000
  //   cmt     tax-exclusive          = 26,100  (GST 4,698 excluded: recoverable)
  //   revenue 30 units * 2,500       = 75,000
  ok('fabric cost allocated by metres', Number(r.fabric_cost) === 30000, `got ${r.fabric_cost}`);
  ok('other cost is tax-exclusive', Number(r.other_cost) === 26100, `got ${r.other_cost}`);
  ok('total cost 56,100', Number(r.total_cost) === 56100, `got ${r.total_cost}`);
  ok('revenue from order lines = 75,000', Number(r.gross_revenue) === 75000, `got ${r.gross_revenue}`);
  ok('gross margin 18,900', Number(r.gross_margin) === 18900, `got ${r.gross_margin}`);
  ok('units_produced 58 (28+30)', r.units_produced === 58, `got ${r.units_produced}`);
  ok('units_sold 30', r.units_sold === 30, `got ${r.units_sold}`);
  ok('cost per unit 967.24', Number(r.cost_per_unit) === 967.24, `got ${r.cost_per_unit}`);
  ok('return rate 10% (3 of 30)', Number(r.return_rate_pct) === 10, `got ${r.return_rate_pct}`);
  //  only the seam puckering is a defect; "changed mind" is not
  ok('defect return rate 6.67% excludes changed_mind',
     Number(r.defect_return_rate_pct) === 6.67, `got ${r.defect_return_rate_pct}`);
  ok('qc reject rate 3.33% (2 of 60 cut)', Number(r.qc_reject_rate_pct) === 3.33, `got ${r.qc_reject_rate_pct}`);

  const inv = (await as(OWNER, () => db.query(
    `select * from v_batch_size_inventory where size_code='M'`))).rows[0];
  //  28 produced - 10 sold + 0 resellable returns = 18
  ok('size M on hand = 18', inv.units_on_hand === 18, `got ${inv.units_on_hand}`);
  const invL = (await as(OWNER, () => db.query(
    `select * from v_batch_size_inventory where size_code='L'`))).rows[0];
  //  30 produced - 20 sold + 1 restocked return = 11
  ok('size L on hand = 11 (restocked return re-enters stock)', invL.units_on_hand === 11, `got ${invL.units_on_hand}`);

  // The other half of the rule: a unit out for repair is resellable in
  // principle but must not be counted as stock while it is away.
  await db.query(`update return_items set status_code = 'repairing'
                   where order_line_id = 'ffff0000-0000-0000-0000-000000000002'`);
  const repairing = (await db.query(
    `select units_on_hand, units_in_repair from v_batch_size_inventory
      where batch_id = 'dddd0000-0000-0000-0000-000000000001' and size_code = 'L'`)).rows[0];
  ok('a unit out for repair leaves stock', repairing.units_on_hand === 10, `got ${repairing.units_on_hand}`);
  ok('and is counted as in repair', repairing.units_in_repair === 1, `got ${repairing.units_in_repair}`);
  await db.query(`update return_items set status_code = 'restocked'
                   where order_line_id = 'ffff0000-0000-0000-0000-000000000002'`);
}

// ---- 8. audit log --------------------------------------------------------------
console.log('\naudit log:');
{
  const c = await as(CONTRIB, () => db.query(`select entity_table from activity_log`));
  ok('contributor sees no financial audit rows',
     !c.rows.some(r => ['transactions','contracts','orders','vendor_bills'].includes(r.entity_table)));
  const e = await denied(CONTRIB, `insert into activity_log (action, entity_table) values ('forge','vendors')`);
  ok('nobody can write the audit log', e !== null, `got: ${e}`);
  const upd = await denied(OWNER, `update activity_log set action='nope'`);
  ok('nobody can rewrite the audit log', upd !== null, `got: ${upd}`);
  const has = await as(OWNER, () => db.query(
    `select count(*)::int n from activity_log where entity_table='vendors'`));
  ok('vendor changes were logged', has.rows[0].n > 0);
}

// ---- 9. payables ---------------------------------------------------------------
console.log('\npayables:');
{
  await db.exec(`
    insert into vendor_bills (id, vendor_id, bill_no, status_code, issued_on, amount, tax_amount)
    values ('88880000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001',
            'INV-77','approved', current_date - 45, 60000, 10800);
    insert into transactions (category_code, amount, tax_amount, vendor_bill_id, vendor_id)
    values ('fabric', 30000, 5400, '88880000-0000-0000-0000-000000000001',
            'aaaa0000-0000-0000-0000-000000000001');
  `);
  const p = (await as(OWNER, () => db.query(
    `select * from v_vendor_payables where bill_no='INV-77'`))).rows[0];
  const iso = d => new Date(d).toISOString().slice(0,10);
  ok('due_on defaulted from 30-day vendor terms',
     iso(p.due_on) === iso(Date.now() - 15*864e5), `got ${p.due_on}`);
  ok('outstanding = 70,800 - 35,400 = 35,400', Number(p.outstanding_amount) === 35400, `got ${p.outstanding_amount}`);
  ok('flagged overdue', p.is_overdue === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.close();
process.exit(fail ? 1 : 0);
