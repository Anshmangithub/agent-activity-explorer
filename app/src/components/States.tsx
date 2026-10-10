import type { ReactNode } from "react";
import type { ApiError } from "../api";

export function ErrorState({ error, onRetry, title = "Couldn't load data" }: { error: ApiError; onRetry: () => void; title?: string }) {
  return (
    <div className="state state-error" role="alert">
      <h2>{title}</h2>
      <p>{error.message}</p>
      <button className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function LoadingHint({ label, slow }: { label: string; slow: boolean }) {
  return (
    <p className="loading-hint" role="status">
      {slow ? `${label} is taking longer than usual. The server may be busy; still trying…` : `${label}…`}
    </p>
  );
}

export function SkeletonRows({ count = 12 }: { count?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  );
}
