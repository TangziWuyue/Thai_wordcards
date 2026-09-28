/**
 * 把练习页打包成「一个 HTML 文件」，方便直接发给别人（微信 / 邮件都行）。
 *
 * 做法：把样式、脚本、字体（woff2 转成 data URI）全部内联进 HTML。
 * 产物不依赖任何外部文件、不依赖服务器、也不依赖系统装了什么字体，
 * 双击打开就能用（file:// 下没有任何跨域请求）。
 *
 * 用法：
 *   node web/build-standalone.mjs
 * 产物：
 *   dist/泰语组合练习.html
 *   dist/使用说明.txt（随文件一起发给人看怎么打开）
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const WEB = import.meta.dirname;
const ROOT = path.resolve(WEB, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, '泰语组合练习.html');
const GUIDE_SRC = path.join(ROOT, 'docs', '使用说明.txt');
const GUIDE_OUT = path.join(OUT_DIR, '使用说明.txt');

const read = (name) => fs.readFile(path.join(WEB, name), 'utf8');

/** 把 CSS 里 url("fonts/xxx.woff2") 换成 data URI */
async function inlineFonts(css) {
  const urls = [...new Set([...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1]))];
  let out = css;
  let bytes = 0;
  for (const rel of urls) {
    const buf = await fs.readFile(path.join(WEB, rel));
    bytes += buf.length;
    out = out.replaceAll(
      `url("${rel}")`,
      `url("data:font/woff2;base64,${buf.toString('base64')}")`,
    );
  }
  return { css: out, count: urls.length, bytes };
}

let html = await read('index.html');
const cssParts = await Promise.all(['fonts.css', 'fonts-cjk.css', 'style.css'].map(read));
const { css, count, bytes } = await inlineFonts(cssParts.join('\n'));
// 顺序不能乱：app.js 要用到 ThaiRules 与 ThaiDict；辞典数据整包内联，
// 这样单文件版双击打开（file://）也能查词，不会去请求 data/ 目录
const js = [
  await read('rules.js'),
  await read('dict.js'),
  await read('data/dict.js'),
  await read('app.js'),
].join('\n\n');

// 去掉外链与外部脚本，改为内联
html = html
  .replace(/^\s*<link rel="stylesheet"[^>]*>\s*$/gm, '')
  .replace(/^\s*<script src="[^"]+"><\/script>\s*$/gm, '')
  .replace(
    '</head>',
    `  <style>\n${css}\n  </style>\n</head>`,
  )
  .replace('</body>', `  <script>\n${js}\n  </script>\n</body>`);

// 自检：绝不能残留外部引用，否则发给别人就打不开 / 掉字体
// mailto: / tel: 是点开邮件的链接，不会联网取资源，不算外部引用
const leftovers = [...html.matchAll(/(?:src|href)="(?!data:|#|mailto:|tel:)([^"]+)"/g)].map((m) => m[1]);
const problems = [];
if (leftovers.length) problems.push(`外部引用：${leftovers.join(', ')}`);
if (/<link rel="stylesheet"/.test(html)) problems.push('仍有未内联的 <link rel="stylesheet">');
if (/<script src=/.test(html)) problems.push('仍有未内联的 <script src>');
for (const name of ['rules.js', 'dict.js', 'app.js', 'style.css', 'fonts.css', 'data/dict.js']) {
  if (html.includes(`"${name}"`)) problems.push(`残留对 ${name} 的引用`);
}
if (problems.length) {
  console.error('打包失败，产物不完整：');
  for (const p of problems) console.error(`  · ${p}`);
  process.exitCode = 1;
} else {
  const banner = `<!--
  泰语组合练习（单文件版）
  由 web/build-standalone.mjs 生成于 ${new Date().toISOString()}，请勿手改；
  改源码后重新执行：node web/build-standalone.mjs
  字体：Sarabun / Noto Serif Thai / Noto Sans SC，SIL OFL 1.1，版权见 web/fonts/NOTICE.md
  用法：双击打开即可，不需要联网、不需要安装字体。
-->
`;
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, banner + html);
  // 使用说明一起放到 dist/，发文件时两个一起发过去
  await fs.copyFile(GUIDE_SRC, GUIDE_OUT);
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
  console.log(`已生成 ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`已生成 ${path.relative(ROOT, GUIDE_OUT)}`);
  console.log(`内联 ${count} 个字体文件（${kb(bytes)}），产物大小 ${kb(Buffer.byteLength(banner + html))}`);
}
