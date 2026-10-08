// 把生成好的音节音频装进 web/audio/syl/v1/（真实文件，不要用软链接——内置浏览器 /
// WKWebView 在 file:// 下不跟随软链接）。docs/audio/ 与 dist/audio/ 由
// node web/build-standalone.mjs 同步。教学页的字母发音也用这套文件（同一批 syl/v1/），
// 没有单独的 letters 包。
import fs from 'node:fs';
import path from 'node:path';

const TOOLS = import.meta.dirname;
const WEB = path.resolve(TOOLS, '..');
const SRC = path.join(TOOLS, '.work', 'syl-audio');
const LIST = path.join(TOOLS, '.work', 'syl-list.json');
const DST = path.join(WEB, 'audio', 'syl', 'v1');

const items = JSON.parse(fs.readFileSync(LIST, 'utf8'));
fs.mkdirSync(DST, { recursive: true });
let copied = 0;
let keep = 0;
const missing = [];
for (const it of items) {
  const s = path.join(SRC, `${it.key}.mp3`);
  const d = path.join(DST, `${it.key}.mp3`);
  if (!fs.existsSync(s)) {
    missing.push(it.key);
    continue;
  }
  let need = true;
  try { need = fs.statSync(s).size !== fs.statSync(d).size; } catch { need = true; }
  if (need) {
    fs.copyFileSync(s, d);
    copied += 1;
  } else {
    keep += 1;
  }
}
console.log(`音节音频 → web/audio/syl/v1：新增/更新 ${copied}，已存在 ${keep}，共 ${items.length} 条`);
if (missing.length) {
  console.error(`缺少 ${missing.length} 条，先跑 generate-syllables.py：${missing.slice(0, 8).join(' ')}…`);
  process.exit(1);
}
