"use client";

import Link from "next/link";
import Image from "next/image";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
      <Link href="/dashboard" className="flex items-center md:hidden">
        <Image
          src="/branding/healthfolio-logo.png"
          alt="Healthfolio"
          width={120}
          height={36}
          className="h-8 w-auto"
          style={{ objectFit: "contain" }}
          priority
        />
      </Link>
      {/* Desktop: logo is in sidebar, leave this empty */}
      <div className="hidden md:block" />
    </header>
  );
}
