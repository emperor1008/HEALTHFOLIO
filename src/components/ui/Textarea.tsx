"use client";

import { type TextareaHTMLAttributes, useId } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helpText?: string;
}

export function Textarea({
  label,
  error,
  helpText,
  className = "",
  id: propId,
  ...props
}: TextareaProps) {
  const autoId = useId();
  const id = propId || autoId;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text-primary">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helpText ? helpId : undefined}
        className={[
          "min-h-[120px] rounded-input border bg-surface px-3 py-2.5 text-base text-text-primary",
          "placeholder:text-text-secondary/50",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y",
          error
            ? "border-error focus:ring-error"
            : "border-border hover:border-text-secondary/30",
          className,
        ].join(" ")}
        {...props}
      />
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
