export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : null;
}

export function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function isoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day ? value : null;
}

/** Empty time means an all-day event. Non-empty times must be real HH:MM. */
export function agendaTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? value : undefined;
}

export function boundedDuration(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 15 || value > 720) return undefined;
  return Math.round(value / 15) * 15;
}
