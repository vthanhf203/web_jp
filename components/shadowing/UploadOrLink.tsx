"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";

import type { Segment, TranscribeResponse } from "@/types/shadowing";
import { useShadowingStore } from "@/store/shadowingStore";

import styles from "./UploadOrLink.module.css";

type UploadTab = "youtube" | "upload";

const ALLOWED_ACCEPT = ".mp4,.mov,.m4a,.mp3";

function isYoutubeLink(value: string): boolean {
  return /youtube\.com|youtu\.be/i.test(value);
}

function normalizeSegments(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index) => {
      const seg = item as Partial<Segment>;
      if (typeof seg.start !== "number" || typeof seg.end !== "number" || typeof seg.text !== "string") {
        return null;
      }
      return {
        id: typeof seg.id === "number" ? seg.id : index,
        start: seg.start,
        end: seg.end,
        text: seg.text,
      } satisfies Segment;
    })
    .filter((value): value is Segment => value !== null);
}

export default function UploadOrLink() {
  const [tab, setTab] = useState<UploadTab>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isLoading = useShadowingStore((state) => state.isLoading);
  const setLoading = useShadowingStore((state) => state.setLoading);
  const setSegments = useShadowingStore((state) => state.setSegments);
  const setVideo = useShadowingStore((state) => state.setVideo);
  const setVideoTitle = useShadowingStore((state) => state.setVideoTitle);

  const canSubmit = useMemo(() => {
    if (isLoading) {
      return false;
    }
    if (tab === "youtube") {
      return youtubeUrl.trim().length > 0;
    }
    return Boolean(selectedFile);
  }, [isLoading, selectedFile, tab, youtubeUrl]);

  const runTranscribe = async () => {
    setErrorMessage("");
    setLoading(true);

    try {
      const body = new FormData();

      if (tab === "youtube") {
        const url = youtubeUrl.trim();
        if (!isYoutubeLink(url)) {
          throw new Error("Link YouTube khong hop le.");
        }
        body.set("type", "youtube");
        body.set("url", url);
      } else {
        if (!selectedFile) {
          throw new Error("Ban chua chon file.");
        }
        body.set("type", "mp4");
        body.set("file", selectedFile);
      }

      const response = await fetch("/api/transcribe", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as TranscribeResponse & {
        message?: string;
        detail?: string;
      };

      if (!response.ok) {
        const serverMessage = payload?.message ?? "Khong the transcribe.";
        const serverDetail = typeof payload?.detail === "string" ? payload.detail.trim() : "";
        throw new Error(serverDetail ? `${serverMessage} (${serverDetail})` : serverMessage);
      }

      const parsedSegments = normalizeSegments(payload?.segments);
      if (parsedSegments.length === 0) {
        throw new Error("Khong nhan duoc subtitle nao.");
      }

      setSegments(parsedSegments);

      if (tab === "youtube") {
        setVideo(youtubeUrl.trim(), "youtube");
      } else if (selectedFile) {
        const blobUrl = URL.createObjectURL(selectedFile);
        setVideo(blobUrl, "mp4");
      }

      const fallbackTitle = tab === "youtube" ? "YouTube Shadowing" : selectedFile?.name ?? "Uploaded Clip";
      setVideoTitle(typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : fallbackTitle);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Da co loi xay ra.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const onFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(nextFile);
    setErrorMessage("");
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (nextFile) {
      setSelectedFile(nextFile);
      setErrorMessage("");
    }
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>Shadowing Lab</h1>
        <p className={styles.subtitle}>Dan YouTube hoac tai video len de tao subtitle tieng Nhat dong bo.</p>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          onClick={() => setTab("youtube")}
          className={`${styles.tabButton} ${tab === "youtube" ? styles.tabButtonActive : ""}`}
        >
          YouTube Link
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={`${styles.tabButton} ${tab === "upload" ? styles.tabButtonActive : ""}`}
        >
          Tai video len
        </button>
      </div>

      {tab === "youtube" ? (
        <div className={styles.panel}>
          <label className={styles.label} htmlFor="youtube-url">
            Dan link YouTube vao day...
          </label>
          <input
            id="youtube-url"
            className={styles.input}
            type="url"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.currentTarget.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <button type="button" className={styles.submitButton} onClick={runTranscribe} disabled={!canSubmit}>
            Bat dau hoc
          </button>
        </div>
      ) : (
        <div className={styles.panel}>
          <label
            className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input className={styles.hiddenInput} type="file" accept={ALLOWED_ACCEPT} onChange={onFileSelect} />
            <span className={styles.dropTitle}>Keo tha file vao day</span>
            <span className={styles.dropHint}>Hoac bam de chon file .mp4 / .mov / .m4a / .mp3</span>
            {selectedFile ? <span className={styles.fileName}>{selectedFile.name}</span> : null}
          </label>

          <button type="button" className={styles.submitButton} onClick={runTranscribe} disabled={!canSubmit}>
            Tai len va hoc
          </button>
        </div>
      )}

      {isLoading ? <p className={styles.loading}>Dang xu ly audio...</p> : null}
      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
    </section>
  );
}
