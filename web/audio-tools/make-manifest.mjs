// 把 .work/manifest.json 转成网页用的 web/data/audio.js（window.ThaiAudioData）。
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const WEB = path.resolve(DIR, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, '.work', 'manifest.json'), 'utf-8'));
const words = {};
for (const it of manifest) words[it.word] = [it.file, it.tone || 0, it.syllables || 0];
const head = `/**
 * 单词发音清单（构建产物，由 web/audio-tools 生成；不要手改）。
 * 数据：AI 合成（Azure th-TH Premwadee）+ 声调曲线校正，共 ${manifest.length} 条。
 * 每项：[文件名, 实读声调(0=未知), 音节数]；音频与页面同源（audio/ 目录）。
 */
window.ThaiAudioData = `;
fs.writeFileSync(path.join(WEB, 'data', 'audio.js'), head + JSON.stringify({
  version: 1,
  dir: 'audio/',
  count: manifest.length,
  words,
}) + ';\n');
console.log(`已写 web/data/audio.js（${manifest.length} 条）`);
