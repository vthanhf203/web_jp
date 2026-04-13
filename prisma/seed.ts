import { PrismaClient, QuizOption } from "@prisma/client";

const prisma = new PrismaClient();

const kanjiSeed = [
  {
    character: "日",
    meaning: "mặt trời, ngày",
    onReading: "ニチ / ジツ",
    kunReading: "ひ / -び / -か",
    strokeCount: 4,
    jlptLevel: "N5",
    exampleWord: "日本",
    exampleMeaning: "Nhật Bản",
  },
  {
    character: "人",
    meaning: "người",
    onReading: "ジン / ニン",
    kunReading: "ひと",
    strokeCount: 2,
    jlptLevel: "N5",
    exampleWord: "外国人",
    exampleMeaning: "người nước ngoài",
  },
  {
    character: "学",
    meaning: "học",
    onReading: "ガク",
    kunReading: "まなぶ",
    strokeCount: 8,
    jlptLevel: "N5",
    exampleWord: "学生",
    exampleMeaning: "học sinh",
  },
  {
    character: "先",
    meaning: "trước, tiên",
    onReading: "セン",
    kunReading: "さき",
    strokeCount: 6,
    jlptLevel: "N5",
    exampleWord: "先生",
    exampleMeaning: "giáo viên",
  },
  {
    character: "生",
    meaning: "sống, sinh",
    onReading: "セイ / ショウ",
    kunReading: "いきる / うまれる",
    strokeCount: 5,
    jlptLevel: "N5",
    exampleWord: "生活",
    exampleMeaning: "cuộc sống",
  },
  {
    character: "時",
    meaning: "thời gian, giờ",
    onReading: "ジ",
    kunReading: "とき",
    strokeCount: 10,
    jlptLevel: "N5",
    exampleWord: "時間",
    exampleMeaning: "thời gian",
  },
  {
    character: "会",
    meaning: "gặp, hội",
    onReading: "カイ / エ",
    kunReading: "あう",
    strokeCount: 6,
    jlptLevel: "N5",
    exampleWord: "会社",
    exampleMeaning: "công ty",
  },
  {
    character: "社",
    meaning: "xã, công ty",
    onReading: "シャ",
    kunReading: "やしろ",
    strokeCount: 7,
    jlptLevel: "N5",
    exampleWord: "神社",
    exampleMeaning: "đền thần",
  },
  {
    character: "読",
    meaning: "đọc",
    onReading: "ドク",
    kunReading: "よむ",
    strokeCount: 14,
    jlptLevel: "N4",
    exampleWord: "読書",
    exampleMeaning: "đọc sách",
  },
  {
    character: "書",
    meaning: "viết",
    onReading: "ショ",
    kunReading: "かく",
    strokeCount: 10,
    jlptLevel: "N4",
    exampleWord: "辞書",
    exampleMeaning: "từ điển",
  },
  {
    character: "食",
    meaning: "ăn",
    onReading: "ショク",
    kunReading: "たべる",
    strokeCount: 9,
    jlptLevel: "N5",
    exampleWord: "食事",
    exampleMeaning: "bữa ăn",
  },
  {
    character: "飲",
    meaning: "uống",
    onReading: "イン",
    kunReading: "のむ",
    strokeCount: 12,
    jlptLevel: "N5",
    exampleWord: "飲み物",
    exampleMeaning: "đồ uống",
  },
  {
    character: "車",
    meaning: "xe",
    onReading: "シャ",
    kunReading: "くるま",
    strokeCount: 7,
    jlptLevel: "N5",
    exampleWord: "電車",
    exampleMeaning: "tàu điện",
  },
  {
    character: "駅",
    meaning: "ga",
    onReading: "エキ",
    kunReading: "",
    strokeCount: 14,
    jlptLevel: "N5",
    exampleWord: "駅前",
    exampleMeaning: "trước ga",
  },
  {
    character: "高",
    meaning: "cao, đắt",
    onReading: "コウ",
    kunReading: "たかい",
    strokeCount: 10,
    jlptLevel: "N4",
    exampleWord: "高校",
    exampleMeaning: "trường cấp 3",
  },
  {
    character: "安",
    meaning: "rẻ, yên",
    onReading: "アン",
    kunReading: "やすい",
    strokeCount: 6,
    jlptLevel: "N4",
    exampleWord: "安心",
    exampleMeaning: "an tâm",
  },
  {
    character: "新",
    meaning: "mới",
    onReading: "シン",
    kunReading: "あたらしい",
    strokeCount: 13,
    jlptLevel: "N4",
    exampleWord: "新聞",
    exampleMeaning: "báo",
  },
  {
    character: "古",
    meaning: "cũ",
    onReading: "コ",
    kunReading: "ふるい",
    strokeCount: 5,
    jlptLevel: "N4",
    exampleWord: "中古",
    exampleMeaning: "đồ cũ",
  },
  {
    character: "旅",
    meaning: "du lịch",
    onReading: "リョ",
    kunReading: "たび",
    strokeCount: 10,
    jlptLevel: "N3",
    exampleWord: "旅行",
    exampleMeaning: "chuyến du lịch",
  },
  {
    character: "勉",
    meaning: "siêng, cố gắng",
    onReading: "ベン",
    kunReading: "",
    strokeCount: 10,
    jlptLevel: "N3",
    exampleWord: "勉強",
    exampleMeaning: "học tập",
  },
];

const vocabSeed = [
  {
    word: "日本語",
    reading: "にほんご",
    meaning: "tiếng Nhật",
    jlptLevel: "N5",
    partOfSpeech: "Danh từ",
    exampleSentence: "日本語を勉強しています。",
    exampleMeaning: "Tôi đang học tiếng Nhật.",
  },
  {
    word: "学生",
    reading: "がくせい",
    meaning: "học sinh, sinh viên",
    jlptLevel: "N5",
    partOfSpeech: "Danh từ",
    exampleSentence: "彼は大学の学生です。",
    exampleMeaning: "Anh ấy là sinh viên đại học.",
  },
  {
    word: "先生",
    reading: "せんせい",
    meaning: "giáo viên",
    jlptLevel: "N5",
    partOfSpeech: "Danh từ",
    exampleSentence: "先生に質問します。",
    exampleMeaning: "Tôi hỏi giáo viên.",
  },
  {
    word: "会社",
    reading: "かいしゃ",
    meaning: "công ty",
    jlptLevel: "N5",
    partOfSpeech: "Danh từ",
    exampleSentence: "会社は駅の近くです。",
    exampleMeaning: "Công ty ở gần ga.",
  },
  {
    word: "電車",
    reading: "でんしゃ",
    meaning: "tàu điện",
    jlptLevel: "N5",
    partOfSpeech: "Danh từ",
    exampleSentence: "毎朝電車で行きます。",
    exampleMeaning: "Mỗi sáng tôi đi bằng tàu điện.",
  },
  {
    word: "食べる",
    reading: "たべる",
    meaning: "ăn",
    jlptLevel: "N5",
    partOfSpeech: "Động từ",
    exampleSentence: "夜ご飯を食べました。",
    exampleMeaning: "Tôi đã ăn bữa tối.",
  },
  {
    word: "飲む",
    reading: "のむ",
    meaning: "uống",
    jlptLevel: "N5",
    partOfSpeech: "Động từ",
    exampleSentence: "水をたくさん飲んでください。",
    exampleMeaning: "Hãy uống nhiều nước.",
  },
  {
    word: "読む",
    reading: "よむ",
    meaning: "đọc",
    jlptLevel: "N4",
    partOfSpeech: "Động từ",
    exampleSentence: "新聞を読みます。",
    exampleMeaning: "Tôi đọc báo.",
  },
  {
    word: "書く",
    reading: "かく",
    meaning: "viết",
    jlptLevel: "N4",
    partOfSpeech: "Động từ",
    exampleSentence: "名前を書いてください。",
    exampleMeaning: "Hãy viết tên.",
  },
  {
    word: "忙しい",
    reading: "いそがしい",
    meaning: "bận rộn",
    jlptLevel: "N4",
    partOfSpeech: "Tính từ",
    exampleSentence: "今日はとても忙しいです。",
    exampleMeaning: "Hôm nay rất bận.",
  },
  {
    word: "簡単",
    reading: "かんたん",
    meaning: "đơn giản",
    jlptLevel: "N4",
    partOfSpeech: "Tính từ na",
    exampleSentence: "この問題は簡単です。",
    exampleMeaning: "Câu hỏi này đơn giản.",
  },
  {
    word: "難しい",
    reading: "むずかしい",
    meaning: "khó",
    jlptLevel: "N4",
    partOfSpeech: "Tính từ i",
    exampleSentence: "漢字は難しいですね。",
    exampleMeaning: "Kanji khó nhỉ.",
  },
  {
    word: "旅行",
    reading: "りょこう",
    meaning: "du lịch",
    jlptLevel: "N3",
    partOfSpeech: "Danh từ",
    exampleSentence: "来月京都へ旅行します。",
    exampleMeaning: "Tháng tới tôi sẽ đi du lịch Kyoto.",
  },
  {
    word: "経験",
    reading: "けいけん",
    meaning: "kinh nghiệm",
    jlptLevel: "N3",
    partOfSpeech: "Danh từ",
    exampleSentence: "いい経験になりました。",
    exampleMeaning: "Đó đã trở thành trải nghiệm tốt.",
  },
  {
    word: "挑戦",
    reading: "ちょうせん",
    meaning: "thử thách",
    jlptLevel: "N3",
    partOfSpeech: "Danh từ/Động từ suru",
    exampleSentence: "新しいことに挑戦したいです。",
    exampleMeaning: "Tôi muốn thử thách điều mới.",
  },
];

const quizSeed = [
  {
    level: "N5",
    category: "Vocab",
    prompt: "「先生」の読み方はどれですか。",
    optionA: "せんせい",
    optionB: "がくせい",
    optionC: "せんしゅ",
    optionD: "せんき",
    correctOption: QuizOption.A,
    explanation: "先生 đọc là せんせい.",
  },
  {
    level: "N5",
    category: "Kanji",
    prompt: "「日」の意味として正しいものは？",
    optionA: "núi",
    optionB: "ngày, mặt trời",
    optionC: "sông",
    optionD: "cây",
    correctOption: QuizOption.B,
    explanation: "日 có nghĩa ngày, mặt trời.",
  },
  {
    level: "N5",
    category: "Vocab",
    prompt: "「電車」で会社へ行きます。意味は？",
    optionA: "xe buýt",
    optionB: "tàu điện",
    optionC: "taxi",
    optionD: "xe đạp",
    correctOption: QuizOption.B,
    explanation: "電車 nghĩa là tàu điện.",
  },
  {
    level: "N5",
    category: "Kanji",
    prompt: "「食べる」に使う漢字は？",
    optionA: "飲",
    optionB: "読",
    optionC: "食",
    optionD: "学",
    correctOption: QuizOption.C,
    explanation: "食べる dùng chữ 食.",
  },
  {
    level: "N4",
    category: "Vocab",
    prompt: "「難しい」の意味はどれですか。",
    optionA: "dễ",
    optionB: "đắt",
    optionC: "mới",
    optionD: "khó",
    correctOption: QuizOption.D,
    explanation: "難しい nghĩa là khó.",
  },
  {
    level: "N4",
    category: "Kanji",
    prompt: "「書」のKun読みは？",
    optionA: "かく",
    optionB: "よむ",
    optionC: "のむ",
    optionD: "いく",
    correctOption: QuizOption.A,
    explanation: "書く đọc là かく.",
  },
  {
    level: "N4",
    category: "Grammar",
    prompt: "明日は___ですから、早く寝ます。",
    optionA: "暇",
    optionB: "忙しい",
    optionC: "静か",
    optionD: "元気",
    correctOption: QuizOption.B,
    explanation: "Câu nghĩa là vì mai bận nên ngủ sớm.",
  },
  {
    level: "N4",
    category: "Kanji",
    prompt: "「新しい」đối nghĩa gần nhất là gì?",
    optionA: "高い",
    optionB: "古い",
    optionC: "安い",
    optionD: "忙しい",
    correctOption: QuizOption.B,
    explanation: "新しい (mới) đối lập với 古い (cũ).",
  },
  {
    level: "N3",
    category: "Vocab",
    prompt: "「挑戦」の意味はどれですか。",
    optionA: "thử thách",
    optionB: "thất bại",
    optionC: "thành công",
    optionD: "kế hoạch",
    correctOption: QuizOption.A,
    explanation: "挑戦 nghĩa là thử thách/challenge.",
  },
  {
    level: "N3",
    category: "Vocab",
    prompt: "「経験がある」nghĩa là gì?",
    optionA: "đang nghỉ",
    optionB: "có kinh nghiệm",
    optionC: "đã quên",
    optionD: "đã bỏ cuộc",
    correctOption: QuizOption.B,
    explanation: "経験がある là có kinh nghiệm.",
  },
  {
    level: "N3",
    category: "Kanji",
    prompt: "「旅」に liên quan nghĩa nào?",
    optionA: "chiến đấu",
    optionB: "nấu ăn",
    optionC: "du lịch",
    optionD: "học tập",
    correctOption: QuizOption.C,
    explanation: "旅 liên quan đến du lịch, hành trình.",
  },
  {
    level: "N3",
    category: "Grammar",
    prompt: "日本語を勉強すればするほど、___。",
    optionA: "わかりません",
    optionB: "面白くなります",
    optionC: "寝ます",
    optionD: "高いです",
    correctOption: QuizOption.B,
    explanation: "Mẫu càng... càng...: 面白くなります.",
  },
];

async function seedKanji() {
  const count = await prisma.kanji.count();
  if (count > 0) {
    return;
  }

  for (const item of kanjiSeed) {
    await prisma.kanji.create({ data: item });
  }
}

async function seedVocab() {
  const count = await prisma.vocab.count();
  if (count > 0) {
    return;
  }

  for (const item of vocabSeed) {
    await prisma.vocab.create({ data: item });
  }
}

async function seedQuiz() {
  const count = await prisma.quizQuestion.count();
  if (count > 0) {
    return;
  }

  for (const item of quizSeed) {
    await prisma.quizQuestion.create({ data: item });
  }
}

async function main() {
  await seedKanji();
  await seedVocab();
  await seedQuiz();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
