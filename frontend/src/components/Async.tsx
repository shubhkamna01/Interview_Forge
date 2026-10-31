import type { ReactNode } from "react";
import type { AsyncState } from "../hooks/useAsync";

export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <article className="panel data-status" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </article>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <article className="panel data-status" role="alert">
      <h2>Couldn't load this</h2>
      <p>{message ?? "Something went wrong."}</p>
      <button className="primary-button" onClick={onRetry}>
        Try again
      </button>
    </article>
  );
}

/** Shows a spinner, an error with a retry button, or the page once data is there. */
export function Async<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.data === null) {
    return state.error ? <ErrorPanel message={state.error} onRetry={state.reload} /> : <LoadingPanel />;
  }
  return <>{children(state.data)}</>;
}
