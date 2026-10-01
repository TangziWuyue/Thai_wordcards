// 导出需要发音的单词清单：常用词 ∪ 随机模式能拼出的真词。
// 写 web/audio-tools/.work/list.json（含实读声调、音节数、释义）。
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const WEB = path.resolve(import.meta.dirname, '..');
const WORK = path.join(import.meta.dirname, '.work');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(WEB, 'rules.js'));
require(path.join(WEB, 'data', 'dict.js'));
require(path.join(WEB, 'dict.js'));

const R = globalThis.ThaiRules;
await globalThis.ThaiDict.loadWords();
const dict = globalThis.ThaiDictData.words;
const byWord = new Map(dict.map((e) => [e[0], e]));

// 穷举 UI 可达的单音节写法，记下能拼出真词的那些
const onsets = R.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
const uiVowels = R.SELECTABLE_VOWEL_IDS.concat(['o_implied']);
const finals = [null, ...Object.keys(R.FINALS)];
const tones = ['none', 'ek', 'tho', 'tri', 'chattawa'];
const reachable = new Map();
for (const onset of onsets) {
  const clusters = [null, ...R.CLUSTERS.filter(([a]) => a === onset).map(([, b]) => b)];
  for (const cluster of clusters) {
    for (const vowelId of uiVowels) {
      for (const tone of tones) {
        for (const final of finals) {
          const parts = { onset, cluster, vowelId, tone, final };
          if (R.check(parts).length) continue;
          const text = R.assemble(parts);
          if (!reachable.has(text)) reachable.set(text, parts);
        }
      }
    }
  }
}

const common = dict.filter((e) => e[4]).map((e) => e[0]);
const union = [...new Set([...common, ...[...reachable.keys()].filter((t) => byWord.has(t))])];
const out = union.map((word, i) => {
  const e = byWord.get(word) || [];
  const parts = reachable.get(word);
  const ipa = (e[7] || '').split('|')[0];
  const ipaTone = R.toneFromIPA(ipa);
  const engineTone = parts ? R.spokenTone(parts) : null;
  const syllables = ipa ? ipa.split('.').length : (parts ? 1 : null);
  return {
    i: i + 1, word, roman: e[1] || '', zh: e[2] || '', en: e[5] || '',
    common: e[4] ? 1 : 0, ipa, tone: ipaTone || engineTone || null, syllables,
  };
});

fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'list.json'), JSON.stringify(out, null, 2));
const fix = out.filter((x) => x.syllables === 1 && x.tone).length;
console.log(`共 ${out.length} 条（单音节校正 ${fix} / 多音节自然合成 ${out.length - fix}）→ .work/list.json`);
