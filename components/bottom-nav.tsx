"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Siren, Activity, LayoutGrid } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/report", label: "Report", Icon: Siren },
  { href: "/status", label: "Status", Icon: Activity },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutGrid },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white"
      style={{ paddingBottom: "var(--sab)" }}
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          const report = href === "/report";
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="press tap flex h-16 flex-col items-center justify-center gap-1"
              >
                <Icon
                  size={24}
                  strokeWidth={active ? 2.6 : 2}
                  className={
                    report
                      ? "text-red-600"
                      : active
                        ? "text-slate-900"
                        : "text-slate-400"
                  }
                  aria-hidden="true"
                />
                <span
                  className={`text-[11px] leading-none ${
                    active ? "font-bold text-slate-900" : "font-medium text-slate-500"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
