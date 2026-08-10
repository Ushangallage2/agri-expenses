/** Session-scoped SWR-style cache (free, no backend). */

const PREFIX = "agri:v1:";

type CacheEntry<T> = {
  savedAt: number;
  data: T;
};

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readCache<T>(key: string, maxAgeMs = 60_000): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== "number") return null;
    if (Date.now() - entry.savedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/** Read even if stale (for instant paint); returns ageMs. */
export function readCacheAllowStale<T>(
  key: string
): { data: T; ageMs: number } | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== "number") return null;
    return { data: entry.data, ageMs: Date.now() - entry.savedAt };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  const s = storage();
  if (!s) return;
  try {
    const entry: CacheEntry<T> = { savedAt: Date.now(), data };
    s.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Invalidate one key or all keys starting with prefix. */
export function invalidateCache(keyOrPrefix: string): void {
  const s = storage();
  if (!s) return;
  const full = PREFIX + keyOrPrefix;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      if (k === full || k.startsWith(full)) toRemove.push(k);
    }
    for (const k of toRemove) s.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Apply cached data immediately (if any), then fetch fresh and update.
 * Returns the fresh payload (or cached if fetch fails and cache exists).
 */
export async function swrLoad<T>(opts: {
  key: string;
  freshMaxAgeMs?: number;
  fetcher: () => Promise<T>;
  apply: (data: T, meta: { fromCache: boolean; stale: boolean }) => void;
}): Promise<T> {
  const freshMax = opts.freshMaxAgeMs ?? 45_000;
  const hit = readCacheAllowStale<T>(opts.key);
  if (hit) {
    opts.apply(hit.data, {
      fromCache: true,
      stale: hit.ageMs > freshMax,
    });
  }

  try {
    const fresh = await opts.fetcher();
    writeCache(opts.key, fresh);
    opts.apply(fresh, { fromCache: false, stale: false });
    return fresh;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}

export function deferWork(fn: () => void, delayMs = 0) {
  if (typeof window === "undefined") {
    fn();
    return;
  }
  const run = () => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  };
  if (delayMs > 0) {
    window.setTimeout(run, delayMs);
    return;
  }
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") {
    ric(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 50);
  }
}
