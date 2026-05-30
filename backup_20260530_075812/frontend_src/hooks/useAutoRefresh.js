import { useEffect, useRef, useState } from "react";

/**
 * useAutoRefresh — poll a fetcher on an interval; respects document.visibilityState
 * so we don't waste calls when the tab is hidden.
 *
 *   useAutoRefresh(fetchData, { interval: 60000, enabled: true });
 */
export function useAutoRefresh(fetcher, { interval = 60000, enabled = true } = {}) {
  const ref = useRef(fetcher);
  ref.current = fetcher;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (document.visibilityState === "visible") ref.current?.(); };
    const id = setInterval(tick, interval);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [interval, enabled]);
}

/**
 * useAutoSave — debounced write to localStorage for draft text.
 *
 *   useAutoSave(`script-${id}`, value, 5000);
 */
export function useAutoSave(key, value, delay = 5000) {
  useEffect(() => {
    if (value === undefined || value === null || value === "") return;
    const t = setTimeout(() => { try { localStorage.setItem(key, String(value)); } catch {} }, delay);
    return () => clearTimeout(t);
  }, [key, value, delay]);
}

/**
 * useDebounce — debounce a fast-changing value (search input).
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
