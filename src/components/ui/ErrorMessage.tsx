import { type HTMLAttributes, type ReactNode } from "react";

interface ErrorMessageProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  action?: ReactNode;
  onDismiss?: () => void;
}

export function ErrorMessage({
  title = "Something went wrong",
  message,
  action,
  onDismiss,
  className = "",
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={[
        "rounded-card border border-error/20 bg-error/5 p-6",
        className,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg text-error" aria-hidden="true">
          ⚠
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-error">{title}</h3>
          <p className="mt-1 text-sm text-text-secondary">{message}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}
