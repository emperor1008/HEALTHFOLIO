"use client";

import { type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover focus-visible:ring-primary active:bg-primary-hover disabled:bg-primary/50",
  secondary:
    "border border-border bg-surface text-text-primary hover:bg-canvas focus-visible:ring-primary active:bg-canvas disabled:opacity-50",
  ghost:
    "bg-transparent text-text-secondary hover:text-text-primary hover:bg-canvas focus-visible:ring-primary active:bg-canvas disabled:opacity-50",
  destructive:
    "bg-error text-white hover:bg-error/90 focus-visible:ring-error active:bg-error/80 disabled:bg-error/50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-base",
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-input font-semibold transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed",
        "touch-target",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading && <Spinner size="sm" className="shrink-0" />}
      {loading ? loadingText || children : children}
    </button>
  );
}
