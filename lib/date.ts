const TOKYO_TIMEZONE = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TOKYO_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toTokyoDateKey(date: Date): string {
  return ymdFormatter.format(date);
}

function dateKeyToEpoch(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dayDiffInTokyo(later: Date, earlier: Date): number {
  const laterMs = dateKeyToEpoch(toTokyoDateKey(later));
  const earlierMs = dateKeyToEpoch(toTokyoDateKey(earlier));
  return Math.floor((laterMs - earlierMs) / DAY_MS);
}

export function formatTokyoDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TOKYO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
