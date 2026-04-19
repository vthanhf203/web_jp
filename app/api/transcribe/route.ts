import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import ffmpeg from "fluent-ffmpeg";
import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import { fetchTranscript, type TranscriptResponse } from "youtube-transcript";

import type { Segment } from "@/types/shadowing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SHADOWING_TMP_DIR =
  process.platform === "win32" ? path.resolve(".shadowing-tmp") : os.tmpdir();
const GROQ_DIRECT_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "oga",
  "opus",
  "aac",
  "mov",
  "flac",
]);

try {
  fs.mkdirSync(SHADOWING_TMP_DIR, { recursive: true });
} catch {
  // ignore mkdir errors; later IO will report
}

type GroqSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type YtdlInfo = {
  videoDetails?: {
    title?: string;
  };
  formats: unknown[];
};

function buildTempPath(prefix: string, ext: string): string {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return path.join(SHADOWING_TMP_DIR, `${prefix}-${stamp}.${ext}`);
}

function canSendDirectlyToGroq(ext: string): boolean {
  return GROQ_DIRECT_EXTENSIONS.has(ext.toLowerCase());
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function normalizeYoutubeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        const videoId = url.searchParams.get("v");
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }
      return rawUrl;
    }

    if (hostname.includes("youtu.be")) {
      const videoId = url.pathname.replace(/\//g, "").trim();
      if (videoId) {
        return `https://youtu.be/${videoId}`;
      }
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function extractYoutubeVideoId(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("youtu.be")) {
      return url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    }

    if (hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") ?? "";
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const shortsIndex = parts.indexOf("shorts");
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
        return parts[shortsIndex + 1];
      }

      const liveIndex = parts.indexOf("live");
      if (liveIndex >= 0 && parts[liveIndex + 1]) {
        return parts[liveIndex + 1];
      }
    }

    return "";
  } catch {
    return "";
  }
}

function getYoutubeHeaders(): Record<string, string> {
  const cookie = (process.env.YOUTUBE_COOKIE ?? "").trim();
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
    Referer: "https://www.youtube.com/",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function isStatusCodeError(error: unknown, code: number): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
  return status === code || message.includes(`Status code: ${code}`);
}

async function removeTempFile(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore cleanup issue
  }
}

async function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  if (path.extname(inputPath).toLowerCase() === ".mp3") {
    await fsp.copyFile(inputPath, outputPath);
    return;
  }

  const runFluent = () =>
    new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .save(outputPath);
    });

  const runCli = () =>
    new Promise<void>((resolve, reject) => {
      const ffmpegPath = (process.env.FFMPEG_PATH ?? "").trim() || "ffmpeg";
      const args = ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-b:a", "128k", outputPath];
      const child = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = "";

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
      });
    });

  try {
    await runFluent();
  } catch (fluentError) {
    try {
      await runCli();
    } catch (cliError) {
      const fluentMessage = fluentError instanceof Error ? fluentError.message : String(fluentError);
      const cliMessage = cliError instanceof Error ? cliError.message : String(cliError);
      throw new Error(`Khong convert duoc audio. Fluent: ${fluentMessage}. CLI: ${cliMessage}`);
    }
  }
}

function pickDownloadFormat(info: YtdlInfo): unknown {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  if (formats.length === 0) {
    return null;
  }

  try {
    return ytdl.chooseFormat(formats as never[], {
      quality: "highestaudio",
      filter: "audioonly",
    } as never);
  } catch {
    // fallback below
  }

  try {
    return ytdl.chooseFormat(formats as never[], {
      quality: "highest",
    } as never);
  } catch {
    // fallback below
  }

  return formats[0] ?? null;
}

function decodeXmlText(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

type TimedTextTrack = {
  langCode: string;
  kind: string;
  name: string;
};

function parseTimedTextTracks(xml: string): TimedTextTrack[] {
  const tracks: TimedTextTrack[] = [];
  const regex = /<track\s+([^>]+?)\/>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const langMatch = /lang_code="([^"]+)"/.exec(attrs);
    if (!langMatch?.[1]) {
      continue;
    }
    const kindMatch = /kind="([^"]+)"/.exec(attrs);
    const nameMatch = /name="([^"]*)"/.exec(attrs);
    tracks.push({
      langCode: decodeXmlText(langMatch[1]),
      kind: decodeXmlText(kindMatch?.[1] ?? ""),
      name: decodeXmlText(nameMatch?.[1] ?? ""),
    });
  }

  return tracks;
}

function parseTimedTextSegments(xml: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const startMatch = /start="([^"]+)"/.exec(attrs);
    const durMatch = /dur="([^"]+)"/.exec(attrs);
    const rawText = match[2] ?? "";
    const text = decodeXmlText(rawText.replace(/<[^>]*>/g, "")).trim().replace(/\s+/g, " ");

    const start = startMatch ? Number(startMatch[1]) : Number.NaN;
    const dur = durMatch ? Number(durMatch[1]) : Number.NaN;

    if (!Number.isFinite(start) || !text) {
      continue;
    }

    const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 2;
    segments.push({
      id: index,
      start: Math.max(0, start),
      end: Math.max(start + 0.2, start + safeDur),
      text,
    });
    index += 1;
  }

  return segments;
}

function mapYoutubeTranscriptSegments(items: TranscriptResponse[]): Segment[] {
  return items
    .map((item, index) => {
      const start = Number(item.offset) / 1000;
      const duration = Number(item.duration) / 1000;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!Number.isFinite(start) || !text) {
        return null;
      }
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 2);
      return {
        id: index,
        start: Math.max(0, start),
        end: Math.max(start + 0.2, end),
        text: text.replace(/\s+/g, " "),
      } satisfies Segment;
    })
    .filter((value): value is Segment => value !== null);
}

async function fetchYoutubeTranscriptFallback(url: string): Promise<Segment[]> {
  const tries: Array<{ lang?: string }> = [{ lang: "ja" }, {}];

  for (const config of tries) {
    try {
      const rows = await fetchTranscript(url, config);
      const segments = mapYoutubeTranscriptSegments(rows);
      if (segments.length > 0) {
        return segments;
      }
    } catch {
      // try next config
    }
  }

  return [];
}

function scoreTrack(track: TimedTextTrack): number {
  const lang = track.langCode.toLowerCase();
  const isAsr = track.kind.toLowerCase() === "asr";
  if (lang.startsWith("ja") && !isAsr) return 0;
  if (lang.startsWith("ja") && isAsr) return 1;
  if (lang.startsWith("vi") && !isAsr) return 2;
  if (lang.startsWith("vi") && isAsr) return 3;
  if (lang.startsWith("en") && !isAsr) return 4;
  if (lang.startsWith("en") && isAsr) return 5;
  return 9;
}

async function fetchYoutubeTimedTextFallback(url: string): Promise<Segment[]> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return [];
  }

  try {
    const listRes = await fetch(`https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`, {
      headers: getYoutubeHeaders(),
      cache: "no-store",
    });

    if (!listRes.ok) {
      return [];
    }

    const listXml = await listRes.text();
    const tracks = parseTimedTextTracks(listXml).sort((a, b) => scoreTrack(a) - scoreTrack(b));
    if (tracks.length === 0) {
      return [];
    }

    for (const track of tracks) {
      const query = new URLSearchParams({
        v: videoId,
        lang: track.langCode,
        fmt: "srv3",
      });
      if (track.kind) {
        query.set("kind", track.kind);
      }
      if (track.name) {
        query.set("name", track.name);
      }

      const textRes = await fetch(`https://video.google.com/timedtext?${query.toString()}`, {
        headers: getYoutubeHeaders(),
        cache: "no-store",
      });
      if (!textRes.ok) {
        continue;
      }

      const textXml = await textRes.text();
      const segments = parseTimedTextSegments(textXml);
      if (segments.length > 0) {
        return segments;
      }
    }

    return [];
  } catch {
    return [];
  }
}

async function downloadYoutubeAudio(url: string, sourcePath: string): Promise<{ title: string }> {
  const info = (await ytdl.getInfo(url, {
    playerClients: ["WEB", "ANDROID", "IOS"],
    requestOptions: {
      headers: getYoutubeHeaders(),
    },
  })) as YtdlInfo;

  const title = info.videoDetails?.title?.trim() ?? "YouTube Video";
  const selectedFormat = pickDownloadFormat(info);

  const attempts: Array<() => NodeJS.ReadableStream> = [];

  if (selectedFormat) {
    attempts.push(() =>
      ytdl.downloadFromInfo(info as never, {
        format: selectedFormat as never,
        requestOptions: {
          headers: getYoutubeHeaders(),
        },
      } as never)
    );
  }

  attempts.push(() =>
    ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
      playerClients: ["ANDROID", "IOS", "WEB"],
      requestOptions: {
        headers: getYoutubeHeaders(),
      },
    } as never)
  );

  attempts.push(() =>
    ytdl(url, {
      quality: "lowest",
      playerClients: ["ANDROID", "WEB"],
      requestOptions: {
        headers: getYoutubeHeaders(),
      },
    } as never)
  );

  let lastError: unknown = null;
  for (const run of attempts) {
    try {
      await removeTempFile(sourcePath);
      await pipeline(run(), fs.createWriteStream(sourcePath));
      return { title };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Khong tai duoc audio tu YouTube");
}

function mapSegments(raw: unknown, fallbackText: string): Segment[] {
  const list = Array.isArray(raw) ? raw : [];
  const mapped = list
    .map((item, index) => {
      const seg = item as GroqSegment;
      const start = typeof seg.start === "number" ? seg.start : null;
      const end = typeof seg.end === "number" ? seg.end : null;
      const text = typeof seg.text === "string" ? seg.text.trim() : "";
      if (start === null || end === null || !text) {
        return null;
      }
      return { id: index, start, end, text };
    })
    .filter((value): value is Segment => value !== null);

  if (mapped.length > 0) {
    return mapped;
  }

  const safeText = fallbackText.trim();
  if (!safeText) {
    return [];
  }

  return [{ id: 0, start: 0, end: 5, text: safeText }];
}

export async function POST(request: Request) {
  const tempPaths: string[] = [];
  let title = "";
  let phase: "parse" | "youtube-download" | "media-convert" | "groq-transcribe" = "parse";
  let sourceType: "youtube" | "mp4" | null = null;
  const groqApiKey = (process.env.GROQ_API_KEY ?? process.env.GROQ_API_Key ?? "").trim();

  try {
    if (!groqApiKey) {
      return NextResponse.json(
        {
          message: "Chua cai dat GROQ_API_KEY (hay GROQ_API_Key) trong .env.local",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const rawType = formData.get("type");
    const type = rawType === "youtube" || rawType === "mp4" ? rawType : null;

    if (!type) {
      return NextResponse.json({ message: "Type khong hop le" }, { status: 400 });
    }
    sourceType = type;

    let audioPath = "";

    if (type === "youtube") {
      phase = "youtube-download";
      const rawUrl = formData.get("url");
      const url = normalizeYoutubeUrl(typeof rawUrl === "string" ? rawUrl.trim() : "");

      if (!url || !isYoutubeUrl(url) || !ytdl.validateURL(url)) {
        return NextResponse.json({ message: "Link YouTube khong hop le" }, { status: 400 });
      }

      try {
        const sourcePath = buildTempPath("youtube-audio", "webm");
        tempPaths.push(sourcePath);
        const downloaded = await downloadYoutubeAudio(url, sourcePath);
        title = downloaded.title;
        if (canSendDirectlyToGroq("webm")) {
          audioPath = sourcePath;
        } else {
          const targetPath = buildTempPath("transcribe-audio", "mp3");
          tempPaths.push(targetPath);
          phase = "media-convert";
          await convertToMp3(sourcePath, targetPath);
          audioPath = targetPath;
        }
      } catch (youtubeDownloadError) {
        const transcriptSegments = await fetchYoutubeTranscriptFallback(url);
        if (transcriptSegments.length > 0) {
          return NextResponse.json({
            segments: transcriptSegments,
            title: title || "YouTube Transcript",
          });
        }
        const timedTextSegments = await fetchYoutubeTimedTextFallback(url);
        if (timedTextSegments.length > 0) {
          return NextResponse.json({
            segments: timedTextSegments,
            title: title || "YouTube Transcript",
          });
        }
        throw youtubeDownloadError;
      }
    } else {
      const rawFile = formData.get("file");
      if (!(rawFile instanceof File)) {
        return NextResponse.json({ message: "Ban chua tai file" }, { status: 400 });
      }

      if (rawFile.size > MAX_FILE_BYTES) {
        return NextResponse.json({ message: "File qua lon, toi da 25MB" }, { status: 400 });
      }

      const ext = (rawFile.name.split(".").pop() ?? "mp4").toLowerCase();
      const sourcePath = buildTempPath("upload", ext);
      tempPaths.push(sourcePath);
      title = rawFile.name.trim() || "Uploaded video";

      await fsp.writeFile(sourcePath, Buffer.from(await rawFile.arrayBuffer()));
      if (canSendDirectlyToGroq(ext)) {
        audioPath = sourcePath;
      } else {
        const targetPath = buildTempPath("transcribe-audio", "mp3");
        tempPaths.push(targetPath);
        phase = "media-convert";
        await convertToMp3(sourcePath, targetPath);
        audioPath = targetPath;
      }
    }

    const audioStat = await fsp.stat(audioPath);
    if (audioStat.size > MAX_FILE_BYTES) {
      return NextResponse.json({ message: "File qua lon, toi da 25MB" }, { status: 400 });
    }

    phase = "groq-transcribe";
    const groq = new Groq({ apiKey: groqApiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-large-v3",
      response_format: "verbose_json",
      language: "ja",
      timestamp_granularities: ["segment"],
    });

    const parsed = transcription as { segments?: unknown; text?: string };
    const segments = mapSegments(parsed.segments, parsed.text ?? "");

    return NextResponse.json({
      segments,
      title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("25mb") || message.toLowerCase().includes("file qua lon")) {
      return NextResponse.json({ message: "File qua lon, toi da 25MB" }, { status: 400 });
    }

    if (sourceType === "youtube" && phase === "youtube-download" && isStatusCodeError(error, 403)) {
      return NextResponse.json(
        {
          message:
            "YouTube dang chan tai audio video nay (403), va video nay cung khong co transcript public de fallback. Thu video public khac hoac dung tab 'Tai video len'.",
          detail: message,
        },
        { status: 400 }
      );
    }

    if (phase === "groq-transcribe" && isStatusCodeError(error, 403)) {
      return NextResponse.json(
        {
          message: "Groq tu choi yeu cau (403). Kiem tra lai key/quyen model Whisper trong console Groq.",
          detail: message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Transcribe that bai, thu lai", detail: message }, { status: 500 });
  } finally {
    await Promise.all(tempPaths.map((item) => removeTempFile(item)));
  }
}



