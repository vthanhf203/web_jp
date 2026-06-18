import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCurrentUser } from "@/lib/auth";
import {
  getActiveGeminiApiKey,
  markGeminiApiKeyFailure,
  markGeminiApiKeySuccess,
  type GeminiKeyStatus,
} from "@/lib/gemini-key-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 8000;
const MAX_SEGMENTS = 120;
const CACHE_DIR = path.join(process.cwd(), ".cache", "listening-tts");
const GEMINI_CACHE_DIR = path.join(CACHE_DIR, "gemini");
const DEMO_FALLBACK_AUDIO = path.join(process.cwd(), "public", "listening-demo", "jlpt-demo-nanami.mp3");
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 65_000;
const ALLOWED_VOICES = new Set([
  "ja-JP-NanamiNeural",
  "ja-JP-KeitaNeural",
  "ja-JP-AoiNeural",
  "ja-JP-DaichiNeural",
  "ja-JP-ShioriNeural",
  "ja-JP-MayuNeural",
  "ja-JP-NaokiNeural",
  "ja-JP-MasaruMultilingualNeural",
]);
const RATE_PATTERN = /^[+-]?\d{1,3}%$/;
const VOLUME_PATTERN = /^[+-]?\d{1,3}%$/;
const PITCH_PATTERN = /^[+-]?\d{1,3}Hz$/;
const NO_AUDIO_PATTERN = /NoAudioReceived|No audio was received/i;
const CHUNK_SENTENCE_MAX_LENGTH = 90;
const MALE_EDGE_VOICES = new Set([
  "ja-JP-KeitaNeural",
  "ja-JP-DaichiNeural",
  "ja-JP-NaokiNeural",
  "ja-JP-MasaruMultilingualNeural",
]);
const GEMINI_EMOTION_TAGS: Record<string, string> = {
  happy: "relieved, with a subtle smile",
  sad: "sadly, quietly",
  surprised: "amazed, briefly",
  angry: "serious, with controlled frustration",
  whisper: "whispers",
  worried: "slightly nervous, at a normal conversational pace",
  relieved: "with quiet relief, without slowing down",
};

const geminiCooldowns = new Map<string, number>();

class GeminiTtsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GeminiTtsError";
  }
}

type TtsSegment = {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
  emotion?: string;
};

type TtsPayload = {
  text?: unknown;
  voice?: unknown;
  rate?: unknown;
  pitch?: unknown;
  volume?: unknown;
  provider?: unknown;
  expressive?: unknown;
  context?: unknown;
  segments?: unknown;
  allowFallbackDemo?: unknown;
};

type VoicePreset = {
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeText(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(text)) {
    return false;
  }
  return fallback;
}

function responseJson(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, { status });
}

function audioResponse(audio: Buffer, contentType = "audio/mpeg", extraHeaders?: HeadersInit) {
  const body = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...extraHeaders,
    },
  });
}

function cacheKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

function uniqueBy<T>(items: T[], toKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = toKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function normalizeSegments(input: unknown): TtsSegment[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const text = normalizeText(raw.text);
      const voice = normalizeText(raw.voice) || "ja-JP-NanamiNeural";
      const rate = normalizeText(raw.rate) || "-5%";
      const pitch = normalizeText(raw.pitch) || "+0Hz";
      const volume = normalizeText(raw.volume) || "+0%";
      const emotion = normalizeText(raw.emotion).toLowerCase() || undefined;
      if (!text) {
        return null;
      }
      const segment: TtsSegment = { text, voice, rate, pitch, volume };
      if (emotion) {
        segment.emotion = emotion;
      }
      return segment;
    })
    .filter((entry): entry is TtsSegment => Boolean(entry))
    .slice(0, MAX_SEGMENTS);
}

function validateSegment(segment: TtsSegment): string | null {
  if (!ALLOWED_VOICES.has(segment.voice)) {
    return `Giong doc khong ho tro: ${segment.voice}`;
  }
  if (!RATE_PATTERN.test(segment.rate)) {
    return `Toc do khong hop le: ${segment.rate}`;
  }
  if (!PITCH_PATTERN.test(segment.pitch)) {
    return `Pitch khong hop le: ${segment.pitch}`;
  }
  if (!VOLUME_PATTERN.test(segment.volume)) {
    return `Am luong khong hop le: ${segment.volume}`;
  }
  return null;
}

function sanitizeTtsText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTextForSegmentFallback(text: string): string[] {
  const cleaned = sanitizeTtsText(text).replace(/\n+/g, " ");
  if (!cleaned) {
    return [];
  }

  const sentenceParts = cleaned
    .split(/(?<=[\u3002\uFF01\uFF1F!?])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceParts.length <= 1) {
    return [cleaned];
  }

  const chunks: string[] = [];
  let current = "";
  for (const part of sentenceParts) {
    if ((current + part).length > CHUNK_SENTENCE_MAX_LENGTH && current) {
      chunks.push(current.trim());
      current = part;
      continue;
    }
    current += part;
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [cleaned];
}

function friendlyEdgeTtsError(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "";
  if (NO_AUDIO_PATTERN.test(lastLine)) {
    return "No audio was received. Please verify that your parameters are correct.";
  }
  if (lastLine) {
    return lastLine;
  }
  return raw.trim();
}

function isNoAudioError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return NO_AUDIO_PATTERN.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);

  return Buffer.concat([header, pcm]);
}

function normalizeProvider(value: unknown): "auto" | "edge" {
  return normalizeText(value).toLowerCase() === "edge" ? "edge" : "auto";
}

function geminiSpeakerForVoice(voice: string): "Speaker1" | "Speaker2" {
  return MALE_EDGE_VOICES.has(voice) ? "Speaker1" : "Speaker2";
}

function geminiStyleTag(segment: TtsSegment): string {
  const emotion = normalizeText(segment.emotion).toLowerCase();
  return GEMINI_EMOTION_TAGS[emotion] || "";
}

function buildGeminiRequest(segments: TtsSegment[], text: string, expressive: boolean, context: string) {
  const normalizedSegments =
    segments.length > 0
      ? segments
      : [
          {
            text,
            voice: "ja-JP-NanamiNeural",
            rate: "-5%",
            pitch: "+0Hz",
            volume: "+0%",
            emotion: "neutral",
          } satisfies TtsSegment,
        ];
  const speakers = new Set(normalizedSegments.map((segment) => geminiSpeakerForVoice(segment.voice)));
  const isMultiSpeaker = speakers.size > 1;
  const transcript = normalizedSegments
    .map((segment) => {
      const styleTag = expressive ? geminiStyleTag(segment) : "";
      const style = styleTag ? `[${styleTag}] ` : "";
      const line = `${style}${sanitizeTtsText(segment.text).replace(/\n+/g, " ")}`;
      return isMultiSpeaker ? `${geminiSpeakerForVoice(segment.voice)}: ${line}` : line;
    })
    .join("\n");
  const scene = sanitizeTtsText(context).slice(0, 800) || "An ordinary, realistic conversation in modern Japan.";
  const contents = expressive
    ? [
        "Synthesize the exact Japanese transcript below as natural spoken audio.",
        "",
        "# THE SCENE",
        scene,
        "",
        "# DIRECTOR'S NOTES",
        "- Perform this like a real everyday Japanese conversation, not an anime performance, commercial, or formal narration.",
        "- Keep emotions subtle and context-driven. Let each reply sound like a genuine reaction to the previous line.",
        "- Use natural Japanese timing: short response pauses, slight pace variation, and understated emphasis.",
        "- Keep short acknowledgements such as はい, ええ, そうですか, and わかりました brisk and connected to the phrase that follows; never draw them out.",
        "- Keep polite speech warm and conversational. Avoid exaggerated pitch jumps, forced cheerfulness, and dramatic shouting.",
        "- Preserve every Japanese word exactly. Never read headings, speaker labels, or audio tags aloud.",
        ...(isMultiSpeaker
          ? [
              "- Speaker1 sounds friendly, grounded, and natural.",
              "- Speaker2 sounds gentle, attentive, and natural.",
            ]
          : ["- The speaker sounds relaxed, present, and natural."]),
        "",
        "# TRANSCRIPT",
        transcript,
      ].join("\n")
    : [
        "Synthesize the exact Japanese transcript below clearly and naturally.",
        "Preserve every Japanese word exactly. Never read headings or speaker labels aloud.",
        "",
        "# TRANSCRIPT",
        transcript,
      ].join("\n");
  const maleVoice = normalizeText(process.env.GEMINI_TTS_MALE_VOICE) || "Achird";
  const femaleVoice = normalizeText(process.env.GEMINI_TTS_FEMALE_VOICE) || "Vindemiatrix";
  const speechConfig = isMultiSpeaker
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: "Speaker1",
              voiceConfig: { prebuiltVoiceConfig: { voiceName: maleVoice } },
            },
            {
              speaker: "Speaker2",
              voiceConfig: { prebuiltVoiceConfig: { voiceName: femaleVoice } },
            },
          ],
        },
      }
    : {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: geminiSpeakerForVoice(normalizedSegments[0]?.voice || "") === "Speaker1" ? maleVoice : femaleVoice,
          },
        },
      };

  return {
    contents: [{ parts: [{ text: contents }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig,
    },
  };
}

function geminiErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
  }
  return `Gemini TTS tra ve HTTP ${status}.`;
}

async function getOrCreateGeminiAudio(
  segments: TtsSegment[],
  text: string,
  expressive: boolean,
  context: string,
  apiKey: string
): Promise<Buffer> {
  const apiKeyHash = cacheKey(apiKey);
  if (Date.now() < (geminiCooldowns.get(apiKeyHash) ?? 0)) {
    throw new GeminiTtsError("Gemini TTS dang tam nghi sau khi cham gioi han.", 429);
  }

  const model = normalizeText(process.env.GEMINI_TTS_MODEL) || DEFAULT_GEMINI_MODEL;
  const requestBody = buildGeminiRequest(segments, text, expressive, context);
  const key = cacheKey({ provider: "gemini", model, requestBody });
  const outputPath = path.join(GEMINI_CACHE_DIR, `${key}.wav`);
  try {
    const cached = await readFile(outputPath);
    if (cached.byteLength > 44) {
      return cached;
    }
  } catch {
    // cache miss, continue to generate
  }

  const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }>;
      }
    | null;
  if (!response.ok) {
    if (response.status === 429) {
      geminiCooldowns.set(apiKeyHash, Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS);
    }
    throw new GeminiTtsError(geminiErrorMessage(response.status, payload), response.status);
  }

  const encoded = payload?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!encoded) {
    throw new Error("Gemini TTS khong tra ve audio.");
  }
  const wav = pcmToWav(Buffer.from(encoded, "base64"));
  await mkdir(GEMINI_CACHE_DIR, { recursive: true });
  await writeFile(outputPath, wav);
  return wav;
}

function geminiKeyStatusForError(error: unknown): GeminiKeyStatus {
  if (!(error instanceof GeminiTtsError)) {
    return "error";
  }
  if (error.status === 429) {
    return "rate-limited";
  }
  if ([400, 401, 403].includes(error.status)) {
    return "invalid";
  }
  return "error";
}

function buildVoicePresets(segment: TtsSegment): VoicePreset[] {
  return uniqueBy(
    [
      { voice: segment.voice, rate: segment.rate, pitch: segment.pitch, volume: segment.volume },
      { voice: segment.voice, rate: "-5%", pitch: "+0Hz", volume: "+0%" },
      { voice: "ja-JP-NanamiNeural", rate: "-5%", pitch: "+0Hz", volume: "+0%" },
      { voice: "ja-JP-KeitaNeural", rate: "-5%", pitch: "+0Hz", volume: "+0%" },
      { voice: "ja-JP-AoiNeural", rate: "-5%", pitch: "+0Hz", volume: "+0%" },
    ],
    (preset) => `${preset.voice}|${preset.rate}|${preset.pitch}|${preset.volume}`
  );
}

function runEdgeTts({
  text,
  voice,
  rate,
  pitch,
  volume,
  outputPath,
}: {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
  outputPath: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python",
      [
        "-m",
        "edge_tts",
        "--voice",
        voice,
        `--rate=${rate}`,
        `--pitch=${pitch}`,
        `--volume=${volume}`,
        "--text",
        text,
        "--write-media",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(friendlyEdgeTtsError(stderr.trim() || `edge-tts exited with code ${code}`)));
    });
  });
}

async function getOrCreateSegmentAudio(segment: TtsSegment): Promise<Buffer> {
  const key = cacheKey(segment);
  const outputPath = path.join(CACHE_DIR, `${key}.mp3`);
  try {
    const cached = await readFile(outputPath);
    if (cached.byteLength > 0) {
      return cached;
    }
  } catch {
    // cache miss, continue to generate
  }

  const textAttempts = uniqueBy(
    [
      sanitizeTtsText(segment.text),
      sanitizeTtsText(segment.text.replace(/\n+/g, " ")),
      sanitizeTtsText(
        segment.text
          .replace(/[\u300C\u300D\u300E\u300F]/g, "")
          .replace(/[\uFF1A]/g, ":")
          .replace(/\n+/g, " ")
      ),
    ].filter(Boolean),
    (entry) => entry
  );
  if (textAttempts.length === 0) {
    throw new Error("No audio was received. Please verify that your parameters are correct.");
  }

  const presets = buildVoicePresets(segment);
  let lastError: unknown = null;
  for (const attemptText of textAttempts) {
    for (const preset of presets) {
      try {
        await runEdgeTts({
          text: attemptText,
          voice: preset.voice,
          rate: preset.rate,
          pitch: preset.pitch,
          volume: preset.volume,
          outputPath,
        });
        const created = await readFile(outputPath);
        if (created.byteLength > 0) {
          return created;
        }
        lastError = new Error("No audio was received. Please verify that your parameters are correct.");
      } catch (error) {
        lastError = error;
        if (!isNoAudioError(error)) {
          throw error;
        }
      }
      await delay(180);
    }
  }

  const chunks = splitTextForSegmentFallback(segment.text);
  if (chunks.length > 1) {
    const chunkBuffers: Buffer[] = [];
    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunk = chunks[idx];
      let chunkBuffer: Buffer | null = null;
      let chunkError: unknown = null;
      for (const preset of presets) {
        const chunkOutputPath = path.join(CACHE_DIR, `${key}.chunk-${idx + 1}.mp3`);
        try {
          await runEdgeTts({
            text: chunk,
            voice: preset.voice,
            rate: preset.rate,
            pitch: preset.pitch,
            volume: preset.volume,
            outputPath: chunkOutputPath,
          });
          const created = await readFile(chunkOutputPath);
          if (created.byteLength > 0) {
            chunkBuffer = created;
            break;
          }
          chunkError = new Error("No audio was received. Please verify that your parameters are correct.");
        } catch (error) {
          chunkError = error;
          if (!isNoAudioError(error)) {
            throw error;
          }
        }
        await delay(160);
      }

      if (!chunkBuffer) {
        throw chunkError ?? lastError ?? new Error("No audio was received. Please verify that your parameters are correct.");
      }
      chunkBuffers.push(chunkBuffer);
    }

    const merged = Buffer.concat(chunkBuffers);
    if (merged.byteLength > 0) {
      await writeFile(outputPath, merged);
      return merged;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("edge-tts khong tra ve audio.");
}

export async function POST(request: Request) {
  let payload: TtsPayload;
  try {
    payload = (await request.json()) as TtsPayload;
  } catch {
    return responseJson({ error: "Payload JSON khong hop le." }, 400);
  }

  const text = normalizeText(payload.text);
  const voice = normalizeText(payload.voice) || "ja-JP-NanamiNeural";
  const rate = normalizeText(payload.rate) || "-5%";
  const pitch = normalizeText(payload.pitch) || "+0Hz";
  const volume = normalizeText(payload.volume) || "+0%";
  const provider = normalizeProvider(payload.provider);
  const expressive = normalizeBoolean(payload.expressive, true);
  const context = normalizeText(payload.context);
  const allowFallbackDemo = normalizeBoolean(payload.allowFallbackDemo, false);
  const segments = normalizeSegments(payload.segments);

  if (!ALLOWED_VOICES.has(voice)) {
    return responseJson({ error: "Giong doc khong nam trong danh sach ho tro." }, 400);
  }
  if (!RATE_PATTERN.test(rate) || !PITCH_PATTERN.test(pitch) || !VOLUME_PATTERN.test(volume)) {
    return responseJson({ error: "Toc do, pitch hoac am luong khong hop le." }, 400);
  }

  if (segments.length === 0 && !text) {
    return responseJson({ error: "Thieu van ban tieng Nhat de tao audio." }, 400);
  }

  const totalTextLength =
    segments.length > 0
      ? segments.reduce((sum, segment) => sum + segment.text.length, 0)
      : text.length;
  if (totalTextLength > MAX_TEXT_LENGTH) {
    return responseJson({ error: `Van ban toi da ${MAX_TEXT_LENGTH} ky tu.` }, 400);
  }

  for (const segment of segments) {
    const error = validateSegment(segment);
    if (error) {
      return responseJson({ error }, 400);
    }
  }

  let geminiError = "";
  try {
    await mkdir(CACHE_DIR, { recursive: true });

    const user = provider === "auto" ? await getCurrentUser() : null;
    const activeGeminiKey = user ? await getActiveGeminiApiKey() : null;
    if (activeGeminiKey) {
      try {
        const audio = await getOrCreateGeminiAudio(segments, text, expressive, context, activeGeminiKey.apiKey);
        try {
          await markGeminiApiKeySuccess(activeGeminiKey.managedKeyId);
        } catch (statusError) {
          console.error("[listening-tts/mark-gemini-success]", statusError);
        }
        return audioResponse(audio, "audio/wav", {
          "X-TTS-Provider": "gemini",
          "X-TTS-Key-Source": activeGeminiKey.source,
        });
      } catch (error) {
        geminiError = error instanceof Error ? error.message : "Gemini TTS khong tao duoc audio.";
        try {
          await markGeminiApiKeyFailure(
            activeGeminiKey.managedKeyId,
            geminiKeyStatusForError(error),
            geminiError
          );
        } catch (statusError) {
          console.error("[listening-tts/mark-gemini-failure]", statusError);
        }
      }
    }

    if (segments.length > 0) {
      const chunkBuffers: Buffer[] = [];
      for (let idx = 0; idx < segments.length; idx += 1) {
        const segment = segments[idx];
        let chunk: Buffer;
        try {
          chunk = await getOrCreateSegmentAudio(segment);
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Khong tao duoc audio cho mot doan hoi thoai.";
          throw new Error(`Loi o dong ${idx + 1}: ${message}`);
        }
        chunkBuffers.push(chunk);
      }
      const combined = Buffer.concat(chunkBuffers);
      if (combined.byteLength === 0) {
        throw new Error("Khong ghep duoc audio hoi thoai.");
      }
      return audioResponse(combined, "audio/mpeg", {
        "X-TTS-Provider": geminiError ? "edge-fallback" : "edge",
        ...(geminiError ? { "X-TTS-Fallback": "gemini-error" } : {}),
      });
    }

    const singleSegment: TtsSegment = {
      text,
      voice,
      rate,
      pitch,
      volume,
    };
    const audio = await getOrCreateSegmentAudio(singleSegment);
    return audioResponse(audio, "audio/mpeg", {
      "X-TTS-Provider": geminiError ? "edge-fallback" : "edge",
      ...(geminiError ? { "X-TTS-Fallback": "gemini-error" } : {}),
    });
  } catch (error) {
    const edgeMessage =
      error instanceof Error
        ? error.message
        : "Khong tao duoc audio. Hay kiem tra edge-tts hoac ket noi mang.";
    const message = geminiError ? `Gemini: ${geminiError} Edge TTS: ${edgeMessage}` : edgeMessage;
    const noAudio = NO_AUDIO_PATTERN.test(edgeMessage);
    if (allowFallbackDemo && voice === "ja-JP-NanamiNeural" && rate === "-5%") {
      try {
        const fallbackAudio = await readFile(DEMO_FALLBACK_AUDIO);
        if (fallbackAudio.byteLength > 0) {
          return audioResponse(fallbackAudio, "audio/mpeg", {
            "X-TTS-Provider": "static-demo",
            "X-TTS-Fallback": "static-demo",
          });
        }
      } catch {
        // Keep the real error below.
      }
    }

    return responseJson(
      {
        error: message,
        hint: noAudio
          ? "Thu bam tao audio lai sau 3-5 giay, doi voice hoac toc do, va uu tien scriptRaw khong furigana."
          : "Kiem tra edge-tts va internet. Neu chua cai: python -m pip install edge-tts",
      },
      500
    );
  }
}
