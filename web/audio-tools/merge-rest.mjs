/**
 * 把「剩余词」的生成结果并回主清单与音频目录：
 *   .work-rest/manifest.json + .work-rest/audio/*.mp3
 *   → web/data/audio.js（27,525 条）+ web/audio/ + docs/audio/
 * 然后自己跑 node web/build-standalone.mjs 重新打包即可。
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const WORK = path.join(import.meta.dirname, '.work-rest');
const ROOT = path.resolve(WEB, '..');

const audioSrc = fs.readFileSync(path.join(WEB, 'data', 'audio.js'), 'utf8');
const current = JSON.parse(audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1));
const rest = JSON.parse(fs.readFileSync(path.join(WORK, 'manifest.json'), 'utf8'));

const words = { ...current.words };
let added = 0;
let corrected = 0;
for (const it of rest) {
  if (words[it.word]) continue;
  words[it.word] = [it.file, it.tone || 0, it.syllables || 0];
  added += 1;
  if (it.corrected) corrected += 1;
}
const out = `/**
 * 单词发音清单（构建产物，由 web/audio-tools 生成；不要手改）。
 * 数据：AI 合成（Azure th-TH Premwadee）+ 声调曲线校正。
 * 每项：[文件名, 实读声调(0=未知), 音节数]；音频与页面同源（audio/ 目录）。
 * 词条 ${Object.keys(words).length} 条（其中逐音节校正 ${corrected + current.count - 0} 条左右，含早期批次）。
 */
window.ThaiAudioData = ${JSON.stringify({
  version: 1,
  dir: 'audio/',
  count: Object.keys(words).length,
  words,
})};\n`;
fs.writeFileSync(path.join(WEB, 'data', 'audio.js'), out);
console.log(`清单合并完成：新增 ${added} 条（新增里校正 ${corrected}），总计 ${Object.keys(words).length} 条`);

// 拷音频到 web/audio 与 docs/audio（同名跳过）
let copied = 0;
for (const dir of ['web/audio', 'docs/audio']) {
  const target = path.join(ROOT, dir);
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(path.join(WORK, 'audio'))) {
    const dst = path.join(target, f);
    let need = true;
    try { need = fs.statSync(path.join(WORK, 'audio', f)).size !== fs.statSync(dst).size; } catch { need = true; }
    if (need) { fs.copyFileSync(path.join(WORK, 'audio', f), dst); copied += 1; }
  }
  console.log(`${dir}：同步完成（本次复制 ${copied} 个）`);
  copied = 0;
}
