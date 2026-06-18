export type ListeningEmotion =
  | "neutral"
  | "happy"
  | "sad"
  | "surprised"
  | "angry"
  | "whisper"
  | "gentle"
  | "curious"
  | "worried"
  | "relieved";

export type ExpressiveTtsOptions = {
  enabled: boolean;
  emotion?: string;
  baseRate: string;
  basePitch: string;
  baseVolume?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
};

export type ExpressiveTtsResult = {
  emotion: ListeningEmotion;
  rate: string;
  pitch: string;
  volume: string;
};

const EMOTION_PROFILES: Record<ListeningEmotion, { rate: number; pitch: number; volume: number }> = {
  neutral: { rate: 0, pitch: 0, volume: 0 },
  happy: { rate: 6, pitch: 4, volume: 5 },
  sad: { rate: -12, pitch: -5, volume: -8 },
  surprised: { rate: 10, pitch: 8, volume: 10 },
  angry: { rate: 5, pitch: -2, volume: 15 },
  whisper: { rate: -15, pitch: -4, volume: -25 },
  gentle: { rate: -3, pitch: 1, volume: -6 },
  curious: { rate: -2, pitch: 4, volume: 0 },
  worried: { rate: -2, pitch: 1, volume: -4 },
  relieved: { rate: 1, pitch: 2, volume: 1 },
};

const EMOTION_ALIASES: Record<string, ListeningEmotion> = {
  auto: "neutral",
  neutral: "neutral",
  normal: "neutral",
  happy: "happy",
  joy: "happy",
  joyful: "happy",
  vui: "happy",
  sad: "sad",
  buon: "sad",
  surprised: "surprised",
  surprise: "surprised",
  ngacnhien: "surprised",
  angry: "angry",
  mad: "angry",
  gian: "angry",
  whisper: "whisper",
  quiet: "whisper",
  thitham: "whisper",
  gentle: "gentle",
  soft: "gentle",
  nhenhang: "gentle",
  curious: "curious",
  question: "curious",
  worried: "worried",
  anxious: "worried",
  nervous: "worried",
  lolang: "worried",
  relieved: "relieved",
  nhenhom: "relieved",
};

function compactAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function explicitEmotion(value?: string): ListeningEmotion | null {
  if (!value || value.trim().toLowerCase() === "auto") {
    return null;
  }
  return EMOTION_ALIASES[compactAlias(value)] ?? null;
}

export function inferListeningEmotion(text: string): ListeningEmotion {
  const value = text.trim();
  if (/しーっ|小声|静かに|内緒|ひそひそ/u.test(value)) {
    return "whisper";
  }
  if (/えっ|ええっ|うそ|まさか|本当|ほんとう|なんと|びっくり|[!?！？]{2,}/u.test(value)) {
    return "surprised";
  }
  if (/許せない|ひどい|いい加減|だめだ|ふざけ|怒|こら|[!！]{2,}/u.test(value)) {
    return "angry";
  }
  if (/よかった|安心|ほっと/u.test(value)) {
    return "relieved";
  }
  if (/うれしい|嬉しい|ありがとう|楽しい|楽しみ|やった|わあ|最高/u.test(value)) {
    return "happy";
  }
  if (/困りました|なくしました|忘れました|心配|どうしよう/u.test(value)) {
    return "worried";
  }
  if (/悲しい|かなしい|残念|つらい|寂しい|さびしい/u.test(value)) {
    return "sad";
  }
  if (/[?？]\s*$|(?:ですか|ますか|でしょうか|かな)[。．]?\s*$/u.test(value)) {
    return "curious";
  }
  if (/すみません|お願いします|ください|大丈夫|ゆっくり/u.test(value)) {
    return "gentle";
  }
  return "neutral";
}

function parseSignedValue(value: string | undefined, suffix: "%" | "Hz", fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value.replace(suffix, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signed(value: number, suffix: "%" | "Hz"): string {
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveExpressiveTts(text: string, options: ExpressiveTtsOptions): ExpressiveTtsResult {
  const manualEmotion = explicitEmotion(options.emotion);
  const emotion = manualEmotion ?? (options.enabled ? inferListeningEmotion(text) : "neutral");
  const profile = EMOTION_PROFILES[emotion];
  const baseRate = parseSignedValue(options.rate || options.baseRate, "%", -5);
  const basePitch = parseSignedValue(options.pitch || options.basePitch, "Hz", 0);
  const baseVolume = parseSignedValue(options.volume || options.baseVolume, "%", 0);

  return {
    emotion,
    rate: signed(clamp(baseRate + profile.rate, -45, 35), "%"),
    pitch: signed(clamp(basePitch + profile.pitch, -20, 20), "Hz"),
    volume: signed(clamp(baseVolume + profile.volume, -50, 30), "%"),
  };
}
