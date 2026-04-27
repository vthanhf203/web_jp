const fs = require('fs');
const { parseVocabLessonBundleInput } = require('./tmp-test/vocab-import.js');
const input = fs.readFileSync('_tmp_bundle.json', 'utf8');
const result = parseVocabLessonBundleInput(input);
console.log(result.lessons.map((l) => l.title).join(', '));
