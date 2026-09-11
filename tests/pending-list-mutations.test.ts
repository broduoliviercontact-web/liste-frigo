import assert from "node:assert/strict";
import test from "node:test";
import { loadPendingListMutations, PENDING_LIST_MUTATION_TTL_MS, savePendingListMutations } from "../app/pending-list-mutations.ts";

class MemoryStorage { values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }

test("conserve la clé et le contenu, puis exclut une opération expirée", () => {
  const storage = new MemoryStorage();
  savePendingListMutations(storage as unknown as Storage, [{ id: "key", action: { action: "addItem", label: "lait" }, createdAt: 100, status: "uncertain" }]);
  assert.deepEqual(loadPendingListMutations(storage as unknown as Storage, 101), [{ id: "key", action: { action: "addItem", label: "lait" }, createdAt: 100, status: "uncertain" }]);
  assert.deepEqual(loadPendingListMutations(storage as unknown as Storage, 100 + PENDING_LIST_MUTATION_TTL_MS), []);
});
