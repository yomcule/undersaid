import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// OAuth (Google) returns an authorization code, which is a different exchange
// from the magic-link token_hash handled in /auth/confirm.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Google itself can deny, and handle_new_user() raises for an uninvited
  // address — that surfaces here as an error param, not a code.
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      // Relative paths only — an absolute `next` would be an open redirect.
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
