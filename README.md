# Michi

Internal collaboration and operations for the Michi shirting business.
Tasks, content review, resources, contracts, vendors, production and accounts.

```
supabase/migrations/   the database — 12 ordered migrations
supabase/tests/        behavioural tests, run against in-process Postgres
docs/SCHEMA.md         the conventions contract; read before extending
app/                   Next.js 16 + Supabase, deployed to Vercel
```

## Setup

**1. Create the Supabase project.** Its own organisation, on Pro — see
*Hosting* below for why.

**2. Apply the migrations** in filename order, either with the CLI:

```bash
supabase link --project-ref <ref> && supabase db push
```

or by pasting each file into the dashboard SQL editor, oldest first.

**3. Make yourself the owner.** Sign in once so `auth.users` has your row,
then run this from the SQL editor — new accounts default to `viewer`, and the
role guard exempts direct database access precisely so the first admin can be
appointed:

```sql
update profiles set role_code = 'owner' where id = '<your auth.users id>';
```

**4. Run the app.**

```bash
cd app && cp .env.local.example .env.local   # fill in URL + anon key
npm install && npm run dev
```

Sign-in is a magic link. There is no password field anywhere, and the schema
stores no credentials — use Bitwarden or 1Password for those.

## Google sign-in

Michi ships with Google OAuth wired up, but the OAuth client itself is yours to
create — Google will not issue one to anybody else, and the secret must never
land in this repo. Until it exists, sign-in fails at Google's end with
`Error 401: invalid_client`, which means Supabase sent an empty client id.

**1. Create the client.** Google Cloud Console → *APIs & Services* →
*Credentials* → *Create credentials* → *OAuth client ID* → *Web application*.

**2. Authorised redirect URIs.** These point at **Supabase**, not at the app —
Supabase handles the callback and only then redirects to Michi:

| | URI |
|---|---|
| production | `https://<project-ref>.supabase.co/auth/v1/callback` |
| local | `http://127.0.0.1:54321/auth/v1/callback` |

**3. Authorised JavaScript origins:** `http://localhost:3000` for local, plus
your Vercel domain for production.

**4. Consent screen.** Choose *External*. While it stays in *Testing*, only
addresses listed under *Test users* can sign in — a useful second lock on top
of `invited_emails`. Add both founders there.

**5. Give the credentials to Supabase.**

- *Production:* dashboard → *Authentication* → *Providers* → *Google*.
- *Local:* create `supabase/.env` (gitignored) with

  ```
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
  ```

  then `npx supabase stop && npx supabase start`, and drop
  `NEXT_PUBLIC_GOOGLE_ENABLED=false` from `app/.env.local`.

The button is hidden whenever `NEXT_PUBLIC_GOOGLE_ENABLED=false`, so an
unconfigured environment falls back to the magic link instead of bouncing
people to a Google error page. Unset means shown, so forgetting the variable
in production fails the safe way.

## Tests

```bash
node supabase/tests/schema.test.mjs
```

Applies every migration to an in-process Postgres (PGlite — no Docker, no
local Postgres needed) and asserts the things that actually matter: that a
contributor cannot read margins or contract comments, cannot promote
themselves, and cannot edit the audit log; that content versions are
immutable; that nothing anywhere can be hard-deleted; and that batch
economics arithmetic is correct to the rupee.

## Hosting

| | plan | why |
|---|---|---|
| Vercel | **Pro, $20/dev/mo** | Hobby is non-commercial personal use only. An internal business tool is commercial regardless of traffic. Viewer seats are free. |
| Supabase | **Pro, $25/mo** | Free allows 2 active projects across all orgs where you are Owner/Admin, and you are already at that limit. Free also has no backups, and this database holds contracts and payables. |

Free tier is fine while building — pause an existing project to free a slot —
but upgrade before real vendor and money data goes in.

## Design

The app follows *Michi Visual Identity Guidelines v0.1*: Kora `#F4EFE6`
surfaces (never white), Ink `#1E1C19` type (never black), one Indigo element
per view, Fraunces with the WONK axis on for display, Archivo for reading,
IBM Plex Mono for anything that is data — lot codes, batch codes, sizes,
money. Spacing is a multiple of 8.

Two deviations from the letter of the guidelines, both deliberate:

- **Selvedge is not used for text anywhere**, including the 11px uppercase
  labels where it would have been the obvious pick. It is 3.19:1 on Kora and
  fails WCAG AA below 18pt. Labels use Iron (6.30:1).
- **No fabric-texture wash.** The guidelines allow a 3–6% scan of real
  material; there is no scan yet, and stock textures are explicitly banned.
  Add it once you have photographed your own cloth.
