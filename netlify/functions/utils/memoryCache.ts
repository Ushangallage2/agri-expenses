/** Best-effort per Netlify function instance — not shared across cold starts or instances. */

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 200;

function evictExpired(now = Date.now()): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

function enforceMaxSize(): void {
  if (store.size <= MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  store.set(key, { value, expiresAt: Date.now() + ttl });
  if (store.size > MAX_ENTRIES) {
    evictExpired();
    enforceMaxSize();
  }
}

/** Delete exact key and any keys that start with the given prefix. */
export function invalidate(prefixOrKey: string): void {
  if (!prefixOrKey) return;
  store.delete(prefixOrKey);
  for (const key of store.keys()) {
    if (key.startsWith(prefixOrKey)) store.delete(key);
  }
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}
