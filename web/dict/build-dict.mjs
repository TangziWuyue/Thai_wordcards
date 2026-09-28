#!/usr/bin/env node
/**
 * 生成辞典数据 web/data/dict.js。
 *
 * 释义全部来自中文作者整理的中泰对照词表，不做「泰文→英文→中文」的二次机翻
 * （那样出来的释义又长又容易跑偏：ทา「涂抹」会被翻成「申请」，สวย「漂亮」会被
 * 翻成「经历一些不好的事情」）。数据源都在境内可直连：
 *
 *   - 中文释义 + 例句：kinniuroudong-glitch/thai-vocabulary-studio 的
 *     assets/data.json.gz（中文作者整理的 5000 余条中泰对照词，分 B1/B2/C1 三档）
 *   - 罗马注音与词性：kaikki.org 从维基词典抽取的泰语词条（Paiboon 注音）
 *   - 真词判定用的词头：NECTEC LEXiTRON + 上面的维基词典
 *
 * 常用度：以 vocab-studio 的 B1 档（最基础的一档）当「常用词」。
 *
 * 用法：node web/dict/build-dict.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const CACHE = join(HERE, '.cache');
const OUT = join(WEB, 'data');

const SOURCES = {
  vocab: {
    url: 'https://raw.githubusercontent.com/kinniuroudong-glitch/thai-vocabulary-studio/main/assets/data.json.gz',
    file: 'thai-vocab-studio.json.gz',
    gzip: true,
  },
  lexitron: {
    url: 'https://raw.githubusercontent.com/brianbv/lexitron-data/master/telex.utf-8',
    file: 'telex.utf-8',
  },
  kaikki: {
    url: 'https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl',
    file: 'kaikki-th.jsonl',
  },
};

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' };

function log(...a) {
  process.stdout.write(`${a.join(' ')}\n`);
}

async function ensureSources() {
  mkdirSync(CACHE, { recursive: true });
  for (const [key, src] of Object.entries(SOURCES)) {
    const dest = join(CACHE, src.file);
    if (existsSync(dest)) {
      log(`· 已有缓存 ${src.file}`);
      continue;
    }
    log(`· 下载 ${key} → ${src.file}`);
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const res = await fetch(src.url, { headers: UA });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    if (lastErr) throw new Error(`${src.url} 下载失败：${lastErr.message}`);
  }
}

function readSource(name) {
  const src = SOURCES[name];
  const buf = readFileSync(join(CACHE, src.file));
  return src.gzip ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

const THAI = /^[\u0e00-\u0e7f]+$/;
const NOISE_ONLY = new Set(['\u0e46', '\u0e2f', '\u0e3a', '\u0e4c', '\u0e4d', '\u0e4e']);

/** 一个音节最长 7 个码点，更长的词永远拼不出来，不入「真词」索引 */
const MAX_SYLLABLE = 8;

function isUsableWord(w) {
  if (!THAI.test(w)) return false;
  if (w.length > 30) return false;
  if ([...w].every((ch) => NOISE_ONLY.has(ch))) return false;
  if (w.includes('\u0e46')) return false; // ๆ 表示重复，不算独立词
  return true;
}

/** 中泰对照词表：word → { zh, example, translation, level } */
function loadVocab() {
  const data = JSON.parse(readSource('vocab'));
  const map = new Map();
  for (const level of Object.keys(data)) {
    for (const entry of data[level]) {
      const word = String(entry.word || '').trim();
      const zh = String(entry.meaning || '').trim();
      if (!word || !zh || !isUsableWord(word)) continue;
      // 同一个词可能出现在多档里，保留最靠前（最基础）的那档
      if (map.has(word)) continue;
      map.set(word, {
        zh,
        example: String(entry.example || '').trim(),
        translation: String(entry.translation || '').trim(),
        level,
      });
    }
  }
  // 补一份人工核对过的基础词：上面那份词表按主题编排，问候语、颜色、礼貌语气词
  // 这类最常用的反而没收录。文件单独放着，方便随时增删复核。
  // 释义写 null 的条目只用来订正词性（例如 และ / ใน 要标成虚词，
  // 而维基词典把它们分别归到名词和介词，按通用优先级挑会挑错）。
  const basic = JSON.parse(readFileSync(join(HERE, 'basic-words.json'), 'utf8'));
  for (const [word, zh, pos] of basic) {
    if (!map.has(word)) {
      if (!zh) continue;
      map.set(word, { zh, example: '', translation: '', level: 'B1', pos });
    } else if (pos) {
      map.get(word).pos = pos;
    }
  }
  return map;
}

/** WordNet 式词性 → 界面用的短代码；fn = 虚词（没有实义，只起语法或语气作用） */
const POS_CODE = {
  noun: 'n',
  name: 'n',
  verb: 'v',
  adj: 'adj',
  adv: 'adv',
  pron: 'pron',
  num: 'num',
  classifier: 'cls',
  intj: 'intj',
  particle: 'fn',
  prep: 'fn',
  conj: 'fn',
};

/** 维基词典：只要 Paiboon 罗马注音和词性，释义不用它 */
// 同一条词在维基词典里按词性分好几条，标词性时按常用程度挑一个，
// 免得 เพื่อน（朋友）被标成古语代词那个条目
// ให้ 这类词词典里同时收了名词和动词义，标「名」会让人误会，动词/形容词更贴近实际用法
const POS_ORDER = ['v', 'n', 'adj', 'adv', 'cls', 'num', 'intj', 'fn', 'pron'];
// 英文兜底释义也不要「used to express …」这种解释性开头
const EN_STRIP = /^(?:used to express|used as|a word used to|to express)\s+/i;
// 「alternative form of กฎ」「misspelling of …」这类是参见条目，不是词义，不能当释义用
const EN_META = /\b(?:form|spelling|misspelling|shortening|clipping|synonym|plural|abbreviation|romanization|transliteration|name) of\b/i;

function loadKaikki() {
  const map = new Map();
  for (const line of readSource('kaikki').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const w = o.word;
    if (!w) continue;
    const rom = (o.forms || []).find((f) => (f.tags || []).includes('romanization'))?.form || '';
    const prev = map.get(w) || { rom: '', posList: [], en: '' };
    const code = POS_CODE[String(o.pos || '').toLowerCase()];
    if (code && !prev.posList.includes(code)) prev.posList.push(code);
    // 从头找第一条「真的在讲意思」的说法：跳过 : 结尾的标签，也跳过参见条目
    let en = prev.en;
    if (!en) {
      for (const sense of o.senses || []) {
        const gloss = (sense.glosses || []).find(
          (g) => !String(g).endsWith(':') && !EN_META.test(String(g)),
        );
        if (!gloss) continue;
        en = String(gloss).replace(EN_STRIP, '').split(';')[0].trim().slice(0, 60);
        break;
      }
    }
    map.set(w, { rom: prev.rom || rom, posList: prev.posList, en });
  }
  const out = new Map();
  for (const [w, v] of map) {
    const pos = POS_ORDER.find((p) => v.posList.includes(p)) || '';
    out.set(w, { rom: v.rom, pos, en: v.en });
  }
  return out;
}

/** LEXiTRON：词头 + 英文释义。英文兜底优先用它——比维基词典的定义短，更像词条 */
function loadLexitron() {
  const map = new Map();
  for (const m of readSource('lexitron').matchAll(/<Doc>([\s\S]*?)<\/Doc>/g)) {
    const body = m[1];
    const pick = (name) => {
      const hit = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return hit ? hit[1].trim() : '';
    };
    const w = pick('tentry') || pick('tsearch');
    if (!w) continue;
    const en = pick('eentry').slice(0, 60);
    // 同一个词头只留第一条有英文的
    if (!map.has(w)) map.set(w, en);
  }
  return map;
}

async function main() {
  await ensureSources();

  const vocab = loadVocab();
  const kaikki = loadKaikki();
  const lexitron = loadLexitron();
  const commonSet = new Set(
    [...vocab].filter(([, v]) => v.level === 'B1').map(([w]) => w),
  );
  log(`中泰词表 ${vocab.size} 条（常用档 ${commonSet.size} 条）/ 维基词典 ${kaikki.size} / LEXiTRON ${lexitron.size}`);

  // 入典范围 = 有中文释义的词（词典主体）+ 所有可能被拼出来的真词（只用于判定「真词」）
  const indexSet = new Set(
    [...lexitron.keys(), ...kaikki.keys()].filter((w) => isUsableWord(w) && [...w].length <= MAX_SYLLABLE),
  );
  const all = [...new Set([...vocab.keys(), ...indexSet])].filter(isUsableWord).sort();
  log(`入典词头 ${all.length} 条（有中文释义 ${vocab.size} 条）`);

  const entries = all.map((w) => {
    const v = vocab.get(w);
    const k = kaikki.get(w) || { rom: '', pos: '', en: '' };
    // 人工补的基础词表里标了词性的（ครับ 这类语气词）优先用它
    // 第 6 位是英文释义：**只在没有中文释义时才存**，这样界面上不可能出现
    // 「这个词明明有中文却显示英文」。优先维基词典（LEXiTRON 的 eentry 会挑偏义项：
    // น้ำ 给的是 river、สวัสดี 给的是 safety）
    const zhText = v ? v.zh : '';
    let en = zhText ? '' : (k.en || lexitron.get(w) || '');
    if (en && EN_META.test(en)) en = ''; // LEXiTRON 偶尔也有参见条目，一并挡掉
    return [w, k.rom, zhText, v?.pos || k.pos || '', commonSet.has(w) ? 1 : 0, en];
  });

  const withZh = entries.filter((e) => e[2]).length;
  const withEn = entries.filter((e) => !e[2] && e[5]).length;
  const common = entries.filter((e) => e[4]).length;
  log(`· 出典 ${entries.length} 条：中文释义 ${withZh}，只有英文 ${withEn}，标为常用 ${common}，有罗马注音 ${entries.filter((e) => e[1]).length}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'dict.js'),
    // 注意：全局名是 ThaiDictData，不要写成 ThaiDict —— dict.js 用 ThaiDict 暴露接口
    'window.ThaiDictData=' + JSON.stringify({
      source: '中泰词表 thai-vocabulary-studio（B1/B2/C1）· 注音与词性来自 Wiktionary (kaikki.org) · 真词与英文释义来自 LEXiTRON',
      note: '中文释义取自中文作者整理的中泰对照词表，未做机器翻译；词表没收录的词给英文释义，界面上会标明「英文」。',
      commonLabel: 'B1 常用档',
      words: entries,
    }) + ';\n',
  );
  log('· 已写 web/data/dict.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
