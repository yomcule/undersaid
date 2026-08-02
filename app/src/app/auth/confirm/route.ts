import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  // Supabase can come back two different ways and the email link uses the
  // second one:
  //
  //   token_hash + type — the OTP style, used by admin-generated links
  //   code             — PKCE, what @supabase/ssr issues for signInWithOtp
  //
  // Handling only token_hash meant every real emailed link failed.
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Supabase reports an expired or already-used link this way.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    redirect(`/login?error=${encodeURIComponent(providerError)}`);
  }

  let message = "This link is not valid. Request a new one.";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(safeNext);
    message = error.message;
  } else if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(safeNext);
    message = error.message;
  }

  redirect(`/login?error=${encodeURIComponent(message)}`);
}
