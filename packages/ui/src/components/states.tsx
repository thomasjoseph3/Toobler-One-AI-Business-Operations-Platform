import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { joinClassNames } from '../join-class-names';

export interface EmptyStateProps {
  /** An outline icon (20 or 24 px). */
  icon: ReactNode;
  /** What belongs here. */
  title: string;
  /** What to do next, in plain words. */
  description: string;
  /** The one relevant next action, usually a primary Button. */
  action?: ReactNode;
}

/** Shown when a list has nothing in it: says what belongs here and offers the next step. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary"
      >
        {icon}
      </span>
      <h2 className="text-base-heading text-text-primary">{title}</h2>
      <p className="text-sm-body max-w-md text-text-secondary">{description}</p>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  /** What happened, in plain language. */
  description: string;
  /** A safe retry or recovery action, usually a secondary Button. */
  action?: ReactNode;
}

/** Shown when a list or page could not load: explains what happened and offers a way to try again. */
export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-error-bg text-error">
        <AlertTriangle className="size-6" />
      </span>
      <h2 className="text-base-heading text-text-primary">{title}</h2>
      <p className="text-sm-body max-w-md text-text-secondary">{description}</p>
      {action}
    </div>
  );
}

/** A grey placeholder block that pulses while content loads. Keep its size close to the real content. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={joinClassNames('animate-pulse rounded-md bg-surface-muted', className)} />;
}

/** Placeholder rows for a loading list, announced to screen readers as "loading". */
export function LoadingState({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_unused, rowNumber) => (
        <Skeleton key={rowNumber} className="h-12 w-full" />
      ))}
    </div>
  );
}
