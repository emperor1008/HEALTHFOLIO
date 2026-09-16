"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { PRIMARY_NAV_ITEMS } from "./Sidebar";

/**
 * Mobile bottom navigation — the same five primary destinations as the
 * desktop sidebar. Every target meets the 44px touch minimum.
 */
export function MobileNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface md:hidden"
      aria-label="Primary Navigation"
    >
      <div className="flex items-stretch justify-around px-1 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const isActive = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex min-h-touch min-w-touch flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-text-secondary",
              ].join(" ")}
            >
              <span className="relative flex flex-col items-center">
                {isActive && !reduceMotion && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className="absolute -top-1 h-1 w-6 rounded-full bg-primary"
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                {isActive && reduceMotion && (
                  <span className="absolute -top-1 h-1 w-6 rounded-full bg-primary" />
                )}
                <span className={isActive ? "text-primary" : "text-text-secondary"}>
                  {item.icon}
                </span>
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
