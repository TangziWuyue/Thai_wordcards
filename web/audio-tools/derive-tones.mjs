/**
 * 给「没有 IPA」的词补声调：用规则引擎反解拼写。
 *   1) 枚举所有合法 parts，建「拼写 → 该拼写的实读调集合」的反查表；
 *   2) 整词命中且调唯一 → 单音节，用规则算的调；
 *   3) 否则用辞典的 phon（实际读音拼写）按 '-' 切成音节，逐节反查；
 *   4) 仍拿不到的保持自然合成。
 * 就地更新 web/audio-tools/.work-rest/list.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const WEB = path.resolve(import.meta.dirname, '..');
const WORK = path.join(import.meta.dirname, '.work-rest');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(WEB, 'rules.js'));
const R = globalThis.ThaiRules;

// 1) 反查表：拼写 → Set(实读调)
const map = new Map();
const onsets = R.CONSONANTS.map((c) => c.ch);
const uiVowels = R.VOWELS.map((v) => v.id);
const finals = [null, ...Object.keys(R.FINALS)];
const tones = ['none', 'ek', 'tho', 'tri', 'chattawa'];
for (const onset of onsets) {
  const clusters = [null, ...R.CLUSTERS.filter(([a]) => a === onset).map(([, b]) => b)];
  for (const cluster of clusters) {
    for (const vowelId of uiVowels) {
      for (const tone of tones) {
        for (const final of finals) {
          const parts = { onset, cluster, vowelId, tone, final };
          if (R.check(parts).length) continue;
          const text = R.assemble(parts);
          const t = R.spokenTone(parts);
          if (!t) continue;
          let set = map.get(text);
          if (!set) { set = new Set(); map.set(text, set); }
          set.add(t);
        }
      }
    }
  }
}
console.log('反查表:', map.size, '种拼写');

function toneOf(text) {
  const set = map.get(text);
  return set && set.size === 1 ? [...set][0] : null;
}

/**
 * 把整词切成若干「规则能解析的音节」：动态规划，音节数最少优先；
 * 同一位置出现多种不同调序列 → 视为歧义，返回 null（不硬猜）。
 * 返回 [ {text, tone}, ... ] 或 null。
 */
function segmentTones(word) {
  const cps = [...word];
  const n = cps.length;
  if (n < 2) return null;
  const best = new Array(n + 1).fill(null);   // { count, tones, segs, ambiguous }
  best[0] = { count: 0, tones: [], segs: [], ambiguous: false };
  for (let i = 0; i < n; i += 1) {
    if (!best[i]) continue;
    for (let len = 1; len <= 8 && i + len <= n; len += 1) {
      const text = cps.slice(i, i + len).join('');
      const t = toneOf(text);
      if (!t) continue;
      const cand = {
        count: best[i].count + 1,
        tones: [...best[i].tones, t],
        segs: [...best[i].segs, text],
        ambiguous: false,
      };
      const cur = best[i + len];
      if (!cur) { best[i + len] = cand; continue; }
      if (cand.count < cur.count) { best[i + len] = cand; continue; }
      if (cand.count === cur.count && JSON.stringify(cand.tones) !== JSON.stringify(cur.tones)) {
        cur.ambiguous = true;
      }
    }
  }
  const end = best[n];
  if (!end || end.ambiguous || !end.segs.length) return null;
  return end;
}

// 2) 逐个补
const listPath = path.join(WORK, 'list.json');
const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
let whole = 0; let viaPhon = 0; let segmented = 0; let left = 0;
for (const it of list) {
  if (it.correctable) continue;
  const t = toneOf(it.word);
  if (t) {
    it.tones = [t];
    it.syllables = 1;
    it.correctable = true;
    it.toneSource = 'rules';
    whole += 1;
    continue;
  }
  const phon = (it.phon || '').replace(/^-|-$/g, '');
  if (phon && phon.includes('-')) {
    const segs = phon.split('-').filter(Boolean);
    const ts = segs.map(toneOf);
    if (ts.length && ts.every((x) => x)) {
      it.tones = ts;
      it.syllables = ts.length;
      it.correctable = true;
      it.toneSource = 'rules-phon';
      viaPhon += 1;
      continue;
    }
  }
  const seg = segmentTones(it.word);
  if (seg) {
    it.tones = seg.tones;
    it.syllables = seg.tones.length;
    it.correctable = true;
    it.toneSource = 'rules-segment';
    it.segments = seg.segs;
    segmented += 1;
    continue;
  }
  left += 1;
}
fs.writeFileSync(listPath, JSON.stringify(list, null, 2));
const total = list.filter((x) => x.correctable).length;
console.log(`整词反解命中 ${whole} 条；用 phon 逐节反解 ${viaPhon} 条；切分式反解 ${segmented} 条；仍未定调 ${left} 条`);
console.log(`剩余清单里可校正总数：${total} / ${list.length}`);
