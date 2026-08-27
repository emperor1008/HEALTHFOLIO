import { type HTMLAttributes } from "react";

type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-3",
};

export function Spinner({ size = "md", className = "", ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={[
        "animate-spin rounded-full border-current border-t-transparent",
        sizeStyles[size],
        className,
      ].join(" ")}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
