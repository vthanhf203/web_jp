import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 2500;
const MAX_SEGMENTS = 120;
const CACHE_DIR = path.join(process.cwd(), ".cache", "listening-tts");
const DEMO_FALLBACK_AUDIO = path.join(process.cwd(), "public", "listening-demo", "jlpt-demo-nanami.mp3");
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
const PITCH_PATTERN = /^[+-]?\d{1,3}Hz$/;
const NO_AUDIO_PATTERN = /NoAudioReceived|No audio was received/i;
const CHUNK_SENTENCE_MAX_LENGTH = 90;

type TtsSegment = {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
};

type TtsPayload = {
  text?: unknown;
  voice?: unknown;
  rate?: unknown;
  pitch?: unknown;
  segments?: unknown;
  allowFallbackDemo?: unknown;
};

type VoicePreset = {
  voice: string;
  rate: string;
  pitch: string;
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

function audioResponse(audio: Buffer, extraHeaders?: HeadersInit) {
  const body = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
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
      if (!text) {
        return null;
      }
      return { text, voice, rate, pitch } satisfies TtsSegment;
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

function buildVoicePresets(segment: TtsSegment): VoicePreset[] {
  return uniqueBy(
    [
      { voice: segment.voice, rate: segment.rate, pitch: segment.pitch },
      { voice: segment.voice, rate: "-5%", pitch: "+0Hz" },
      { voice: "ja-JP-NanamiNeural", rate: "-5%", pitch: "+0Hz" },
      { voice: "ja-JP-KeitaNeural", rate: "-5%", pitch: "+0Hz" },
      { voice: "ja-JP-AoiNeural", rate: "-5%", pitch: "+0Hz" },
    ],
    (preset) => `${preset.voice}|${preset.rate}|${preset.pitch}`
  );
}

function runEdgeTts({
  text,
  voice,
  rate,
  pitch,
  outputPath,
}: {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
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
  const allowFallbackDemo = normalizeBoolean(payload.allowFallbackDemo, false);
  const segments = normalizeSegments(payload.segments);

  if (!ALLOWED_VOICES.has(voice)) {
    return responseJson({ error: "Giong doc khong nam trong danh sach ho tro." }, 400);
  }
  if (!RATE_PATTERN.test(rate) || !PITCH_PATTERN.test(pitch)) {
    return responseJson({ error: "Toc do hoac pitch khong hop le." }, 400);
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

  try {
    await mkdir(CACHE_DIR, { recursive: true });

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
      return audioResponse(combined);
    }

    const singleSegment: TtsSegment = {
      text,
      voice,
      rate,
      pitch,
    };
    const audio = await getOrCreateSegmentAudio(singleSegment);
    return audioResponse(audio);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Khong tao duoc audio. Hay kiem tra edge-tts hoac ket noi mang.";
    const noAudio = NO_AUDIO_PATTERN.test(message);
    if (allowFallbackDemo && voice === "ja-JP-NanamiNeural" && rate === "-5%") {
      try {
        const fallbackAudio = await readFile(DEMO_FALLBACK_AUDIO);
        if (fallbackAudio.byteLength > 0) {
          return audioResponse(fallbackAudio, { "X-TTS-Fallback": "static-demo" });
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
