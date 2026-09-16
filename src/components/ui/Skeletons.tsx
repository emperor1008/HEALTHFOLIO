import { type HTMLAttributes } from "react";

/**
 * Warm skeleton primitives using the shimmer utility from globals.css.
 * Compose these instead of showing blank pages or bare spinners.
 */

export function SkeletonLine({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`skeleton h-4 ${className}`} {...props} />;
}

export function SkeletonCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 ${className}`}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-5 w-2/3" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
        <SkeletonLine className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-8" aria-hidden="true" aria-busy="true">
      <div className="space-y-3">
        <SkeletonLine className="h-8 w-72" />
        <SkeletonLine className="h-4 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-6">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="mt-3 h-8 w-24" />
          <SkeletonLine className="mt-3 h-3 w-40" />
        </div>
        <div className="rounded-card border border-border bg-surface p-6">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="mt-3 h-8 w-24" />
          <SkeletonLine className="mt-3 h-3 w-40" />
        </div>
      </div>
      <SkeletonList count={2} />
    </div>
  );
}
