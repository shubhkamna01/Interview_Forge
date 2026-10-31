import { useCallback, useEffect, useState, type DependencyList } from "react";
import { errorMessage } from "../api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** True during the first load and every reload. Old data stays visible meanwhile. */
  loading: boolean;
  reload: () => void;
}

/** Loads data when the page opens (and whenever `deps` change). `reload()` fetches again. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
