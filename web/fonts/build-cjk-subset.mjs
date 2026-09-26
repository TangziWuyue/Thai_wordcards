/**
 * 把界面用到的中文字符对应的 Noto Sans SC 子集下载到本地，生成 web/fonts-cjk.css。
 *
 * 为什么这么做：页面里的中文说明文字如果交给系统字体，换一台机器字形就不一样；
 * 中文全量字体动辄好几 MB，所以只取「界面里真正出现过的字」所在的子集。
 *
 * 用法（需要联网）：
 *   node web/fonts/build-cjk-subset.mjs
 *
 * 界面文案改动后重跑一次即可。生成结果要一起提交。
 * 字体授权：SIL OFL 1.1，见同目录 NOTICE.md。
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const FONT_DIR = path.join(WEB, 'fonts');
const OUT_CSS = path.join(WEB, 'fonts-cjk.css');
const SOURCE_FILES = ['index.html', 'app.js', 'rules.js'];
const FAMILY = 'Noto Sans SC';

/** 收集界面里出现的中文字符与中文标点 */
async function collectCodepoints() {
  const set = new Set();
  for (const name of SOURCE_FILES) {
    const text = await fs.readFile(path.join(WEB, name), 'utf8');
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const isCjk =
        (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x3000 && cp <= 0x303f) ||
        (cp >= 0xff00 && cp <= 0xffef);
      if (isCjk) set.add(cp);
    }
  }
  return set;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** 解析 Google Fonts CSS 里的 @font-face 块 */
function parseFaces(css) {
  const faces = [];
  for (const block of css.split('@font-face').slice(1)) {
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (url && range) faces.push({ url, range: range.trim() });
  }
  return faces;
}

function rangeCovers(range, cp) {
  return range.split(',').some((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
    const lo = parseInt(from, 16);
    const hi = to ? parseInt(to, 16) : lo;
    return cp >= lo && cp <= hi;
  });
}

const codepoints = await collectCodepoints();
const css = await fetchText(
  `https://fonts.googleapis.com/css2?family=${FAMILY.replace(/ /g, '+')}:wght@400&display=swap`,
);
const faces = parseFaces(css);

// 只保留覆盖到界面用字的子集
const needed = [];
const covered = new Set();
for (const face of faces) {
  const hits = [...codepoints].filter((cp) => rangeCovers(face.range, cp));
  if (!hits.length) continue;
  hits.forEach((cp) => covered.add(cp));
  needed.push({ ...face, hits: hits.length });
}

const missing = [...codepoints].filter((cp) => !covered.has(cp));
if (missing.length) {
  console.warn('警告：以下字符没有找到子集：', missing.map((c) => String.fromCodePoint(c)).join(''));
}

const rules = [];
for (const face of needed) {
  // 文件名用 unicode-range 的短哈希：文案改动时只有真正变了的子集才会重新写盘，
  // 不会像流水号那样整体错位。
  const hash = crypto.createHash('sha1').update(face.range).digest('hex').slice(0, 8);
  const name = `noto-sans-sc-400-${hash}.woff2`;
  const res = await fetch(face.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0' },
  });
  if (!res.ok) throw new Error(`${face.url} -> HTTP ${res.status}`);
  await fs.writeFile(path.join(FONT_DIR, name), Buffer.from(await res.arrayBuffer()));
  rules.push(`@font-face {
  font-family: "${FAMILY}";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("fonts/${name}") format("woff2");
  unicode-range: ${face.range};
}`);
}

const header = `/* 由 web/fonts/build-cjk-subset.mjs 生成，请勿手改。
   界面中文用到的 ${codepoints.size} 个字，按需切成 ${needed.length} 个子集。
   授权：SIL OFL 1.1，见 fonts/NOTICE.md。 */

`;
await fs.writeFile(OUT_CSS, header + rules.join('\n\n') + '\n');
console.log(`完成：${codepoints.size} 个字符 -> ${needed.length} 个子集`);
