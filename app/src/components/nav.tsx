"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };
export type NavGroup = { label: string; items: NavItem[] };

function isActive(pathname: string, href: string) {
  // "/" would prefix-match everything, so it has to be exact.
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-wrap items-baseline gap-8">
      {groups.map((group) => {
        // A group of one is just a link; wrapping it in a menu would be
        // ceremony for nothing.
        if (group.items.length === 1) {
          const item = group.items[0];
          return <TopLink key={item.href} item={item} active={isActive(pathname, item.href)} />;
        }

        const activeChild = group.items.find((i) => isActive(pathname, i.href));

        return (
          <div key={group.label} className="group relative">
            <button
              type="button"
              aria-expanded={false}
              className={`label border-b pb-1 ${
                activeChild ? "border-ink text-ink" : "border-transparent hover:text-ink"
              }`}
            >
              {activeChild ? activeChild.label : group.label}
            </button>

            {/* CSS-only: opens on hover and on keyboard focus within, so it
                needs no JavaScript and still works from the keyboard. */}
            <div
              className="invisible absolute left-0 top-full z-10 min-w-44 -translate-y-1 pt-4
                         opacity-0 transition-[opacity,transform] duration-150
                         group-hover:visible group-hover:translate-y-0 group-hover:opacity-100
                         group-focus-within:visible group-focus-within:translate-y-0
                         group-focus-within:opacity-100"
            >
              <ul className="flex flex-col gap-3 border border-bone bg-kora p-6">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={`label ${
                        isActive(pathname, item.href) ? "text-ink" : "hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`label border-b pb-1 ${
        active ? "border-ink text-ink" : "border-transparent hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );
}
