export type LearningProgressKind = "kanji" | "vocab";

export type LearningProgressSnapshot = {
  id: string;
  href: string;
  kind: LearningProgressKind;
  title: string;
  mode: string;
  currentIndex: number;
  totalCount: number;
  percent: number;
  currentLabel: string;
  subLabel: string;
  hardCount: number;
  updatedAt: number;
  itemSignature: string;
  hardItemIds?: string[];
  isHardReview?: boolean;
  order?: number[];
  isShuffled?: boolean;
};

const STORAGE_KEY = "jp-learning-progress:v1";
const UPDATED_EVENT = "jp-learning-progress-updated";
const MAX_PROGRESS_ITEMS = 6;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeSnapshot(input: unknown): LearningProgressSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Partial<LearningProgressSnapshot>;
  const href = typeof raw.href === "string" ? raw.href.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!href || !title) {
    return null;
  }
  const kind: LearningProgressKind = raw.kind === "kanji" ? "kanji" : "vocab";
  const totalCount = Math.max(0, Math.round(Number(raw.totalCount ?? 0)));
  const currentIndex = Math.max(0, Math.round(Number(raw.currentIndex ?? 0)));
  const percent = Math.max(0, Math.min(100, Math.round(Number(raw.percent ?? 0))));
  const hardItemIds = Array.isArray(raw.hardItemIds)
    ? raw.hardItemIds.filter((item): item is string => typeof item === "string")
    : [];
  const order = Array.isArray(raw.order)
    ? raw.order
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0)
    : [];

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : href,
    href,
    kind,
    title,
    mode: typeof raw.mode === "string" ? raw.mode : "",
    currentIndex,
    totalCount,
    percent,
    currentLabel: typeof raw.currentLabel === "string" ? raw.currentLabel : "",
    subLabel: typeof raw.subLabel === "string" ? raw.subLabel : "",
    hardCount: Math.max(0, Math.round(Number(raw.hardCount ?? hardItemIds.length))),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    itemSignature: typeof raw.itemSignature === "string" ? raw.itemSignature : "",
    hardItemIds,
    isHardReview: Boolean(raw.isHardReview),
    order,
    isShuffled: Boolean(raw.isShuffled),
  };
}

export function readLearningProgressList(): LearningProgressSnapshot[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((entry) => normalizeSnapshot(entry))
      .filter((entry): entry is LearningProgressSnapshot => Boolean(entry))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROGRESS_ITEMS);
  } catch {
    return [];
  }
}

export function readLearningProgress(href: string): LearningProgressSnapshot | null {
  return readLearningProgressList().find((item) => item.href === href) ?? null;
}

export function upsertLearningProgress(snapshot: LearningProgressSnapshot): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) {
      return;
    }
    const next = [
      normalized,
      ...readLearningProgressList().filter((item) => item.href !== normalized.href),
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROGRESS_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // Progress is nice-to-have; studying should never break because storage is full.
  }
}

export function clearLearningProgress(href: string): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    const next = readLearningProgressList().filter((item) => item.href !== href);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // Ignore storage issues.
  }
}

export function learningProgressUpdatedEventName(): string {
  return UPDATED_EVENT;
}
