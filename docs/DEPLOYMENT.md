# Deploying Michi

Local dev runs on a Dockerised Supabase stack and `next dev`. Production is a
hosted Supabase project plus a Vercel deployment of `app/`. This is a
one-time setup; after that, `git push` to `main` is enough (Vercel builds on
every push once the project is connected).

## 1. Create the Supabase project

1. [database.new](https://database.new) → create a project. Pick a region
   close to your users (Mumbai, if available) and set a strong DB password —
   save it somewhere, you'll need it once for the CLI link.
2. Note the project ref (the string in the dashboard URL,
   `supabase.com/dashboard/project/<ref>`) and the project's API URL/anon key
   from **Settings → API**.

## 2. Push the schema

All schema, RLS policies, and lookup-table data live in
`supabase/migrations/`. This includes the invite allowlist for
shouryamoy@gmail.com and amrithapillay@gmail.com — no manual seeding needed.

**`supabase/seed.sql` is fake demo data (vendors, batches, orders) and must
never run against production** — it's for `supabase db reset` in local dev
only. Do not run it here.

From the repo root:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies every migration in order against the hosted database. Confirm
it worked:

```bash
npx supabase db diff --linked
```

(should report no differences).

## 3. Configure Google OAuth

Google sign-in is the primary route; email magic links stay available as a
fallback for anyone not on Gmail, and are the only option locally without
Google credentials configured (see `app/src/app/login/page.tsx`).

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create (or reuse) an OAuth 2.0 Client ID, type "Web application".
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In the Supabase dashboard: **Authentication → Providers → Google** — paste
   the Client ID and Client Secret, enable the provider.
4. **Authentication → URL Configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: add `https://<your-vercel-domain>/auth/callback`

Without step 4, Google sign-in will complete but bounce back to the wrong
place — this is the same PKCE exchange that
`app/src/app/auth/callback/route.ts` and `app/src/app/auth/confirm/route.ts`
already handle; it just needs the URL on the allow-list.

## 4. Deploy to Vercel

1. [vercel.com/new](https://vercel.com/new) → import the `undersaid` GitHub
   repo.
2. **Root Directory**: set to `app` (the Next.js project is not at the repo
   root — the repo root also holds `supabase/` and the schema test suite).
3. Environment variables (Settings → Environment Variables, or during
   import) — from Supabase **Settings → API**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` `public` key |
   | `NEXT_PUBLIC_GOOGLE_ENABLED` | `true` |

   Only the anon key is needed — every write goes through RLS as the signed-in
   user, never a service-role key, by design (see the RLS test suite).
4. Deploy.

## 5. First sign-in

Once deployed, visit the Vercel URL and sign in with Google as
shouryamoy@gmail.com or amrithapillay@gmail.com — both are pre-invited as
founders by the `google_auth` migration. Anyone else gets rejected by the
`handle_new_user()` trigger ("no invitation exists") until you add their
email to `invited_emails` (currently: direct SQL against the hosted DB —
item #6 on the build list, an invite-management UI, isn't built yet).

## Ongoing changes

New migrations: add a file to `supabase/migrations/`, test locally with
`npx supabase db reset` and `npm test`, then `npx supabase db push` against
the linked hosted project. There is no automatic migration-on-deploy step —
pushing to `main` deploys the app on Vercel, but the database is a separate,
deliberate step so a bad migration can't take the site down on merge.
