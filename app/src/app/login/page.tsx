import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

// Magic-link sign-in. There is no password field anywhere in Michi by design:
// the schema deliberately stores no credentials, and a link removes the only
// remaining secret the app would otherwise have to handle.
async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      shouldCreateUser: false, // accounts are provisioned by an owner, not self-serve
    },
  });
}

export default async function LoginPage(props: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await props.searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-16 text-center">
          {/* Wordmark: Fraunces 300, wide letterspacing — what makes a short
              word feel considered rather than cramped. */}
          <div
            className="font-display text-3xl"
            style={{ letterSpacing: "0.09em" }}
          >
            MICHI
          </div>
          <p className="label mt-4">est. 2026</p>
        </div>

        {sent ? (
          <p className="text-iron measure text-center">
            Check your email. The link signs you in and expires shortly.
          </p>
        ) : (
          <form action={signIn} className="flex flex-col gap-4">
            <label htmlFor="email" className="label">
              Email
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
            {/* The one Indigo element in this view. */}
            <button
              type="submit"
              className="mt-4 bg-indigo px-6 py-4 text-kora
                         transition-opacity hover:opacity-90"
            >
              Send sign-in link
            </button>
          </form>
        )}

        <p className="mt-16 text-center text-sm text-iron">
          Access is granted by an owner. There is no sign-up.
        </p>
      </div>
    </main>
  );
}
