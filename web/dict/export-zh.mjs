/**
 * 导出「泰文 → 中文」清单，供人工润色。
 *
 * 输出 reports/词表-待润色.tsv：`泰文<TAB>中文<TAB>来源<TAB>常用`
 *   来源 = 人工 / 机翻 / 润色（润色 = 已经改过的，见下面 polished-zh.json）
 *   常用 = 1 / 0（**先润色 常用=1 的那批**，2,000 多条就够）
 *
 * 润色完把结果存成 web/dict/polished-zh.json（`{ "泰文": "中文" }`），
 * 它比机翻优先、比 basic-words.json 低；重新 build 之后这些条目就不再标「机翻」了。
 *
 * 用法：node web/dict/export-zh.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';

const HERE = import.meta.dirname;
const WEB = path.resolve(HERE, '..');
const sandbox = createContext({ window: {} });
runInContext(fs.readFileSync(path.join(WEB, 'data', 'dict.js'), 'utf8'), sandbox);
const words = sandbox.window.ThaiDictData.words;

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {});
const machine = readJson(path.join(HERE, '.cache', 'zh-translated.json'));
const polished = readJson(path.join(HERE, 'polished-zh.json'));
const basic = new Set(JSON.parse(fs.readFileSync(path.join(HERE, 'basic-words.json'), 'utf-8')).map((e) => e[0]));
// 单音节真词：随机模式下七成的卡是这类，润色优先它们
const sylSandbox = createContext({ window: {} });
runInContext(
  fs.readFileSync(path.join(WEB, 'data', 'syllable-index.js'), 'utf8') + ';window.ThaiSyllableIndex',
  sylSandbox,
);
const oneSyllable = new Set(Object.keys(sylSandbox.window.ThaiSyllableIndex.words));

const rows = [];
for (const e of words) {
  const [w, , zh, , common] = e;
  const src = basic.has(w) ? '人工' : (polished[w] ? '润色' : (machine[w] ? '机翻' : '其它'));
  if (src === '其它') continue;
  rows.push([w, zh || '', src, common ? '1' : '0', oneSyllable.has(w) ? '1' : '0']);
}
// 排序：常用 > 单音节 > 泰文（前两列是「会被用户看到的概率」）
rows.sort((a, b) => (b[3] === '1') - (a[3] === '1')
  || (b[4] === '1') - (a[4] === '1')
  || a[0].localeCompare(b[0], 'th'));

const out = path.join(WEB, '..', 'reports', '词表-待润色.tsv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ['泰文\t中文\t来源\t常用\t单音节', ...rows.map((r) => r.join('\t'))].join('\n') + '\n');
const common = rows.filter((r) => r[3] === '1').length;
const one = rows.filter((r) => r[4] === '1').length;
console.log(`已写 reports/词表-待润色.tsv：${rows.length} 条（常用 ${common}、单音节 ${one}；最该先看的是前 ${common + one} 条）`);
console.log(`  机翻 ${rows.filter((r) => r[2] === '机翻').length} / 润色 ${rows.filter((r) => r[2] === '润色').length} / 人工 ${rows.filter((r) => r[2] === '人工').length}`);
