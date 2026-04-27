"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import YouTube, { type YouTubeProps } from "react-youtube";

import { useShadowingStore } from "@/store/shadowingStore";

type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
};

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
};

type VideoPlayerProps = {
  onTimeUpdate: (t: number) => void;
};

function extractYoutubeId(url: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const shortId = parsed.hostname.includes("youtu.be") ? parsed.pathname.replace("/", "") : null;
    if (shortId) {
      return shortId;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function withSafePlayer<T>(ref: MutableRefObject<T | null>, run: (player: T) => void) {
  if (!ref.current) {
    return;
  }
  run(ref.current);
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { onTimeUpdate },
  ref
) {
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [youtubeReadyTick, setYoutubeReadyTick] = useState(0);

  const videoSrc = useShadowingStore((state) => state.videoSrc);
  const videoType = useShadowingStore((state) => state.videoType);
  const playbackRate = useShadowingStore((state) => state.playbackRate);

  const youtubeId = useMemo(() => extractYoutubeId(videoSrc), [videoSrc]);

  useEffect(() => {
    if (videoType !== "youtube") {
      youtubePlayerRef.current = null;
      setYoutubeReadyTick((prev) => prev + 1);
      return;
    }
    if (!youtubeId) {
      youtubePlayerRef.current = null;
      setYoutubeReadyTick((prev) => prev + 1);
    }
  }, [videoType, youtubeId]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (seconds: number) => {
        if (videoType === "youtube") {
          withSafePlayer(youtubePlayerRef, (player) => player.seekTo(seconds, true));
          return;
        }
        if (htmlVideoRef.current) {
          htmlVideoRef.current.currentTime = seconds;
        }
      },
      setPlaybackRate: (rate: number) => {
        if (videoType === "youtube") {
          withSafePlayer(youtubePlayerRef, (player) => player.setPlaybackRate(rate));
          return;
        }
        if (htmlVideoRef.current) {
          htmlVideoRef.current.playbackRate = rate;
        }
      },
      play: () => {
        if (videoType === "youtube") {
          withSafePlayer(youtubePlayerRef, (player) => player.playVideo());
          return;
        }
        void htmlVideoRef.current?.play();
      },
      pause: () => {
        if (videoType === "youtube") {
          withSafePlayer(youtubePlayerRef, (player) => player.pauseVideo());
          return;
        }
        htmlVideoRef.current?.pause();
      },
    }),
    [videoType]
  );

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (videoType !== "youtube" || !youtubePlayerRef.current) {
      return;
    }

    intervalRef.current = setInterval(() => {
      const current = Number(youtubePlayerRef.current?.getCurrentTime?.() ?? 0);
      onTimeUpdate(Number.isFinite(current) ? current : 0);
    }, 200);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [onTimeUpdate, videoType, youtubeId, youtubeReadyTick]);

  useEffect(() => {
    if (videoType === "youtube") {
      withSafePlayer(youtubePlayerRef, (player) => player.setPlaybackRate(playbackRate));
      return;
    }
    if (htmlVideoRef.current) {
      htmlVideoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, videoType]);

  const youtubeOpts: YouTubeProps["opts"] = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
    }),
    []
  );

  if (!videoSrc) {
    return <div className="grid min-h-[320px] place-items-center rounded-xl bg-slate-100 text-slate-500">No video</div>;
  }

  if (videoType === "youtube") {
    if (!youtubeId) {
      return (
        <div className="grid min-h-[320px] place-items-center rounded-xl bg-slate-100 p-4 text-center text-sm font-medium text-rose-600">
          Link YouTube không hợp lệ.
        </div>
      );
    }

    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-slate-950">
        <YouTube
          videoId={youtubeId}
          opts={youtubeOpts}
          className="h-full w-full"
          iframeClassName="h-full w-full"
          onReady={(event) => {
            youtubePlayerRef.current = event.target as unknown as YouTubePlayer;
            youtubePlayerRef.current.setPlaybackRate(playbackRate);
            const now = Number(youtubePlayerRef.current.getCurrentTime?.() ?? 0);
            onTimeUpdate(Number.isFinite(now) ? now : 0);
            setYoutubeReadyTick((prev) => prev + 1);
          }}
          onStateChange={(event) => {
            const player = event.target as unknown as YouTubePlayer;
            const now = Number(player?.getCurrentTime?.() ?? 0);
            if (Number.isFinite(now)) {
              onTimeUpdate(now);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-slate-950">
      <video
        ref={htmlVideoRef}
        className="h-full w-full"
        src={videoSrc}
        controls
        playsInline
        onLoadedMetadata={() => {
          if (htmlVideoRef.current) {
            htmlVideoRef.current.playbackRate = playbackRate;
          }
        }}
        onTimeUpdate={() => {
          if (htmlVideoRef.current) {
            onTimeUpdate(htmlVideoRef.current.currentTime);
          }
        }}
      />
    </div>
  );
});

export default VideoPlayer;
