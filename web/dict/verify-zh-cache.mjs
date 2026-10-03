/**
 * 核对 .cache/zh-cache.json（机器翻译那份泰中对照）——它只在人工中文为空时补位，
 * 但机器给的会有错（มันฝรั่ง「土豆」被译成「希望」），所以先过一遍：
 *
 *   1) 拿已入库的人工条目（同时有中文 + 英文）拼一张「英文 → 中文」对照表，
 *      再拿它去核机器条目：对不上的一律算「冲突」。
 *   2) 规则性垃圾：单字 / 纯数字 / 跟泰文或英文一模一样 / 超长。
 *   3) 剩下的算「无参照」（没有人工对照可比，只能标未核对）。
 *
 * 用法：node web/dict/verify-zh-cache.mjs [--out reports/zh-cache-核对.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';

const HERE = import.meta.dirname;
const WEB = path.resolve(HERE, '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : 'reports/zh-cache-核对.md';

const sandbox = createContext({ window: {} });
runInContext(fs.readFileSync(path.join(WEB, 'data', 'dict.js'), 'utf8'), sandbox);
const dict = sandbox.window.ThaiDictData.words;
const mt = JSON.parse(fs.readFileSync(path.join(HERE, '.cache', 'zh-cache.json'), 'utf-8'));

const byWord = new Map(dict.map((e) => [e[0], e]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

// 1) 人工表 → 英文到中文的对照
const en2zh = new Map();
for (const e of dict) {
  const [w, , zh, , , en] = e;
  if (!zh || !en) continue;
  const key = norm(en);
  if (!key) continue;
  if (!en2zh.has(key)) en2zh.set(key, new Set());
  en2zh.get(key).add(zh.split(/[；;，,、／/]/)[0].trim());
}

const junk = [];
const clash = [];
const ok = [];
const unknown = [];
for (const [w, zh] of Object.entries(mt)) {
  const s = String(zh || '').trim();
  const en = (byWord.get(w) || [])[5] || '';
  if (!s || s === w || s === en) { junk.push([w, s, '空/与原文相同']); continue; }
  if (/^[\d\s.,;:!?()-]+$/.test(s)) { junk.push([w, s, '纯数字符号']); continue; }
  if ([...s].length <= 1) { junk.push([w, s, '只有一个字']); continue; }
  if ([...s].length > 20) { junk.push([w, s, '过长']); continue; }
  const key = norm(en);
  if (!key || !en2zh.has(key)) { unknown.push([w, s, en]); continue; }
  const cands = en2zh.get(key);
  const hit = [...cands].some((c) => c === s || s.includes(c) || c.includes(s));
  (hit ? ok : clash).push([w, s, en, [...cands].slice(0, 3).join(' / ')]);
}

const pct = (n) => ((n / Object.keys(mt).length) * 100).toFixed(1) + '%';
const lines = [
  '# zh-cache 核对报告',
  '',
  `- 机器条目：**${Object.keys(mt).length}** 条`,
  `- 有人工英文可对照的：**${ok.length + clash.length}** 条（${pct(ok.length + clash.length)}）`,
  `- 　其中一致：**${ok.length}**，**冲突：${clash.length}**`,
  `- 无人工对照（只能标未核对）：**${unknown.length}**（${pct(unknown.length)}）`,
  `- 规则性垃圾：**${junk.length}**`,
  '',
  '## 冲突（机器中文与人工英文对不上，最高优先人工过目）',
  '',
  '| 泰文 | 机器中文 | 英文 | 人工表里的中文 |',
  '| --- | --- | --- | --- |',
  ...clash.slice(0, 200).map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
  '',
  '## 规则性垃圾',
  '',
  '| 泰文 | 机器中文 | 判定 |',
  '| --- | --- | --- |',
  ...junk.slice(0, 100).map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
  '',
];
const OUTPATH = path.resolve(WEB, '..', OUT);
fs.mkdirSync(path.dirname(OUTPATH), { recursive: true });
fs.writeFileSync(OUTPATH, lines.join('\n'));
console.log(`一致 ${ok.length} / 冲突 ${clash.length} / 无对照 ${unknown.length} / 垃圾 ${junk.length}`);
console.log(`报告：${OUT}`);
