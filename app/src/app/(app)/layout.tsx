import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/embed";
import { Nav, type NavGroup } from "@/components/nav";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The nav is filtered by role for tidiness, not for security — the same
  // rules are enforced by RLS, so hiding a link is cosmetic. A contributor
  // who types /money still gets an empty page, not a leak.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role_code, user_roles(label, can_see_financials)")
    .eq("id", user.id)
    .single();

  const role = one<{ label: string; can_see_financials: boolean }>(
    profile?.user_roles,
  );
  const canSeeFinancials = role?.can_see_financials ?? false;

  // Ten flat links wrapped onto a second row. Grouped, the bar is four items
  // and each group names the question you are asking.
  const nav: NavGroup[] = [
    { label: "Overview", items: [{ href: "/", label: "Overview" }] },
    { label: "Tasks", items: [{ href: "/tasks", label: "Tasks" }] },
    {
      label: "Make",
      items: [
        { href: "/batches", label: "Batches" },
        { href: "/fabric", label: "Fabric" },
        { href: "/styles", label: "Styles" },
        { href: "/logistics", label: "Logistics" },
        { href: "/returns", label: "Returns" },
      ],
    },
    {
      label: "Studio",
      items: [
        { href: "/content", label: "Content" },
        { href: "/inspiration", label: "Inspiration" },
      ],
    },
    {
      label: "Business",
      items: [
        { href: "/vendors", label: "Vendors" },
        ...(canSeeFinancials
          ? [
              { href: "/contracts", label: "Contracts" },
              { href: "/money", label: "Money" },
            ]
          : []),
      ],
    },
  ];

  return (
    <div className="min-h-dvh">
      {/* Space between blocks does the work that dividing lines would
          otherwise do — hence one hairline rule and a lot of margin. */}
      <header className="border-b border-bone">
        <div className="mx-auto flex max-w-[1200px] items-baseline gap-12 px-6 py-6 md:px-20">
          <Link
            href="/"
            className="font-display text-lg"
            style={{ letterSpacing: "0.09em" }}
          >
            MICHI
          </Link>

          <Nav groups={nav} />

          <form action={signOut}>
            <button type="submit" className="label hover:text-ink">
              {profile?.full_name ?? "Sign out"}
            </button>
          </form>
        </div>
      </header>

      {/* Layouts should be uncomfortably generous. There is not too much
          empty space. */}
      <main className="mx-auto max-w-[1200px] px-6 py-16 md:px-20">
        {children}
      </main>
    </div>
  );
}
