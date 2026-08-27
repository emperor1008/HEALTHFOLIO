import { type ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
}

export function EmptyState({
  icon = "📋",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <span className="text-4xl mb-4" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 max-w-sm text-text-secondary">{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          loading={action.loading}
          className="mt-6"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
