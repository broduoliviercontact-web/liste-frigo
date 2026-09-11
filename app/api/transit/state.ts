export const SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000;

type Passage = { time: string; destination: string };
export type TransitLine = {
  label: string;
  mode: "metro" | "bus";
  stop: string;
  direction?: string;
  available: boolean;
  passages: Passage[];
};

export function isFreshTransit(updatedAt: string, now = Date.now()) {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= SNAPSHOT_MAX_AGE_MS;
}

/** Apply freshness on every read, including memory and failed-provider fallbacks. */
export function currentTransit<T extends TransitLine>(snapshot: { updatedAt: string; lines: T[] }, now = Date.now()) {
  const fresh = isFreshTransit(snapshot.updatedAt, now);
  const lines = snapshot.lines.map((line) => {
    const passages = fresh && line.available ? line.passages.filter((passage) => {
      const departureAt = Date.parse(passage.time);
      return Number.isFinite(departureAt) && departureAt >= now - 60_000;
    }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)) : [];
    return { ...line, passages, available: passages.length > 0 };
  });
  return {
    status: lines.some((line) => line.available) ? "ready" as const : "unavailable" as const,
    updatedAt: snapshot.updatedAt,
    lines,
  };
}

/** Past departures are never clamped to zero. Zero means now or <30s ahead. */
export function epaperTransit(snapshot: { updatedAt: string; lines: TransitLine[] }, now = Date.now()) {
  const current = currentTransit(snapshot, now);
  const lines = current.lines.map((line) => {
    const groups: Record<string, { destination: string; minutes: number[] }> = {};
    for (const passage of line.passages) {
      const delta = Date.parse(passage.time) - now;
      if (delta < 0) continue;
      const minutes = Math.round(delta / 60_000);
      // Keep the integer contract understood by the device (0..180 minutes).
      if (minutes > 180) continue;
      const destination = passage.destination || line.direction || line.stop;
      const group = groups[destination] ?? { destination, minutes: [] };
      group.minutes.push(minutes);
      groups[destination] = group;
    }
    const directions = Object.values(groups)
      .sort((a, b) => a.minutes[0] - b.minutes[0]).slice(0, 2);
    return { label: line.label, mode: line.mode, stop: line.stop, available: directions.length > 0, directions };
  });
  return { status: lines.some((line) => line.available) ? "ready" as const : "unavailable" as const, updatedAt: current.updatedAt, lines };
}
