"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Documents",
    href: "/documents",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 3h8l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Timeline",
    href: "/timeline",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Prepare",
    href: "/preparation",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface safe-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex flex-col items-center gap-0.5 rounded-card px-3 py-2 text-xs font-medium transition-colors duration-150 min-w-[56px]",
                isActive
                  ? "text-primary"
                  : "text-text-secondary",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
