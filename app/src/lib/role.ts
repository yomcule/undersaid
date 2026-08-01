import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/embed";

export type Role = {
  fullName: string;
  code: string;
  label: string;
  canWrite: boolean;
  canSeeFinancials: boolean;
  isAdmin: boolean;
};

/**
 * The caller's role, for deciding what to RENDER. It is not access control —
 * RLS is. Hiding a column the database would refuse anyway just avoids
 * showing a row of em-dashes and a "Payable ₹0" card to someone who is never
 * going to see a number in them.
 */
export async function getRole(): Promise<Role | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, role_code, user_roles(label, can_write, can_see_financials, is_admin)")
    .eq("id", user.id)
    .single();

  const r = one<{
    label: string;
    can_write: boolean;
    can_see_financials: boolean;
    is_admin: boolean;
  }>(data?.user_roles);

  return {
    fullName: data?.full_name ?? "",
    code: data?.role_code ?? "viewer",
    label: r?.label ?? "Viewer",
    canWrite: r?.can_write ?? false,
    canSeeFinancials: r?.can_see_financials ?? false,
    isAdmin: r?.is_admin ?? false,
  };
}
