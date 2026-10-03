/**
 * 生成练习页抽词要用的两份小数据（都是构建产物，不要手改）：
 *
 *   data/common.js          「常用词」档的池子（辞典里标了「常用」的那 2,038 条）。
 *                           单独出一份是因为 data/dict.js 有 2.3MB 且是**懒加载**的，
 *                           为了抽词把它拉下来太重（小程序那边也是同一条约定）。
 *   data/syllable-index.js  「拼写 → 音节拆解」反查表，只收单音节真词（3,800 条上下）。
 *                           规则引擎只有「拆解 → 拼写」这一向；抽到单音节词要摆回原来
 *                           那张音节卡（好让声调还能自己改），就得有这个反查表。
 *                           **必须在构建期算好**：运行时枚举所有合法组合要 450ms，
 *                           点一下「随机组合」卡半秒，不能接受。
 *
 * 用法：node web/build-pools.mjs   （改完辞典 / 音频 / 规则引擎都要重跑）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';

const WEB = path.resolve(import.meta.dirname);
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(WEB, 'rules.js'));
require(path.join(WEB, 'data', 'audio.js'));
const R = globalThis.ThaiRules;
const AUDIO = globalThis.ThaiAudioData.words;

const dictSandbox = createContext({ window: {} });
runInContext(fs.readFileSync(path.join(WEB, 'data', 'dict.js'), 'utf8'), dictSandbox);
const DICT = dictSandbox.window.ThaiDictData.words;

// ── 1) 常用词清单 ────────────────────────────────────────────────────
const common = DICT.filter((e) => e[4]).map((e) => e[0]);
const commonOut = `/**
 * 常用词清单（构建产物，由 web/build-pools.mjs 生成；不要手改）。
 * 练习页的「常用词」档按它抽词（还要在发音清单里有音频，所以实际是两者的交集）。
 */
window.ThaiCommonWords = ${JSON.stringify(common)};
`;
fs.writeFileSync(path.join(WEB, 'data', 'common.js'), commonOut);
console.log(`data/common.js：${common.length} 条 / ${(Buffer.byteLength(commonOut) / 1024).toFixed(0)}KB`);

// ── 2) 单音节词的反查表 ──────────────────────────────────────────────
// 表里存下标而不是字符串，体积小一半；字母顺序由文件自己带着，运行时不用猜 rules.js 的顺序
const letters = R.CONSONANTS.map((c) => c.ch);
const clusterChars = [''];
const clusterIdx = new Map([['', 0]]);
for (const pair of R.CLUSTERS) {
  const b = Array.isArray(pair) ? pair[1] : pair;
  if (!clusterIdx.has(b)) { clusterIdx.set(b, clusterChars.length); clusterChars.push(b); }
}
const vowelIds = R.VOWELS.map((v) => v.id);
const vowelIdx = new Map(vowelIds.map((id, i) => [id, i]));
const toneIds = R.TONES.map((t) => t.id);
const toneIdx = new Map(toneIds.map((id, i) => [id, i]));
const finals = [''];
const finalIdx = new Map([['', 0]]);
for (const f of Object.keys(R.FINALS)) { finalIdx.set(f, finals.length); finals.push(f); }

const t0 = Date.now();
const words = {};
for (const c of R.CONSONANTS) {
  for (const cluster of [null, ...R.CLUSTERS.filter(([a]) => a === c.ch).map(([, b]) => b)]) {
    for (const v of R.VOWELS) {
      for (const tone of R.TONES) {
        for (const final of [null, ...Object.keys(R.FINALS)]) {
          const parts = { onset: c.ch, cluster, vowelId: v.id, tone: tone.id, final };
          if (R.check(parts).length) continue;
          const text = R.assemble(parts);
          const meta = AUDIO[text];
          if (!meta || meta[2] !== 1) continue;          // 只收单音节真词
          if (meta[1] && R.spokenTone(parts) !== meta[1]) continue;   // 同一个拼写用实读调消歧
          if (words[text]) continue;
          words[text] = [
            letters.indexOf(c.ch),
            clusterIdx.get(cluster || '') || 0,
            vowelIdx.get(v.id),
            toneIdx.get(tone.id),
            finalIdx.get(final || '') || 0,
          ];
        }
      }
    }
  }
}
const sylOut = `/**
 * 单音节词的反查表（构建产物，由 web/build-pools.mjs 生成；不要手改）。
 * words: 拼写 → [声母, 簇, 元音, 声调, 尾辅音] 的下标；下标分别对应下面这几个数组。
 * 只收「单音节 + 有音频」的真词，让抽到的词能摆回原来那张音节卡。
 */
window.ThaiSyllableIndex = ${JSON.stringify({
  version: 1, letters, clusters: clusterChars, vowels: vowelIds, tones: toneIds, finals, words,
})};
`;
fs.writeFileSync(path.join(WEB, 'data', 'syllable-index.js'), sylOut);
console.log(`data/syllable-index.js：${Object.keys(words).length} 条 / ${(Buffer.byteLength(sylOut) / 1024).toFixed(0)}KB`
  + `（建表 ${Date.now() - t0}ms）`);
