import { Fragment, type ReactElement, type ReactNode } from "react";

export interface SafeListProps<T> {
  data: T[] | undefined | null;
  loading?: boolean;
  error?: Error | null;
  empty?: ReactNode;
  children: (item: T, index: number) => ReactNode;
  /**
   * Stable key extractor. Strongly preferred over the index fallback —
   * index keys break animation and re-mount assumptions whenever items
   * reorder or get removed. Provide this whenever items have a UUID or
   * similar stable identifier.
   */
  keyFn?: (item: T, index: number) => string | number;
}

/**
 * Defensive list renderer. Collapses the loading / error / empty / data
 * state machine into a single component so callers never have to guard
 * `.map()` against undefined or null.
 */
export function SafeList<T>(props: SafeListProps<T>): ReactElement {
  const { data, loading, error, empty, children, keyFn } = props;

  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!data || data.length === 0) {
    return <>{empty ?? <EmptyState />}</>;
  }

  return (
    <>
      {data.map((item, index) => (
        <Fragment key={keyFn ? keyFn(item, index) : index}>
          {children(item, index)}
        </Fragment>
      ))}
    </>
  );
}

export function ListSkeleton(): ReactElement {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 w-full animate-pulse rounded-lg bg-zinc-800/50"
        />
      ))}
    </div>
  );
}

export function ErrorState({ message }: { message: string }): ReactElement {
  return (
    <div
      role="alert"
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-red-400"
    >
      {message}
    </div>
  );
}

export function EmptyState({
  message = "No items",
}: {
  message?: string;
}): ReactElement {
  return (
    <div className="py-8 text-center text-sm text-zinc-500">{message}</div>
  );
}
