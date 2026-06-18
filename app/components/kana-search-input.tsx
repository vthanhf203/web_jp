"use client";

import { useState } from "react";

type KanaMode = "plain" | "hiragana" | "katakana";

const ROMAJI_TO_HIRAGANA_MAP: Record<string, string> = {
  kya: "きゃ",
  kyu: "きゅ",
  kyo: "きょ",
  gya: "ぎゃ",
  gyu: "ぎゅ",
  gyo: "ぎょ",
  sha: "しゃ",
  shu: "しゅ",
  sho: "しょ",
  sya: "しゃ",
  syu: "しゅ",
  syo: "しょ",
  ja: "じゃ",
  ju: "じゅ",
  jo: "じょ",
  jya: "じゃ",
  jyu: "じゅ",
  jyo: "じょ",
  shi: "し",
  cha: "ちゃ",
  chu: "ちゅ",
  cho: "ちょ",
  cya: "ちゃ",
  cyu: "ちゅ",
  cyo: "ちょ",
  nya: "にゃ",
  nyu: "にゅ",
  nyo: "にょ",
  hya: "ひゃ",
  hyu: "ひゅ",
  hyo: "ひょ",
  bya: "びゃ",
  byu: "びゅ",
  byo: "びょ",
  pya: "ぴゃ",
  pyu: "ぴゅ",
  pyo: "ぴょ",
  mya: "みゃ",
  myu: "みゅ",
  myo: "みょ",
  rya: "りゃ",
  ryu: "りゅ",
  ryo: "りょ",
  dya: "ぢゃ",
  dyu: "ぢゅ",
  dyo: "ぢょ",
  tsa: "つぁ",
  tsi: "つぃ",
  tse: "つぇ",
  tso: "つぉ",
  she: "しぇ",
  je: "じぇ",
  che: "ちぇ",
  fa: "ふぁ",
  fi: "ふぃ",
  fe: "ふぇ",
  fo: "ふぉ",
  va: "ゔぁ",
  vi: "ゔぃ",
  vu: "ゔ",
  ve: "ゔぇ",
  vo: "ゔぉ",
  ti: "てぃ",
  tu: "とぅ",
  di: "でぃ",
  du: "どぅ",
  wi: "うぃ",
  we: "うぇ",
  kwa: "くぁ",
  kwi: "くぃ",
  kwe: "くぇ",
  kwo: "くぉ",
  gwa: "ぐぁ",
  gwi: "ぐぃ",
  gwe: "ぐぇ",
  gwo: "ぐぉ",
  xya: "ゃ",
  xyu: "ゅ",
  xyo: "ょ",
  lya: "ゃ",
  lyu: "ゅ",
  lyo: "ょ",
  ka: "か",
  ki: "き",
  ku: "く",
  ke: "け",
  ko: "こ",
  ga: "が",
  gi: "ぎ",
  gu: "ぐ",
  ge: "げ",
  go: "ご",
  sa: "さ",
  si: "し",
  su: "す",
  se: "せ",
  so: "そ",
  za: "ざ",
  zi: "じ",
  zu: "ず",
  ze: "ぜ",
  zo: "ぞ",
  ta: "た",
  tii: "てぃ",
  tuu: "とぅ",
  te: "て",
  to: "と",
  da: "だ",
  de: "で",
  do: "ど",
  dii: "でぃ",
  duu: "どぅ",
  na: "な",
  ni: "に",
  nu: "ぬ",
  ne: "ね",
  no: "の",
  ha: "は",
  hi: "ひ",
  fu: "ふ",
  he: "へ",
  ho: "ほ",
  ba: "ば",
  bi: "び",
  bu: "ぶ",
  be: "べ",
  bo: "ぼ",
  pa: "ぱ",
  pi: "ぴ",
  pu: "ぷ",
  pe: "ぺ",
  po: "ぽ",
  ma: "ま",
  mi: "み",
  mu: "む",
  me: "め",
  mo: "も",
  ya: "や",
  yu: "ゆ",
  yo: "よ",
  ra: "ら",
  ri: "り",
  ru: "る",
  re: "れ",
  ro: "ろ",
  wa: "わ",
  wo: "を",
  qa: "くぁ",
  qi: "くぃ",
  qe: "くぇ",
  qo: "くぉ",
  la: "ぁ",
  li: "ぃ",
  lu: "ぅ",
  le: "ぇ",
  lo: "ぉ",
  xa: "ぁ",
  xi: "ぃ",
  xu: "ぅ",
  xe: "ぇ",
  xo: "ぉ",
  xtu: "っ",
  ltu: "っ",
  nn: "ん",
  ji: "じ",
  chi: "ち",
  tsu: "つ",
  a: "あ",
  i: "い",
  u: "う",
  e: "え",
  o: "お",
};

function hiraganaToKatakana(value: string): string {
  return value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function convertRomajiTokenToHiragana(token: string): string {
  const source = token.toLowerCase();
  let index = 0;
  let result = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (!char) {
      break;
    }

    if (!/[a-z']/i.test(char)) {
      result += char;
      index += 1;
      continue;
    }

    if (
      next &&
      char === next &&
      /[bcdfghjklmpqrstvwxyz]/.test(char) &&
      char !== "n"
    ) {
      result += "っ";
      index += 1;
      continue;
    }

    const four = source.slice(index, index + 4);
    if (ROMAJI_TO_HIRAGANA_MAP[four]) {
      result += ROMAJI_TO_HIRAGANA_MAP[four];
      index += 4;
      continue;
    }

    const three = source.slice(index, index + 3);
    if (ROMAJI_TO_HIRAGANA_MAP[three]) {
      result += ROMAJI_TO_HIRAGANA_MAP[three];
      index += 3;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (ROMAJI_TO_HIRAGANA_MAP[two]) {
      result += ROMAJI_TO_HIRAGANA_MAP[two];
      index += 2;
      continue;
    }

    if (char === "n") {
      if (next === "'") {
        result += "ん";
        index += 2;
        continue;
      }
      if (!next) {
        if (source.length === 1 && index === 0) {
          result += "n";
        } else {
          result += "ん";
        }
        index += 1;
        continue;
      }
      if (next === "n") {
        result += "ん";
        const third = source[index + 2];
        index += third ? 1 : 2;
        continue;
      }
      if (!/[aiueoy]/.test(next)) {
        result += "ん";
        index += 1;
        continue;
      }
    }

    if (ROMAJI_TO_HIRAGANA_MAP[char]) {
      result += ROMAJI_TO_HIRAGANA_MAP[char];
      index += 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function convertRomajiToHiraganaInput(value: string): string {
  return value.replace(/[A-Za-z']+/g, (token) => {
    const lowered = token.toLowerCase();
    if (lowered === "n") {
      return "n";
    }
    return convertRomajiTokenToHiragana(token);
  });
}

function convertByMode(value: string, mode: KanaMode): string {
  if (mode === "plain") {
    return value;
  }
  const hiragana = convertRomajiToHiraganaInput(value);
  return mode === "katakana" ? hiraganaToKatakana(hiragana) : hiragana;
}

type KanaSearchInputProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
};

export function KanaSearchInput({
  name,
  defaultValue = "",
  placeholder,
  className,
}: KanaSearchInputProps) {
  const [mode, setMode] = useState<KanaMode>("hiragana");
  const [value, setValue] = useState(defaultValue);
  const [isComposing, setIsComposing] = useState(false);

  return (
    <div className={`min-w-[300px] flex-1 ${className ?? ""}`}>
      <div className="mb-1.5 flex items-center gap-1.5 pl-1">
        <button
          type="button"
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            mode === "hiragana"
              ? "bg-sky-500 text-slate-950"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
          onClick={() => setMode("hiragana")}
        >
          ひらがな
        </button>
        <button
          type="button"
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            mode === "katakana"
              ? "bg-indigo-500 text-white"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
          onClick={() => setMode("katakana")}
        >
          カタカナ
        </button>
        <button
          type="button"
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            mode === "plain"
              ? "bg-slate-700 text-white"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
          onClick={() => setMode("plain")}
        >
          ABC
        </button>
      </div>

      <label className="group relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
        <input
          type="search"
          name={name}
          value={value}
          className="h-13 w-full rounded-2xl border border-[#bfd0ff] bg-white/95 pl-11 pr-11 text-[15px] font-semibold text-slate-800 outline-none transition focus:border-[#6378ff] focus:ring-4 focus:ring-[#6378ff22]"
          placeholder={placeholder}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            setIsComposing(false);
            setValue(convertByMode(event.currentTarget.value, mode));
          }}
          onChange={(event) => {
            const rawValue = event.currentTarget.value;
            if (isComposing) {
              setValue(rawValue);
              return;
            }
            setValue(convertByMode(rawValue, mode));
          }}
        />
        {value ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setValue("")}
            aria-label="Xóa từ khóa"
            title="Xóa"
          >
            ×
          </button>
        ) : null}
      </label>
    </div>
  );
}

