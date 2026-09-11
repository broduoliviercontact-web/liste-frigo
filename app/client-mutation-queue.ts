export class SerializedMutationQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function isCurrentSettingsResponse(requestRevision: number, currentRevision: number) {
  return requestRevision === currentRevision;
}
