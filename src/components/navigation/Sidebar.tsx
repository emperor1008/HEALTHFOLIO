"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 7.5L10 2l7 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 17V10h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Records",
    href: "/records",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 6h6M7 10h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Timeline",
    href: "/timeline",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Health Tracking",
    href: "/health-tracking",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 14l4-4 3 3 4-5 5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Test Reports",
    href: "/records/reports",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 3h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="14" r="3" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
  {
    label: "Routine",
    href: "/routine",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Medicines",
    href: "/medicines",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2v16M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Ask",
    href: "/ask",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M18 11.5a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 8.5a1.5 1.5 0 113 0c0 .83-.67 1.25-1.5 1.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || "");
    }
    loadUser();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/bootstrap");
  }

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface md:block">
      <div className="flex h-full flex-col">        {/* Logo */}
        <div className="p-4">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/branding/healthfolio-logo.png"
              alt="Healthfolio"
              width={140}
              height={40}
              className="h-10 w-auto"
              style={{ objectFit: "contain" }}
              priority
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-canvas hover:text-text-primary",
                ].join(" ")}
              >
                <span className={isActive ? "text-primary" : "text-text-secondary"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile menu */}
        <div className="border-t border-border p-2" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-canvas hover:text-text-primary transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {userEmail ? userEmail[0].toUpperCase() : "?"}
            </div>
            <span className="truncate text-left flex-1">{userEmail || "Account"}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {profileOpen && (
            <div className="mt-1 rounded-lg border border-border bg-surface py-1 shadow-sm">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-canvas hover:text-text-primary"
                onClick={() => setProfileOpen(false)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M13.3 9.7a1.1 1.1 0 00.2 1.2l.05.05a1.33 1.33 0 11-1.88 1.88l-.05-.05a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1v.12a1.33 1.33 0 11-2.66 0v-.06a1.1 1.1 0 00-.72-1 1.1 1.1 0 00-1.2.2l-.05.05a1.33 1.33 0 11-1.88-1.88l.05-.05a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1-.67h-.12a1.33 1.33 0 110-2.66h.06a1.1 1.1 0 001-.72 1.1 1.1 0 00-.2-1.2l-.05-.05A1.33 1.33 0 114.7 2.47l.05.05a1.1 1.1 0 001.2.2h.06a1.1 1.1 0 00.67-1V1.65a1.33 1.33 0 112.66 0v.06a1.1 1.1 0 00.67 1 1.1 1.1 0 001.2-.2l.05-.05a1.33 1.33 0 111.88 1.88l-.05.05a1.1 1.1 0 00-.2 1.2v.06a1.1 1.1 0 001 .67h.12a1.33 1.33 0 110 2.66h-.06a1.1 1.1 0 00-1 .67z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-canvas hover:text-error"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M11 11l3-3-3-3M6 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
