const DEFAULT_TIMEOUT_MS = 10_000;

/** Bound provider calls so one stalled upstream cannot stall the e-paper snapshot. */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
