/**
 * 把 web/ 里的共享逻辑同步到小程序工程（单一数据源，禁止手抄两份）：
 *   - rules.js / tutorial-data.js / tutorial-search.js  → 原样复制（它们本身支持 module.exports）
 *   - web/data/audio.js + web/data/dict.js              → 加工成小程序用的精简清单
 *     miniprogram/core/audio-manifest.js：
 *       模块导出 { count, words: { 词: [文件名, 实读调, 音节数, 罗马注音, 释义] } }
 *   - 前 20 条音频复制到 miniprogram/assets/audio-demo/（包内试听，先让工程能出声；
 *     全量 5,393 条走云存储，见 miniprogram/README.md）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WEB = path.join(ROOT, 'web');
const MP = path.join(ROOT, 'miniprogram');

fs.mkdirSync(path.join(MP, 'core'), { recursive: true });
fs.mkdirSync(path.join(MP, 'assets', 'audio-demo'), { recursive: true });

// 1) 原样复制的核心文件
for (const f of ['rules.js', 'tutorial-data.js', 'tutorial-search.js']) {
  fs.copyFileSync(path.join(WEB, f), path.join(MP, 'core', f));
}

// 2) 加工清单：audio.js（词 → 文件）+ dict.js（罗马注音/释义）
globalThis.window = globalThis;
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
require(path.join(WEB, 'data', 'dict.js'));
require(path.join(WEB, 'dict.js'));
await globalThis.ThaiDict.loadWords();
const byWord = new Map(globalThis.ThaiDictData.words.map((e) => [e[0], e]));
const audioSrc = fs.readFileSync(path.join(WEB, 'data', 'audio.js'), 'utf8');
const json = audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1);
const audio = JSON.parse(json);

const words = {};
let romanMissing = 0;
for (const [word, tuple] of Object.entries(audio.words)) {
  const e = byWord.get(word) || [];
  const roman = e[1] || '';
  if (!roman) romanMissing += 1;
  const gloss = (e[2] || e[5] || '').slice(0, 24);
  words[word] = [tuple[0], tuple[1] || 0, tuple[2] || 0, roman, gloss];
}
const out = `/**
 * 单词发音清单（构建产物，由 tools/sync-miniprogram.mjs 从 web/ 生成；不要手改）。
 * 每项：[文件名, 实读声调(0=未知), 音节数, 罗马注音, 释义]
 * 全量音频在云存储 audio/ 下；assets/audio-demo/ 里放前 20 条用于工程内试听。
 */
module.exports = ${JSON.stringify({ version: 1, dir: 'audio/', count: audio.count, words })};
`;
fs.writeFileSync(path.join(MP, 'core', 'audio-manifest.js'), out);
console.log(`audio-manifest.js：${audio.count} 条（缺罗马注音 ${romanMissing} 条，${(out.length / 1024).toFixed(0)}KB）`);

// 3) 包内试听：前 20 条
const demoDir = path.join(MP, 'assets', 'audio-demo');
for (const f of fs.readdirSync(demoDir)) fs.unlinkSync(path.join(demoDir, f));
for (let i = 1; i <= 20; i += 1) {
  const name = `${String(i).padStart(4, '0')}.mp3`;
  fs.copyFileSync(path.join(WEB, 'audio', name), path.join(demoDir, name));
}
console.log('assets/audio-demo：已复制 20 条试听音频');
