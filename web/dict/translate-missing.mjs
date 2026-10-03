/**
 * 给「没有中文释义」的词补中文：走翻译接口，每个词只取最常用的那一个意思。
 * 结果写进 .cache/zh-translated.json（可断点续跑，重跑只补没翻到的）。
 *
 * 用法：node web/dict/translate-missing.mjs [--limit 200] [--workers 4]
 *   --limit N  只翻前 N 个（先抽检质量用）；不加就是全部
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';

const HERE = import.meta.dirname;
const WEB = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.cache', 'zh-translated.json');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const LIMIT = arg('--limit', 0);
const WORKERS = arg('--workers', 4);
const API = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=th&tl=zh-CN';

const sandbox = createContext({ window: {} });
runInContext(fs.readFileSync(path.join(WEB, 'data', 'dict.js'), 'utf8'), sandbox);
const dict = sandbox.window.ThaiDictData.words;
const done = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf-8')) : {};

let todo = dict.filter((e) => !e[2] && !done[e[0]]).map((e) => e[0]);
// 翻译接口会按 IP 限流（跑到三四千条就开始返回 429），所以**按「会不会被抽到」排优先级**：
// 单音节真词先翻（随机模式下七成的卡是这类，要的就是它们有中文），其余垫后。
// 这样即使这一轮没跑完，用户实际看到的词也已经覆盖住了。
try {
  const s = createContext({ window: {} });
  runInContext(fs.readFileSync(path.join(WEB, 'data', 'syllable-index.js'), 'utf8') + ';window.ThaiSyllableIndex', s);
  const one = new Set(Object.keys(s.window.ThaiSyllableIndex.words));
  const rank = (w) => (one.has(w) ? 0 : 1);
  todo.sort((a, b) => rank(a) - rank(b));
} catch { /* 没有反查表就按原顺序 */ }
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`要翻 ${todo.length} 条（已有缓存 ${Object.keys(done).length} 条）`);

/** 一次一个词：接口回「译文 + 原词 + 语种」，取第一段就是最常用的那个意思 */
async function one(word) {
  const r = await fetch(`${API}&q=${encodeURIComponent(word)}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  const text = (data[0] || []).map((seg) => (seg && seg[0]) || '').join('').trim();
  return text && text !== word ? text.slice(0, 24) : '';
}

let ok = 0;
let fail = 0;
// 被限流（接口返回 429 / 那个「Sorry...」页）时不要一路空转，暂停一会儿再续。
// **默认就暂停 30 秒**：用户就坐在电脑前，看到限流会立刻换节点，30 秒够他切完；
// 只有连续好几轮还在被限流（比如人不在）才逐级拉长到 60 / 120 秒。
const LIMIT_WAITS = [30, 30, 30, 60, 120];
let consecutive = 0;
let limitRounds = 0;
let pauseUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gate() {
  for (;;) {
    const wait = pauseUntil - Date.now();
    if (wait <= 0) return;
    await sleep(Math.min(wait, 5000));
  }
}
const queue = todo.slice();
async function worker() {
  while (queue.length) {
    await gate();
    const w = queue.shift();
    try {
      const zh = await one(w);
      // 只有真的翻到才写进缓存：失败/空结果不落盘，下次重跑会自动再试
      if (zh) {
        done[w] = zh; ok += 1; consecutive = 0; limitRounds = 0;
      } else {
        fail += 1; consecutive += 1;
      }
    } catch {
      fail += 1;
      consecutive += 1;
    }
    if (consecutive >= 20) {
      const secs = LIMIT_WAITS[Math.min(limitRounds, LIMIT_WAITS.length - 1)];
      limitRounds += 1;
      pauseUntil = Date.now() + secs * 1000;
      console.log(`  连续失败 ${consecutive} 次，暂停 ${secs}s（换节点的话现在换）`);
      consecutive = 0;
    }
    const n = ok + fail;
    if (n % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(done));
      console.log(`  ${n}/${todo.length}（成功 ${ok} / 失败 ${fail}）`);
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
fs.writeFileSync(CACHE, JSON.stringify(done));
console.log(`完成：成功 ${ok}，失败 ${fail}（失败的下次重跑会自动再试）`);
