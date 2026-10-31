import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncState } from '../types';

/**
 * Runs an async loader and exposes the loading / error / data triad every
 * data-driven screen in KEZMOTO renders. Swapping the mock service for a
 * Supabase call later requires no change here.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = []
): AsyncState<T> & { reload: (opts?: { silent?: boolean }) => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);
  // Set by reload({ silent: true }) just before bumping nonce, consumed by
  // the very next run of the fetch effect below so a background refresh
  // doesn't flip the page back to its loading skeleton.
  const silentRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState((prev) => ({ ...prev, loading: true, error: null }));

    loader()
      .then((data) => {
        if (!cancelled && mounted.current) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Something went wrong.',
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback((opts?: { silent?: boolean }) => {
    if (opts?.silent) silentRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
