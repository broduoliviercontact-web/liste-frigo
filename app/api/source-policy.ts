export const TLE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export function tleEpoch(line: string) {
  const year = Number(line.slice(18, 20));
  const day = Number(line.slice(20, 32));
  if (!Number.isFinite(year) || !Number.isFinite(day) || day < 1 || day >= 367) return NaN;
  return Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86400000;
}
export function freshTle(epoch: number, now = Date.now()) {
  return Number.isFinite(epoch) && epoch <= now && now - epoch <= TLE_MAX_AGE_MS;
}
export function retryDeadline(value: string | null, now = Date.now()) {
  if (value && /^\d+$/.test(value.trim())) return now + Number(value) * 1000;
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 60_000;
}
