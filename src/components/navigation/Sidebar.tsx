"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  isActive: (pathname: string) => boolean;
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 7.5L10 2l7 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 17V10h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    isActive: (pathname: string) => pathname === "/dashboard" || pathname === "/",
  },
  {
    label: "Records",
    href: "/records",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 6h6M7 10h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    isActive: (pathname: string) =>
      pathname.startsWith("/records") ||
      pathname.startsWith("/documents") ||
      pathname.startsWith("/timeline") ||
      pathname.startsWith("/review") ||
      pathname.startsWith("/runs") ||
      pathname.startsWith("/consent"),
  },
  {
    label: "Track",
    href: "/health-tracking",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M2 14l4-4 3 3 4-5 5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    isActive: (pathname: string) => pathname.startsWith("/health-tracking"),
  },
  {
    label: "Medicines",
    href: "/medicines",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2v16M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    isActive: (pathname: string) =>
      pathname.startsWith("/medicines") || pathname.startsWith("/routine"),
  },
  {
    label: "Ask",
    href: "/ask",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M18 11.5a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 8.5a1.5 1.5 0 113 0c0 .83-.67 1.25-1.5 1.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13" r="0.75" fill="currentColor" />
      </svg>
    ),
    isActive: (pathname: string) => pathname.startsWith("/ask"),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <aside
      className="hidden w-60 shrink-0 border-r border-border bg-surface md:block"
      aria-label="Main Navigation"
    >
      <div className="flex h-full flex-col justify-between">
        <div>
          {/* Logo */}
          <div className="px-5 py-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Image
                src="/branding/healthfolio-logo.png"
                alt="Healthfolio"
                width={145}
                height={42}
                className="h-9 w-auto"
                style={{ objectFit: "contain" }}
                priority
              />
            </Link>
          </div>

          {/* Navigation */}
          <nav className="space-y-1 px-3 py-2" aria-label="Primary Navigation">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "touch-target relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-text-secondary hover:bg-canvas hover:text-text-primary",
                  ].join(" ")}
                >
                  {active && !reduceMotion && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-primary/10"
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <span
                    className={[
                      "relative transition-colors",
                      active ? "text-primary" : "text-text-secondary",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Private workspace indicator & Settings */}
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-sage-surface border border-sage-border/60 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span className="truncate font-medium text-text-primary">Private Workspace</span>
            </div>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Encrypted
            </span>
          </div>

          <Link
            href="/settings"
            className="touch-target flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:bg-canvas hover:text-text-primary transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M13.3 9.7a1.1 1.1 0 00.2 1.2l.05.05a1.33 1.33 0 11-1.88 1.88l-.05-.05a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1v.12a1.33 1.33 0 11-2.66 0v-.06a1.1 1.1 0 00-.72-1 1.1 1.1 0 00-1.2.2l-.05.05a1.33 1.33 0 11-1.88-1.88l.05-.05a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1-.67h-.12a1.33 1.33 0 110-2.66h.06a1.1 1.1 0 001-.72 1.1 1.1 0 00-.2-1.2l-.05-.05A1.33 1.33 0 114.7 2.47l.05.05a1.1 1.1 0 001.2.2h.06a1.1 1.1 0 00.67-1V1.65a1.33 1.33 0 112.66 0v.06a1.1 1.1 0 00.67 1 1.1 1.1 0 001.2-.2l.05-.05a1.33 1.33 0 111.88 1.88l-.05.05a1.1 1.1 0 00-.2 1.2v.06a1.1 1.1 0 001 .67h.12a1.33 1.33 0 110 2.66h-.06a1.1 1.1 0 00-1 .67z" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Settings &amp; Data Control
          </Link>
        </div>
      </div>
    </aside>
  );
}
