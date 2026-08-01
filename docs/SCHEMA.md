# Michi — schema conventions

This document is the contract. An agent or a person extending the database
should be able to read this and the migrations and need nothing else.

## The spine

    vendors → fabric_lots → batches → order_lines → return_items
                  ↑            ↑
            batch_fabric_usage │
                          batch_sizes

Before adding a table, ask: **does this relate back to the spine?** If it
does not, it is probably a note, a task, or a resource — all of which already
exist.

## Conventions

1. **UUID primary keys**, `gen_random_uuid()`. Never expose sequential ints.
   *One exception:* `activity_log` uses an identity bigint. Nothing links to a
   log row and nothing puts its id in a URL, so there is no enumeration risk,
   and monotonic ids make "everything since X" a cheap index scan.

2. **Every entity table carries `created_at`, `updated_at`, `archived_at`**,
   and nothing is ever hard-deleted. This is enforced, not merely documented:
   there is no `DELETE` policy on any table, and `block_hard_delete()` fires
   even for the service role.
   *Exceptions, all deliberate:* `content_versions` and `content_reviews` are
   append-only records of a moment (a version you can edit is not a version);
   join tables (`batch_sizes`, `batch_fabric_usage`, `style_sizes`) have no
   independent lifecycle; `activity_log` is immutable.

3. **Every core entity gets `metadata jsonb not null default '{}'`.** Use it
   for anything you would otherwise be tempted to add a column for on a
   Tuesday. When a key appears in three places or gets queried, promote it to
   a real column and backfill.

4. **Enumerations are lookup tables, never Postgres ENUMs.** Adding a value is
   an INSERT anyone can do from the UI; retiring one is `is_active = false`,
   which preserves history. `ALTER TYPE ... ADD VALUE` cannot run in a
   transaction and cannot be undone.

5. **Polymorphic links use nullable typed FKs plus a `num_nonnulls(...) = 1`
   CHECK** — see `comments` and `attachments`. Wide, but every link is a real
   foreign key. A generic `(entity_type text, entity_id uuid)` pair is banned
   because it cannot be constrained and cannot be joined efficiently.
   *One exception:* `activity_log`, because an audit row must outlive the
   record it describes — a real FK would either block archival or cascade the
   evidence away.

6. **Money is `numeric(14,2)`, never float.** Three further rules:
   - `amount` is always **tax-exclusive** and always **positive**. Direction
     comes from `transaction_kinds.direction` (−1 out, +1 in).
   - `tax_amount` sits alongside; `gross_amount` is generated. COGS and margin
     use net, because input GST is recoverable and counting gross would
     overstate every cost in the system.
   - Non-INR rows carry `fx_rate`; `base_amount` is generated. **Every
     aggregate sums `base_amount`**, so a report can never add rupees to
     dollars.

7. **No credentials, ever.** Use Bitwarden or 1Password. Do not add a
   `credentials` table. This is not negotiable.

## Authorisation

Four roles, two independent axes:

| role | can_write | can_see_financials | is_admin |
|---|---|---|---|
| owner | ✓ | ✓ | ✓ |
| collaborator | ✓ | ✓ | |
| contributor | ✓ | | |
| viewer | | | |

`is_admin` exists because `can_write` must not be enough to edit
authorisation itself. Without it, a contributor can run
`update user_roles set can_see_financials = true where code = 'contributor'`
and grant themselves the books.

**Financial tables:** `contracts`, `vendor_bills`, `transactions`, `orders`,
`order_lines`. Reads require `can_see_financials`; writes require that plus
`can_write`. Comments and attachments attached to any of those inherit the
gate — a negotiation comment leaks the number just as effectively as the
contract does.

### Views must declare `security_invoker = on`

Postgres views default to **off**, meaning they run as the view owner —
`postgres` on Supabase, which owns the tables and is exempt from RLS. A view
without this setting hands its full contents to every authenticated user
through PostgREST regardless of policy.

`security_invoker` alone is not always sufficient. `v_batch_economics` derives
fabric cost from `fabric_lots` and `batch_fabric_usage`, which are *not*
financially gated, so it also carries an explicit
`and app_can_see_financials()` predicate. Partial visibility of a money view
is worse than none: the figures look authoritative and are wrong.

### Bootstrapping the first admin

`guard_profile_role()` exempts statements where `auth.uid()` is null — the SQL
editor, a migration, the service role. Without that exemption there is no way
to appoint the first admin, because every promotion requires an admin who does
not yet exist. Run this once from the dashboard after the first sign-in:

```sql
update profiles set role_code = 'owner' where id = '<your auth.users id>';
```

New sign-ups default to `viewer` and can see nothing sensitive until promoted.

### Storage is a separate boundary

`storage.objects` has its own RLS. Gating a `resources` or `attachments` row
does nothing to the file behind `storage_path`. Path prefix decides:
`michi/contracts/**`, `michi/bills/**` and `michi/transactions/**` require
financial access; everything else under `michi/` is open to any authenticated
user.

## Extending

**Add a status or category** — INSERT into the lookup table. No migration.

**Add a field** — put it in `metadata` first. Promote to a column once it has
earned it.

**Add an entity** — five steps:
1. Table with uuid PK, the three timestamps, and `metadata`.
2. Foreign keys to the spine.
3. Indexes on every FK, and partial unique indexes
   (`where archived_at is null`) on any human-facing code, so archiving frees
   the code for reuse.
4. `set_updated_at` and `block_hard_delete` triggers.
5. RLS: add it to the right group in `1100_rls.sql`. **A table with RLS on and
   no policy denies everything** — which is the correct default for something
   added and forgotten.

## What not to add

- A credentials or passwords table.
- Postgres ENUM types.
- `float`/`real` for money.
- Hard deletes.
- A generic `(entity_type, entity_id)` link table.
- `org_id`. Multi-tenancy is dead weight for two people. When it is needed:
  add the column, backfill one row, add it to every RLS policy, then add the
  composite indexes. Not before.

## Tests

```bash
node supabase/tests/schema.test.mjs
```

Runs every migration against an in-process Postgres (PGlite) and asserts the
security properties behaviourally — that a contributor cannot read margins,
cannot promote themselves, cannot see contract comments; that versions are
immutable; that nothing can be deleted; and that the economics arithmetic is
right. `supabase-stubs.sql` provides the pieces of Supabase that live outside
`public` (`auth.users`, `auth.uid()`, `storage.objects`).
