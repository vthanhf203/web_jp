"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVocabLessonBundleInput = parseVocabLessonBundleInput;
exports.parseVocabInput = parseVocabInput;
function normalizeText(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
}
function pickString(source, keys) {
    for (const key of keys) {
        const value = normalizeText(source[key]);
        if (value) {
            return value;
        }
    }
    return "";
}
function hasKanjiChars(value) {
    return /[\u4e00-\u9fff]/.test(value);
}
function looksLikePartOfSpeech(value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    const posKeywords = [
        "noun",
        "verb",
        "adjective",
        "adverb",
        "pronoun",
        "danh tu",
        "dong tu",
        "tinh tu",
        "pho tu",
        "tro tu",
        "lien tu",
        "cam than",
        "cum tu",
        "n",
        "v",
        "adj",
        "adv",
        "exp",
    ];
    return posKeywords.some((keyword) => normalized === keyword || normalized.includes(keyword));
}
function rowFromObject(source) {
    const word = pickString(source, ["word", "japanese", "jp", "term", "text", "kana"]);
    const kanji = pickString(source, ["kanji", "surface", "hantu", "hanTu", "hanzi"]);
    const reading = pickString(source, ["reading", "hiragana", "yomi", "furigana"]);
    const hanviet = pickString(source, ["hanviet", "han_viet", "hanViet", "sinoVietnamese"]);
    const meaning = pickString(source, ["meaning", "translation", "vi", "vn", "nghia"]);
    const partOfSpeech = pickString(source, ["partOfSpeech", "type", "pos", "grammarType"]);
    const resolvedWord = word || kanji;
    if (!resolvedWord || !meaning) {
        return null;
    }
    const resolvedKanji = kanji || (hasKanjiChars(resolvedWord) ? resolvedWord : "");
    return {
        word: resolvedWord,
        reading: reading || resolvedWord,
        kanji: resolvedKanji,
        hanviet,
        partOfSpeech,
        meaning,
    };
}
function parseLineByDelimiter(line) {
    const delimiters = ["\t", "|", ";", " - ", ","];
    for (const delimiter of delimiters) {
        if (line.includes(delimiter)) {
            return line
                .split(delimiter)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return [line.trim()];
}
function rowFromLine(line) {
    const cleanLine = line.trim();
    if (!cleanLine) {
        return null;
    }
    const parts = parseLineByDelimiter(cleanLine);
    if (parts.length < 2) {
        return null;
    }
    if (parts.length === 2) {
        const word = parts[0];
        return {
            word,
            reading: word,
            kanji: hasKanjiChars(word) ? word : "",
            hanviet: "",
            partOfSpeech: "",
            meaning: parts[1],
        };
    }
    if (parts.length === 3) {
        const word = parts[0];
        return {
            word,
            reading: parts[1],
            kanji: hasKanjiChars(word) ? word : "",
            hanviet: "",
            partOfSpeech: "",
            meaning: parts[2],
        };
    }
    if (parts.length === 4) {
        const word = parts[0];
        const third = parts[2];
        return {
            word,
            reading: parts[1],
            kanji: hasKanjiChars(word) ? word : "",
            hanviet: looksLikePartOfSpeech(third) ? "" : third,
            partOfSpeech: looksLikePartOfSpeech(third) ? third : "",
            meaning: parts[3],
        };
    }
    if (parts.length === 5) {
        return {
            word: parts[0],
            reading: parts[1],
            kanji: parts[2],
            hanviet: parts[3],
            partOfSpeech: "",
            meaning: parts[4],
        };
    }
    return {
        word: parts[0],
        reading: parts[1],
        kanji: parts[2],
        hanviet: parts[3],
        partOfSpeech: parts[4],
        meaning: parts.slice(5).join(" - "),
    };
}
function parseJsonInput(rawInput) {
    const parsed = JSON.parse(rawInput);
    if (Array.isArray(parsed)) {
        return parsed
            .map((item) => item && typeof item === "object"
            ? rowFromObject(item)
            : null)
            .filter((item) => !!item);
    }
    if (parsed && typeof parsed === "object") {
        const obj = parsed;
        const listCandidate = obj.items ?? obj.vocab ?? obj.words ?? obj.data;
        if (Array.isArray(listCandidate)) {
            return listCandidate
                .map((item) => item && typeof item === "object"
                ? rowFromObject(item)
                : null)
                .filter((item) => !!item);
        }
    }
    return [];
}
function normalizeBundleTitle(rawKey) {
    const key = rawKey.trim();
    if (!key) {
        return "Lesson";
    }
    const baiMatch = /^bai[_\-\s]*(\d+)$/i.exec(key);
    if (baiMatch?.[1]) {
        return `Bai ${Number(baiMatch[1])}`;
    }
    const lessonMatch = /^lesson[_\-\s]*(\d+)$/i.exec(key);
    if (lessonMatch?.[1]) {
        return `Lesson ${Number(lessonMatch[1])}`;
    }
    return key
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
function lessonRowsFromUnknown(input) {
    if (Array.isArray(input)) {
        return input
            .map((item) => item && typeof item === "object"
            ? rowFromObject(item)
            : null)
            .filter((item) => !!item);
    }
    if (input && typeof input === "object") {
        const source = input;
        const listCandidate = source.items ?? source.vocab ?? source.words ?? source.data ?? [];
        if (Array.isArray(listCandidate)) {
            return listCandidate
                .map((item) => item && typeof item === "object"
                ? rowFromObject(item)
                : null)
                .filter((item) => !!item);
        }
    }
    return [];
}
function parseLessonTokens(rawLesson) {
    if (typeof rawLesson !== "string") {
        return [];
    }
    return rawLesson
        .split(/[,\|;/]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}
function normalizeLessonKey(rawKey) {
    return rawKey
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}
function parseVocabLessonBundleInput(rawInput) {
    const text = rawInput.trim();
    if (!text) {
        return { lessons: [], groups: [] };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return { lessons: [], groups: [] };
    }
    if (!parsed || typeof parsed !== "object") {
        return { lessons: [], groups: [] };
    }
    const root = parsed;
    const groups = Array.isArray(root.groups)
        ? root.groups.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
    const lessons = [];
    const lessonsNode = root.lessons;
    if (lessonsNode && typeof lessonsNode === "object" && !Array.isArray(lessonsNode)) {
        const lessonRecord = lessonsNode;
        for (const [lessonKey, lessonValue] of Object.entries(lessonRecord)) {
            const rows = lessonRowsFromUnknown(lessonValue);
            if (rows.length === 0) {
                continue;
            }
            let jlptLevel = "";
            if (lessonValue && typeof lessonValue === "object" && !Array.isArray(lessonValue)) {
                const valueObj = lessonValue;
                jlptLevel =
                    normalizeText(valueObj.jlptLevel) ||
                        normalizeText(valueObj.level) ||
                        normalizeText(root.jlptLevel) ||
                        normalizeText(root.level);
            }
            else {
                jlptLevel = normalizeText(root.jlptLevel) || normalizeText(root.level);
            }
            lessons.push({
                key: lessonKey,
                title: normalizeBundleTitle(lessonKey),
                jlptLevel: jlptLevel || undefined,
                rows,
            });
        }
    }
    else if (Array.isArray(lessonsNode)) {
        for (let index = 0; index < lessonsNode.length; index += 1) {
            const lessonNode = lessonsNode[index];
            if (!lessonNode || typeof lessonNode !== "object") {
                continue;
            }
            const lessonObj = lessonNode;
            const rows = lessonRowsFromUnknown(lessonObj);
            if (rows.length === 0) {
                continue;
            }
            const rawTitle = normalizeText(lessonObj.title) ||
                normalizeText(lessonObj.lessonTitle) ||
                normalizeText(lessonObj.name) ||
                normalizeText(lessonObj.id) ||
                `Lesson ${index + 1}`;
            const jlptLevel = normalizeText(lessonObj.jlptLevel) ||
                normalizeText(lessonObj.level) ||
                normalizeText(root.jlptLevel) ||
                normalizeText(root.level);
            lessons.push({
                key: `lesson_${index + 1}`,
                title: normalizeBundleTitle(rawTitle),
                jlptLevel: jlptLevel || undefined,
                rows,
            });
        }
    }
    else {
        // Support structure grouped by category:
        // { "xung_ho_chao_hoi": [ {..., lesson: "bai_1"} ], ... }
        const groupedEntries = Object.entries(root).filter(([key, value]) => key !== "groups" && Array.isArray(value));
        if (groupedEntries.length > 0) {
            const lessonBuckets = new Map();
            for (const [groupKey, groupValue] of groupedEntries) {
                const groupRows = Array.isArray(groupValue) ? groupValue : [];
                for (const entry of groupRows) {
                    if (!entry || typeof entry !== "object") {
                        continue;
                    }
                    const source = entry;
                    const row = rowFromObject(source);
                    if (!row) {
                        continue;
                    }
                    const jlptLevel = normalizeText(source.jlptLevel) ||
                        normalizeText(source.level) ||
                        normalizeText(root.jlptLevel) ||
                        normalizeText(root.level);
                    const lessonTokens = parseLessonTokens(source.lesson ?? source.lessonId ?? source.bai ?? source.deck);
                    const targetLessonTokens = lessonTokens.length > 0 ? lessonTokens : [groupKey];
                    for (const token of targetLessonTokens) {
                        const bucketKey = normalizeLessonKey(token);
                        const existing = lessonBuckets.get(bucketKey);
                        if (existing) {
                            existing.rows.push({ ...row });
                            if (!existing.jlptLevel && jlptLevel) {
                                existing.jlptLevel = jlptLevel;
                            }
                            continue;
                        }
                        lessonBuckets.set(bucketKey, {
                            key: bucketKey,
                            title: normalizeBundleTitle(token),
                            jlptLevel: jlptLevel || undefined,
                            rows: [{ ...row }],
                        });
                    }
                }
            }
            lessons.push(...Array.from(lessonBuckets.values()));
        }
    }
    if (lessons.length === 0) {
        const directRows = lessonRowsFromUnknown(root);
        if (directRows.length > 0) {
            lessons.push({
                key: "lesson_1",
                title: "Lesson 1",
                jlptLevel: normalizeText(root.jlptLevel) || normalizeText(root.level) || undefined,
                rows: directRows,
            });
        }
    }
    return { lessons, groups };
}
function parseJsonLinesInput(rawInput) {
    const objectLines = rawInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("{") && line.includes("}"));
    if (objectLines.length === 0) {
        return [];
    }
    const rows = [];
    for (const line of objectLines) {
        const normalizedLine = line.replace(/,+\s*$/, "");
        try {
            const parsed = JSON.parse(normalizedLine);
            if (parsed && typeof parsed === "object") {
                const row = rowFromObject(parsed);
                if (row) {
                    rows.push(row);
                }
            }
        }
        catch {
            // Skip invalid line.
        }
    }
    return rows;
}
function parseTextInput(rawInput) {
    return rawInput
        .split(/\r?\n/)
        .map((line) => rowFromLine(line))
        .filter((item) => !!item);
}
function parseVocabInput(rawInput) {
    const text = rawInput.trim();
    if (!text) {
        return [];
    }
    try {
        const fromJson = parseJsonInput(text);
        if (fromJson.length > 0) {
            return fromJson;
        }
    }
    catch {
        // Fall back to json-lines parser.
    }
    const fromJsonLines = parseJsonLinesInput(text);
    if (fromJsonLines.length > 0) {
        return fromJsonLines;
    }
    return parseTextInput(text);
}
