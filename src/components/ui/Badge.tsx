import { type HTMLAttributes, type ReactNode } from "react";

type BadgeVariant =
  | "verified"
  | "review"
  | "processing"
  | "failed"
  | "excluded"
  | "info"
  | "default";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  verified: "bg-success/10 text-success border-success/20",
  review: "bg-warning/10 text-warning border-warning/20",
  processing: "bg-info/10 text-info border-info/20",
  failed: "bg-error/10 text-error border-error/20",
  excluded: "bg-text-secondary/10 text-text-secondary border-text-secondary/20",
  info: "bg-info/10 text-info border-info/20",
  default: "bg-canvas text-text-secondary border-border",
};

const variantLabels: Record<BadgeVariant, string> = {
  verified: "Verified",
  review: "Needs review",
  processing: "Processing",
  failed: "Failed",
  excluded: "Excluded",
  info: "Info",
  default: "",
};

export function Badge({
  variant = "default",
  icon,
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {icon}
      {children || variantLabels[variant]}
    </span>
  );
}
