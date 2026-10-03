// 导出「剩余词」清单：全部辞典条目里，减去已经生成过的 5,393 条。
// 每条带上：音节划分与每节的实读声调（来自辞典 IPA 的第一个读音）。
// 写 web/audio-tools/.work-rest/list.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const WEB = path.resolve(import.meta.dirname, '..');
const WORK = path.join(import.meta.dirname, '.work-rest');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(WEB, 'rules.js'));
require(path.join(WEB, 'data', 'dict.js'));
require(path.join(WEB, 'dict.js'));
const R = globalThis.ThaiRules;
await globalThis.ThaiDict.loadWords();
const dict = globalThis.ThaiDictData.words;

const audioSrc = fs.readFileSync(path.join(WEB, 'data', 'audio.js'), 'utf8');
const existing = JSON.parse(audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1));
const done = new Set(Object.keys(existing.words));
const startId = existing.count;   // 新条目从 5394 开始编号

const out = [];
let n = 0;
for (const e of dict) {
  const [word, roman, zh, pos, common, en, phon, ipaRaw] = e;
  if (done.has(word)) continue;
  n += 1;
  const ipa = (ipaRaw || '').split('|')[0];
  const sylls = ipa ? ipa.split('.').map((s) => s.trim()) : [];
  const tones = sylls.map((s) => R.toneFromIPA(s));
  out.push({
    i: startId + n,
    word, roman: roman || '', zh: zh || '', en: en || '', common: common ? 1 : 0,
    ipa, phon: phon || '',
    syllables: sylls.length,
    tones,                                  // 每节的实读声调（null = 未知）
    correctable: tones.length > 0 && tones.every((t) => t),
  });
}
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'list.json'), JSON.stringify(out, null, 2));
const c = out.filter((x) => x.correctable).length;
console.log(`剩余 ${out.length} 条：逐音节可校正 ${c}（单音节 ${out.filter((x) => x.syllables === 1 && x.correctable).length} / 多音节 ${out.filter((x) => x.syllables > 1 && x.correctable).length}）、自然合成 ${out.length - c}`);
console.log(`编号 ${out[0].i} … ${out[out.length - 1].i} → .work-rest/list.json`);
