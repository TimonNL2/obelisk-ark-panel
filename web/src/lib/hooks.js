import { useCallback, useEffect, useRef, useState } from 'react';

/** Fetch data and refresh it on an interval (paused while the browser tab is hidden). */
export function usePoll(fetcher, intervalMs, deps = []) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const d = await fetchRef.current();
      setData(d);
      setError(null);
      return d;
    } catch (err) {
      setError(err);
      return undefined;
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    reload();
    if (!intervalMs) return undefined;
    const t = setInterval(() => { if (!document.hidden) reload(); }, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, reload, ...deps]);

  return { data, error, reload, setData, loading: data === undefined && !error };
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}
