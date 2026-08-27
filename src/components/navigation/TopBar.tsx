"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect width="24" height="24" rx="6" fill="#0F5C5E" />
            <path
              d="M7 8h10M7 12h6M7 16h8"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Healthfolio</span>
        </Link>

        {/* Account menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-canvas hover:text-text-primary transition-colors duration-150"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-card border border-border bg-surface py-1 shadow-lg">
                <Link
                  href="/settings"
                  className="flex h-11 items-center px-4 text-sm text-text-primary hover:bg-canvas transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex h-11 w-full items-center px-4 text-sm text-text-primary hover:bg-canvas transition-colors text-left"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
