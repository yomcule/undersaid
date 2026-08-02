import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `http://${h.get("host")}`;
}

// Google is the primary route. Accounts are not self-serve: handle_new_user()
// rejects any address absent from invited_emails, so an uninvited Google
// account fails at the database rather than landing on a default role.
async function signInWithGoogle() {
  "use server";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback`,
      queryParams: { access_type: "offline", prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth_unavailable")}`);
  }
  redirect(data.url);
}

// Kept as a fallback: it is the only route that works locally without Google
// OAuth credentials, and it covers anyone not on Gmail. There is no password
// field anywhere in Michi — the schema deliberately stores no credentials.
async function signInWithEmail(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm`,
      shouldCreateUser: false,
    },
  });

  redirect("/login?sent=1");
}

// Defaults to on, so forgetting the variable in production shows the button
// rather than silently hiding it. Local .env.local turns it off, because
// without Google credentials the button only reaches a Google error page.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED !== "false";

export default async function LoginPage(props: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await props.searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-16 text-center">
          <div
            className="font-display text-3xl"
            style={{ letterSpacing: "0.09em" }}
          >
            MICHI
          </div>
          <p className="label mt-4">est. 2026</p>
        </div>

        {error ? (
          <p className="measure mb-8 text-sm text-madder">
            Sign-in failed: {error}
          </p>
        ) : null}

        {sent ? (
          <p className="measure text-center text-iron">
            Check your email. The link signs you in and expires shortly.
          </p>
        ) : (
          <>
            {googleEnabled ? (
              <>
                {/* The one Indigo element in this view. */}
                <form action={signInWithGoogle}>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-4 bg-indigo px-6 py-4
                               text-kora transition-opacity hover:opacity-90"
                  >
                    <GoogleMark />
                    Continue with Google
                  </button>
                </form>

                <div className="my-8 flex items-center gap-4">
                  <span className="h-px flex-1 bg-bone" />
                  <span className="label">or</span>
                  <span className="h-px flex-1 bg-bone" />
                </div>
              </>
            ) : null}

            <form action={signInWithEmail} className="flex flex-col gap-4">
              <label htmlFor="email" className="label">
                Email link
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full border border-bone bg-transparent px-4 py-4
                           text-ink placeholder:text-selvedge
                           focus:border-indigo focus:outline-none"
              />
              {/* Exactly one Indigo element per view: whichever action is
                  primary here depends on whether Google is available. */}
              <button
                type="submit"
                className={
                  googleEnabled
                    ? "border border-bone px-6 py-4 text-ink transition-colors hover:border-indigo"
                    : "bg-indigo px-6 py-4 text-kora transition-opacity hover:opacity-90"
                }
              >
                Send sign-in link
              </button>
            </form>
          </>
        )}

        <p className="mt-16 text-center text-sm text-iron">
          Access is by invitation. There is no sign-up.
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  // Single-colour so it sits inside the Indigo field without introducing a
  // fifth colour to the palette.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4a5.9 5.9 0 0 1 0-11.8c1.7 0 2.9.7 3.6 1.4l2.4-2.4A9.3 9.3 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.8 0-.7 0-1.2-.2-1.7H12Z" />
    </svg>
  );
}
