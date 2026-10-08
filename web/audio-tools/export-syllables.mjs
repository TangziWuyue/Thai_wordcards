// 导出「固定模式全组合」要用的音节音频清单（写 .work/syl-list.json）。
//
// 固定模式只能选「一个辅音 + 一个元音」（没有辅音簇、没有尾辅音）：
//   · 两个都选 → onset × vowel
//   · 只选辅音 → 元音补 สระออ（o_long，本来就在可选元音里）
//   · 只选元音 → 用 อ 当载体（อ 本身也是辅音之一）；ฤ ฤๅ ฦ ฦๅ 自带声母、不加载体
// 声调按 toneOptions(strict) 过滤；check() 不过的（ั / เ-ิ / เ-็ 缺尾音）不生成，
// 卡片上本来就提示「拼不完整，换一个元音」。
//
// 声音身份 = rules.js 的 soundKey（IPA + 实读调 + 长短），文件名 syl/v1/{key}.mp3；
// 同音不同写法只出一条。能直接借用现有真词音频的（同拼写、单音节、实读调一致）
// 标 copyFrom；其余写 say（要合成的写法）交给 generate-syllables.py。
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';

const WEB = path.resolve(import.meta.dirname, '..');
const WORK = path.join(import.meta.dirname, '.work');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(WEB, 'rules.js'));
const R = globalThis.ThaiRules;

// 词音频清单（构建产物）：词 → [文件, 实读调, 音节数]
const sandbox = createContext({ window: {} });
runInContext(fs.readFileSync(path.join(WEB, 'data', 'audio.js'), 'utf8'), sandbox);
const WORDS = sandbox.window.ThaiAudioData.words;

// ฦ ฦๅ 是单字符，TTS 发不出来（单词批次里也没有它们），合成时换成读音写法
const SAY_OVERRIDE = { 'ฦ': 'ลึ', 'ฦๅ': 'ลือ' };

const candidates = new Map(); // key → [{parts, text, tone, rare, obsolete, order}]
let order = 0;
function push(parts) {
  if (R.check(parts).length) return;
  const opt = R.toneOptions(parts, true).find((t) => t.id === parts.tone);
  if (!opt || !opt.allowed) return;
  const key = R.soundKey(parts);
  if (!key) return;
  const con = parts.onset ? R.CONSONANTS.find((c) => c.ch === parts.onset) : null;
  if (!candidates.has(key)) candidates.set(key, []);
  candidates.get(key).push({
    parts,
    text: R.assemble(parts),
    tone: R.spokenTone(parts) || 0,
    rare: !!(con && con.rare),
    obsolete: !!(con && con.obsolete),
    order: order++,
  });
}

for (const con of R.CONSONANTS) {
  for (const vid of R.SELECTABLE_VOWEL_IDS) {
    for (const tone of R.TONES) {
      push({ onset: con.ch, cluster: null, vowelId: vid, tone: tone.id, final: null });
    }
  }
}
for (const vid of R.SELECTABLE_VOWEL_IDS) {
  if (!R.VOWELS.find((v) => v.id === vid).canBeOnset) continue;
  for (const tone of R.TONES) {
    push({ onset: null, cluster: null, vowelId: vid, tone: tone.id, final: null });
  }
}

// 同一个声音的多个写法里挑一条最省事的来发音：
// ① 能直接借用真词音频（同拼写、单音节、实读调一致）优先；
// ② 其次避开已废弃 / 借词用字，TTS 读常见字母更稳。
function scoreOf(c) {
  const w = WORDS[c.text];
  const wordOk = !!(w && w[2] === 1 && (c.tone === 0 || w[1] === c.tone));
  return [wordOk ? 0 : 1, c.obsolete ? 1 : 0, c.rare ? 1 : 0, c.order];
}
const less = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
};

const items = [];
let copyN = 0;
let rarePick = 0;
for (const [key, list] of candidates) {
  let best = null;
  let bestScore = null;
  for (const c of list) {
    const s = scoreOf(c);
    if (!bestScore || less(s, bestScore)) { best = c; bestScore = s; }
  }
  const w = WORDS[best.text];
  const wordOk = w && w[2] === 1 && (best.tone === 0 || w[1] === best.tone);
  const item = { i: items.length + 1, key, text: best.text, tone: best.tone };
  if (wordOk) {
    item.copyFrom = w[0];
    copyN += 1;
  } else {
    item.say = SAY_OVERRIDE[best.text] || best.text;
    // 没有实读调、又借不到词音频的（只有 ฦ / ฦๅ）：铺平调曲线。
    // 自然合成的句尾会往下滑（用户：不要下滑），平调 = 不滑、也不硬造调。
    if (item.tone === 0) item.tone = 1;
  }
  if (best.rare || best.obsolete) rarePick += 1;
  items.push(item);
}

fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'syl-list.json'), JSON.stringify(items, null, 1));
console.log(`音节清单：${items.length} 条声音`
  + `（借用真词音频 ${copyN} / 需要合成 ${items.length - copyN}）`);
console.log(`其中发音写法带「罕用 / 已废弃」字母的：${rarePick} 条`);
console.log(`→ .work/syl-list.json`);
