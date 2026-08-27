"use client";

import { type SelectHTMLAttributes, useId } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  helpText?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function Select({
  label,
  error,
  helpText,
  options,
  placeholder,
  className = "",
  id: propId,
  ...props
}: SelectProps) {
  const autoId = useId();
  const id = propId || autoId;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text-primary">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helpText ? helpId : undefined}
        className={[
          "h-11 rounded-input border bg-surface px-3 text-base text-text-primary",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-error focus:ring-error"
            : "border-border hover:border-text-secondary/30",
          className,
        ].join(" ")}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={helpId} className="text-sm text-text-secondary">
          {helpText}
        </p>
      )}
    </div>
  );
}
