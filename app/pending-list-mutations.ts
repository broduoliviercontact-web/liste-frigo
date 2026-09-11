export const PENDING_LIST_MUTATIONS_KEY = "supervie-pending-list-mutations";
export const PENDING_LIST_MUTATION_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingListMutation = { id: string; action: Record<string, unknown>; createdAt: number; status: "pending" | "uncertain" | "rejected" | "rate_limited" | "auth_required"; nextAttemptAt?: number; error?: string; retryCount?: number };

export type LoadedPendingListMutations = { entries: PendingListMutation[]; expired: PendingListMutation[]; unavailable: boolean };

function parsePendingListMutations(storage: Storage): PendingListMutation[] {
  const value: unknown = JSON.parse(storage.getItem(PENDING_LIST_MUTATIONS_KEY) ?? "[]");
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PendingListMutation => Boolean(entry) && typeof entry === "object" && typeof (entry as PendingListMutation).id === "string" && typeof (entry as PendingListMutation).createdAt === "number");
}

export function readPendingListMutations(storage: Storage, now = Date.now()): LoadedPendingListMutations {
  const entries = parsePendingListMutations(storage);
  return {
    entries: entries.filter((entry) => now - entry.createdAt < PENDING_LIST_MUTATION_TTL_MS),
    expired: entries.filter((entry) => now - entry.createdAt >= PENDING_LIST_MUTATION_TTL_MS),
    unavailable: false,
  };
}

export function loadPendingListMutations(storage: Storage, now = Date.now()): PendingListMutation[] {
  try { return readPendingListMutations(storage, now).entries; } catch { return []; }
}
export function savePendingListMutations(storage: Storage, entries: PendingListMutation[]) { storage.setItem(PENDING_LIST_MUTATIONS_KEY, JSON.stringify(entries)); }

function withLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request<Promise<T>>(name, operation).then((result) => result);
  return operation();
}

export function supportsPendingMutationLocks() {
  return typeof navigator !== "undefined" && Boolean(navigator.locks);
}

export function updatePendingListMutations(storage: Storage, update: (entries: PendingListMutation[]) => PendingListMutation[]) {
  return withLock("supervie-pending-list-mutations-journal", async () => {
    const next = update(readPendingListMutations(storage).entries);
    savePendingListMutations(storage, next);
    return next;
  });
}

export function withPendingListMutationLock<T>(id: string, operation: () => Promise<T>) {
  return withLock(`supervie-pending-list-mutation-${id}`, operation);
}
