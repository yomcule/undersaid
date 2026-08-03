"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();

  // "/" would prefix-match every route, so it has to be exact. Everything else
  // also matches its children, so /batches stays lit on /batches/B-2026-001.
  const active =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // Ink rather than Indigo: the accent is reserved for the one primary
      // action on a page, and a permanent nav highlight would outrank it.
      className={
        active
          ? "label border-b border-ink pb-1 text-ink"
          : "label border-b border-transparent pb-1 hover:text-ink"
      }
    >
      {label}
    </Link>
  );
}
