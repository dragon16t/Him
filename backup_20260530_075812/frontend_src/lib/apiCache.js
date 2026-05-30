// Tiny session-storage GET cache for axios.
// Idea: identical GET requests during the same browser session return the cached
// payload immediately while a fresh request runs in the background and updates
// the cache (stale-while-revalidate). This eliminates the "every tab click waits
// 100-400ms" feeling without sacrificing freshness.
//
// Use it like:
//   import { cachedGet } from "@/lib/apiCache";
//   const data = await cachedGet("/api/orders");  // first call hits network, subsequent calls instant
//
// Drop-in for `axios.get(url)` when you want SWR-ish behaviour.

import axios from "axios";

const TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough to feel instant, short enough to not be stale

const memoryCache = new Map(); // url -> { data, ts, etag }

const sessionKey = (url) => `__apc_${url}`;

function readSession(url) {
  try {
    const raw = sessionStorage.getItem(sessionKey(url));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSession(url, entry) {
  try { sessionStorage.setItem(sessionKey(url), JSON.stringify(entry)); } catch {}
}

export async function cachedGet(url, { ttl = TTL_MS, swr = true, ...axiosOpts } = {}) {
  const now = Date.now();
  let entry = memoryCache.get(url) || readSession(url);
  const isFresh = entry && now - entry.ts < ttl;
  if (isFresh && !swr) return entry.data;

  // SWR: return stale immediately, refresh in background.
  if (entry && swr) {
    // Fire-and-forget refresh
    axios.get(url, axiosOpts).then(({ data }) => {
      const next = { data, ts: Date.now() };
      memoryCache.set(url, next);
      writeSession(url, next);
    }).catch(() => {});
    return entry.data;
  }

  // No cache → real fetch
  const { data } = await axios.get(url, axiosOpts);
  const next = { data, ts: now };
  memoryCache.set(url, next);
  writeSession(url, next);
  return data;
}

export function invalidate(urlPrefix) {
  // Drop any cached URL starting with urlPrefix (used after a mutation).
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(urlPrefix)) memoryCache.delete(k);
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(`__apc_${urlPrefix}`)) sessionStorage.removeItem(k);
    }
  } catch {}
}

export function clearAllCache() {
  memoryCache.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("__apc_")) sessionStorage.removeItem(k);
    }
  } catch {}
}
