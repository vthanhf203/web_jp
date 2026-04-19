export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface FuriganaWord {
  text: string;
  furigana: string;
  romaji: string;
}

export interface ShadowingState {
  segments: Segment[];
  currentIndex: number;
  currentTime: number;
  isShadowingMode: boolean;
  isLoading: boolean;
  playbackRate: number;
  videoSrc: string;
  videoType: "youtube" | "mp4" | null;
  setSegments: (segments: Segment[]) => void;
  setCurrentTime: (t: number) => void;
  setCurrentIndex: (i: number) => void;
  toggleShadowingMode: () => void;
  setPlaybackRate: (rate: number) => void;
  setVideo: (src: string, type: "youtube" | "mp4") => void;
  setLoading: (v: boolean) => void;
}

export interface TranscribeResponse {
  segments: Segment[];
  title?: string;
}

export interface FuriganaResponse {
  words: FuriganaWord[];
}
