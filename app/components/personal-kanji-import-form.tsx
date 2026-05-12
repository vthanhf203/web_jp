"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import {
  addManualPersonalKanjiAction,
  clearPersonalKanjiAction,
  createPersonalKanjiDeckAction,
  deletePersonalKanjiDeckAction,
  deletePersonalKanjiAction,
  importPersonalKanjiAction,
  type PersonalKanjiImportState,
} from "@/app/actions/personal";

const initialState: PersonalKanjiImportState = {
  status: "idle",
  message: "",
};

type PersonalKanjiRow = {
  id: string;
  character: string;
  deckName?: string;
  meaning: string;
  jlptLevel: string;
  relatedWords?: Array<{
    id: string;
    word: string;
    reading: string;
    meaning: string;
  }>;
};

type Props = {
  items?: PersonalKanjiRow[];
  deckNames?: string[];
};

function buildPersonalExportUrl(download: boolean): string {
  const query = new URLSearchParams();
  if (download) {
    query.set("download", "1");
  }
  const queryString = query.toString();
  return queryString ? `/api/personal/kanji-export?${queryString}` : "/api/personal/kanji-export";
}

export function PersonalKanjiImportForm({ items = [], deckNames = [] }: Props) {
  const [state, formAction, pending] = useActionState(importPersonalKanjiAction, initialState);
  const [createDeckState, createDeckAction, creatingDeck] = useActionState(
    createPersonalKanjiDeckAction,
    initialState
  );
  const [manualState, manualAction, manualPending] = useActionState(
    addManualPersonalKanjiAction,
    initialState
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const deckNameInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [selectedDeckName, setSelectedDeckName] = useState("");
  const [quickDeckDraft, setQuickDeckDraft] = useState("");
  const [clientMessage, setClientMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const canInteract = !pending && !isLoadingExisting && !manualPending && !creatingDeck;
  const normalizedDeckNames = Array.from(
    new Set(
      deckNames
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
  const deckMap = new Map<string, PersonalKanjiRow[]>();
  for (const deckName of normalizedDeckNames) {
    deckMap.set(deckName, []);
  }
  for (const item of items) {
    const deckName = item.deckName?.trim() || "Chua phan loai";
    const current = deckMap.get(deckName) ?? [];
    current.push(item);
    deckMap.set(deckName, current);
  }
  const deckGroups = Array.from(deckMap.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  const deckTargets = deckGroups.map(([name]) => name);

  function applyDeckTarget(target: string) {
    const deckName = target.trim();
    if (!deckName) {
      return;
    }
    if (deckNameInputRef.current) {
      deckNameInputRef.current.value = deckName;
    }
    setSelectedDeckName(deckName);
    setClientMessage(null);
  }

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="space-y-3"
        onSubmit={() => {
          setClientMessage(null);
        }}
      >
        <div className="rounded-xl border border-[#d8e2ee] bg-[#f8fbff] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#39598b]">
              Muc import JSON
            </p>
            <p className="text-xs text-[#6b7ea3]">
              Bam vao muc de import JSON vao dung noi do.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {deckTargets.length > 0 ? (
              deckTargets.map((deckName) => {
                const existingCount = deckGroups.find((entry) => entry[0] === deckName)?.[1].length ?? 0;
                const isActive = selectedDeckName === deckName;
                return (
                  <button
                    key={deckName}
                    type="button"
                    onClick={() => applyDeckTarget(deckName)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      isActive
                        ? "border-[#14947f] bg-[#e8fbf8] text-[#0f7a6b]"
                        : "border-[#bdd7ff] bg-[#f1f6ff] text-[#2557a7] hover:bg-[#e7f0ff]"
                    }`}
                    disabled={!canInteract}
                    title={deckName}
                  >
                    {deckName}
                    {existingCount > 0 ? ` (${existingCount})` : " (moi)"}
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-slate-500">Chua co muc nao. Tao muc moi ben duoi.</p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              name="createDeckName"
              value={quickDeckDraft}
              onChange={(event) => setQuickDeckDraft(event.target.value)}
              maxLength={90}
              placeholder="Tao muc moi: Bai 1, Bai 2..."
              className="h-9 w-full max-w-[280px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
              disabled={!canInteract}
            />
            <button
              type="submit"
              formAction={createDeckAction}
              formNoValidate
              className="h-9 rounded-xl border border-[#3aa8ff] bg-[#edf7ff] px-3 text-xs font-bold text-[#0b5cad] hover:bg-[#e1f0ff] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canInteract || !quickDeckDraft.trim()}
              onClick={() => {
                const next = quickDeckDraft.trim();
                if (!next) {
                  return;
                }
                applyDeckTarget(next);
                setQuickDeckDraft("");
              }}
            >
              {creatingDeck ? "Dang tao..." : "Tao muc"}
            </button>
          </div>
          {createDeckState.message ? (
            <p
              className={
                createDeckState.status === "error"
                  ? "mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                  : "mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
              }
            >
              {createDeckState.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_160px]">
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Ten bo Kanji / noi dung upload</span>
            <input
              ref={deckNameInputRef}
              name="deckName"
              required
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
              placeholder="Vi du: Bai 1, Bai 2, Kanji gia dinh..."
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Upload file JSON</span>
            <input
              name="jsonFile"
              type="file"
              accept=".json,application/json"
              className="block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-sky-700"
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Ep JLPT khi import</span>
            <select
              name="levelOverride"
              defaultValue="AUTO"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
              disabled={!canInteract}
            >
              <option value="AUTO">Tu dong theo JSON</option>
              <option value="N5">N5</option>
              <option value="N4">N4</option>
              <option value="N3">N3</option>
              <option value="N2">N2</option>
              <option value="N1">N1</option>
            </select>
          </label>
        </div>

        <textarea
          ref={textareaRef}
          name="rawInput"
          className="min-h-44 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
          placeholder='Dan JSON Kanji hoac chon file .json ben tren. Neu JSON co "deckName" thi van se duoc doi sang muc ban da chon o phia tren.'
          disabled={!canInteract}
        />

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                : "whitespace-pre-line rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            }
          >
            {state.message}
          </p>
        ) : null}
        {clientMessage ? (
          <p
            className={
              clientMessage.type === "error"
                ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            }
          >
            {clientMessage.text}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canInteract}
          >
            {pending ? "Dang upload..." : "Import / Upload JSON"}
          </button>

          <button
            type="button"
            className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
            onClick={() => {
              if (!textareaRef.current) {
                return;
              }
              textareaRef.current.value = JSON.stringify(
                [
                  {
                    deckName: "Bo thu cong mau",
                    character: "低",
                    meaning: "thap",
                    onReading: ["テイ"],
                    kunReading: ["ひく.い", "ひく.める"],
                    strokeCount: 7,
                    jlptLevel: "N5",
                    order: 12,
                    category: "tinh_chat",
                    strokeHint: "Nho theo bo nhan dung + phan ben phai.",
                    strokeImage: "/kanji-stroke/raw/example.jpg",
                    relatedVocabularies: [
                      { word: "低い", reading: "ひくい", meaning: "thap" },
                      { word: "低温", reading: "ていおん", meaning: "nhiet do thap" },
                      { word: "最低", reading: "さいてい", meaning: "thap nhat" },
                    ],
                  },
                ],
                null,
                2
              );
              setClientMessage(null);
            }}
            disabled={!canInteract}
          >
            Mau JSON
          </button>

          <button
            type="button"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
            onClick={async () => {
              setClientMessage(null);
              setIsLoadingExisting(true);
              try {
                const response = await fetch(buildPersonalExportUrl(false), {
                  method: "GET",
                  cache: "no-store",
                });
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                const parsed = (await response.json()) as unknown;
                const text = JSON.stringify(parsed, null, 2);
                if (textareaRef.current) {
                  textareaRef.current.value = text;
                }
                const itemCount = Array.isArray(parsed) ? parsed.length : 0;
                setClientMessage({
                  type: "success",
                  text: `Da nap JSON ca nhan hien co (${itemCount} Kanji).`,
                });
              } catch {
                setClientMessage({
                  type: "error",
                  text: "Khong lay duoc JSON Kanji ca nhan. Hay thu lai.",
                });
              } finally {
                setIsLoadingExisting(false);
              }
            }}
            disabled={!canInteract}
          >
            {isLoadingExisting ? "Dang nap..." : "Nap tu kho hien co"}
          </button>

          <a
            href={buildPersonalExportUrl(true)}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
          >
            Tai JSON ca nhan
          </a>

          <button
            type="button"
            className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
            onClick={() => {
              if (textareaRef.current) {
                textareaRef.current.value = "";
              }
              setClientMessage(null);
            }}
            disabled={!canInteract}
          >
            Xoa nhap
          </button>
        </div>
      </form>

      <form
        action={manualAction}
        className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Them thu cong 1 muc Kanji
          </p>
          <p className="text-xs text-emerald-700/80">Nhap nhanh roi luu ngay, khong can JSON.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-[110px_minmax(0,1fr)_140px]">
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Kanji</span>
            <input
              name="manualCharacter"
              required
              maxLength={8}
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              placeholder="来"
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Nghia</span>
            <input
              name="manualMeaning"
              required
              maxLength={160}
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              placeholder="den, toi"
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>JLPT</span>
            <select
              name="manualJlptLevel"
              defaultValue="N5"
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              disabled={!canInteract}
            >
              <option value="N5">N5</option>
              <option value="N4">N4</option>
              <option value="N3">N3</option>
              <option value="N2">N2</option>
              <option value="N1">N1</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Bo</span>
            <input
              name="manualDeckName"
              maxLength={90}
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              placeholder="Vi du: N4 bai 1"
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>On</span>
            <input
              name="manualOnReading"
              maxLength={120}
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              placeholder="ライ"
              disabled={!canInteract}
            />
          </label>
          <label className="space-y-1 text-sm font-bold text-slate-700">
            <span>Kun</span>
            <input
              name="manualKunReading"
              maxLength={120}
              className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100"
              placeholder="く.る"
              disabled={!canInteract}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canInteract}
            >
              {manualPending ? "Dang luu..." : "Luu thu cong"}
            </button>
          </div>
        </div>
        {manualState.message ? (
          <p
            className={
              manualState.status === "error"
                ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            }
          >
            {manualState.message}
          </p>
        ) : null}
      </form>

      {deckGroups.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
              Bo Kanji da upload ({deckGroups.length})
            </p>
            <p className="text-xs text-sky-700/70">
              Moi bo co the hoc flashcard hoac quiz rieng.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {deckGroups.map(([deckName, deckItems]) => {
              const levelSummary = Array.from(new Set(deckItems.map((item) => item.jlptLevel))).join(", ");
              const deckQuery = encodeURIComponent(deckName);
              return (
                <article key={deckName} className="rounded-xl border border-sky-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900" title={deckName}>
                        {deckName}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {deckItems.length} Kanji{levelSummary ? ` · ${levelSummary}` : ""}
                      </p>
                    </div>
                    <form action={deletePersonalKanjiDeckAction}>
                      <input type="hidden" name="deckName" value={deckName} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                        disabled={pending || isLoadingExisting || manualPending || creatingDeck}
                      >
                        Xoa bo
                      </button>
                    </form>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/kanji/learn?scope=personal&deck=${deckQuery}`}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                    >
                      Flashcard
                    </Link>
                    <Link
                      href={`/kanji/learn?scope=personal&mode=quiz&deck=${deckQuery}`}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      Quiz bo nay
                    </Link>
                    <Link
                      href={`/kanji/learn?scope=personal&mode=recall&deck=${deckQuery}`}
                      className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-100"
                    >
                      Nhồi bộ này
                    </Link>
                    <a
                      href={`${buildPersonalExportUrl(true)}&deck=${encodeURIComponent(deckName)}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                      Tai bo
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Kanji ca nhan da luu ({items.length})
          </p>
          <form action={clearPersonalKanjiAction}>
            <button
              type="submit"
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                items.length > 0
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
              disabled={items.length === 0 || pending || isLoadingExisting || manualPending || creatingDeck}
            >
              Xoa toan bo
            </button>
          </form>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500">
            Chua co Kanji ca nhan nao.
          </p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-900">
                    {item.character}{" "}
                    <span className="text-sm font-semibold text-slate-500">{item.jlptLevel}</span>
                  </p>
                  <p className="truncate text-sm text-slate-600">{item.meaning}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-sky-700">
                    Bo: {item.deckName?.trim() || "Chua phan loai"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Tu lien quan: {item.relatedWords?.length ?? 0}
                  </p>
                  {(item.relatedWords?.length ?? 0) > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(item.relatedWords ?? []).slice(0, 3).map((word) => (
                        <span
                          key={word.id}
                          className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
                          title={`${word.word}${word.reading ? ` (${word.reading})` : ""} - ${word.meaning}`}
                        >
                          {word.word}
                        </span>
                      ))}
                      {(item.relatedWords?.length ?? 0) > 3 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          +{(item.relatedWords?.length ?? 0) - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <form action={deletePersonalKanjiAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    disabled={pending || isLoadingExisting || manualPending || creatingDeck}
                  >
                    Xoa
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
