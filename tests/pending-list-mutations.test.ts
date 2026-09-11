import assert from "node:assert/strict";
import test from "node:test";
import { loadPendingListMutations, PENDING_LIST_MUTATION_TTL_MS, savePendingListMutations, updatePendingListMutations } from "../app/pending-list-mutations.ts";

class MemoryStorage { values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }

test("conserve la clé et le contenu, puis exclut une opération expirée", () => {
  const storage = new MemoryStorage();
  savePendingListMutations(storage as unknown as Storage, [{ id: "key", action: { action: "addItem", label: "lait" }, createdAt: 100, status: "uncertain" }]);
  assert.deepEqual(loadPendingListMutations(storage as unknown as Storage, 101), [{ id: "key", action: { action: "addItem", label: "lait" }, createdAt: 100, status: "uncertain" }]);
  assert.deepEqual(loadPendingListMutations(storage as unknown as Storage, 100 + PENDING_LIST_MUTATION_TTL_MS), []);
});

test("une écriture actuelle conserve une opération expirée incertaine", async () => {
  const storage = new MemoryStorage();
  const expired = { id: "old-key", action: { action: "addItem", label: "lait" }, createdAt: 0, status: "uncertain" as const };
  savePendingListMutations(storage as unknown as Storage, [expired]);
  await updatePendingListMutations(storage as unknown as Storage, (entries) => [...entries, { id: "new-key", action: { action: "addItem", label: "pain" }, createdAt: Date.now(), status: "pending" }]);
  const persisted = JSON.parse(storage.getItem("supervie-pending-list-mutations") ?? "[]");
  assert.deepEqual(persisted.map((entry: { id: string }) => entry.id), ["old-key", "new-key"]);
  assert.deepEqual(loadPendingListMutations(storage as unknown as Storage).map((entry) => entry.id), ["new-key"]);
});
