import assert from "node:assert/strict";
import test from "node:test";
import { SerializedMutationQueue, isCurrentSettingsResponse } from "../app/client-mutation-queue.ts";

test("sérialise les réponses lentes dans l'ordre des actions", async () => {
  const queue = new SerializedMutationQueue();
  const order: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const first = queue.enqueue(async () => {
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    order.push("first");
  });
  const second = queue.enqueue(async () => { order.push("second"); });
  await Promise.resolve();
  assert.deepEqual(order, []);
  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first", "second"]);
});

test("continue la file après une mutation en erreur", async () => {
  const queue = new SerializedMutationQueue();
  const failed = queue.enqueue(async () => { throw new Error("réseau"); });
  const following = queue.enqueue(async () => "saved");
  await assert.rejects(failed, /réseau/);
  assert.equal(await following, "saved");
});

test("ignore une lecture de réglages plus ancienne que la sauvegarde", () => {
  assert.equal(isCurrentSettingsResponse(4, 5), false);
  assert.equal(isCurrentSettingsResponse(5, 5), true);
});
