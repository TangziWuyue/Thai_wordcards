/**
 * 把两个页面（练习页、教学页）各自打包成「一个 HTML 文件」，方便直接发给别人
 * （微信 / 邮件都行）。
 *
 * 做法：把样式、脚本、字体（woff2 转成 data URI）全部内联进 HTML。
 * 产物不依赖任何外部文件、不依赖服务器、也不依赖系统装了什么字体，
 * 双击打开就能用（file:// 下没有任何跨域请求）。
 *
 * 两个产物之间用相对链接互相跳转（index.html ↔ tutorial.html），
 * 所以发的时候要么两个一起发，要么单独发练习页——单独发时那个链接点了会说找不到文件，
 * 页面本身的功能不受影响。
 *
 * 用法：
 *   node web/build-standalone.mjs
 * 产物：
 *   dist/泰语组合练习.html
 *   dist/泰语教学.html
 *   dist/使用说明.txt（随文件一起发给人看怎么打开）
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const WEB = import.meta.dirname;
const ROOT = path.resolve(WEB, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const GUIDE_SRC = path.join(ROOT, 'docs', '使用说明.txt');
const GUIDE_OUT = path.join(OUT_DIR, '使用说明.txt');

const BANNER = (name) => `<!--
  ${name}（单文件版）
  由 web/build-standalone.mjs 生成于 ${new Date().toISOString()}，请勿手改；
  改源码后重新执行：node web/build-standalone.mjs
  字体：Sarabun / Noto Serif Thai / Noto Sans SC，SIL OFL 1.1，版权见 web/fonts/NOTICE.md
  用法：双击打开即可，不需要联网、不需要安装字体。
-->
`;

/**
 * 两个页面各自要内联哪些文件。
 * 脚本顺序不能乱：练习页的 app.js 要用到 ThaiRules 与 ThaiDict，
 * 辞典数据整包内联后，单文件版双击打开（file://）也能查词，不会去请求 data/ 目录。
 */
const PAGES = [
  {
    name: '泰语组合练习',
    src: 'index.html',
    out: '泰语组合练习.html',
    styles: ['fonts.css', 'fonts-cjk.css', 'style.css'],
    scripts: ['rules.js', 'dict.js', 'data/dict.js', 'app.js'],
  },
  {
    name: '泰语拼读入门',
    src: 'tutorial.html',
    out: '泰语教学.html',
    styles: ['fonts.css', 'fonts-cjk.css', 'style.css', 'tutorial.css'],
    scripts: ['rules.js', 'tutorial-data.js', 'tutorial.js'],
  },
];

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

async function buildPage(page, fontCache) {
  const styles = [];
  let fontCount = 0;
  let fontBytes = 0;
  for (const name of page.styles) {
    let done = fontCache.get(name);
    if (!done) {
      done = await inlineFonts(await read(name));
      fontCache.set(name, done);
    }
    styles.push(done.css);
    fontCount += done.count;
    fontBytes += done.bytes;
  }
  const js = [];
  for (const name of page.scripts) js.push(await read(name));

  let html = await read(page.src);
  // 去掉外链与外部脚本，改为内联
  html = html
    .replace(/^\s*<link rel="stylesheet"[^>]*>\s*$/gm, '')
    .replace(/^\s*<script src="[^"]+"><\/script>\s*$/gm, '')
    .replace('</head>', `  <style>\n${styles.join('\n')}\n  </style>\n</head>`)
    .replace('</body>', `  <script>\n${js.join('\n\n')}\n  </script>\n</body>`);

  // 自检：绝不能残留外部引用，否则发给别人就打不开 / 掉字体
  //   mailto: / tel: 是点开邮件的链接，不会联网取资源，不算外部引用
  //   *.html 是两个单文件版之间的互跳（练习 ⇄ 教学），也不取资源
  const leftovers = [...html.matchAll(/(?:src|href)="(?!data:|#|mailto:|tel:)([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !/^[\w.-]+\.html$/.test(url));
  const problems = [];
  if (leftovers.length) problems.push(`外部引用：${leftovers.join(', ')}`);
  if (/<link rel="stylesheet"/.test(html)) problems.push('仍有未内联的 <link rel="stylesheet">');
  if (/<script src=/.test(html)) problems.push('仍有未内联的 <script src>');
  for (const name of [...page.styles, ...page.scripts, page.src]) {
    if (html.includes(`"${name}"`)) problems.push(`残留对 ${name} 的引用`);
  }
  if (problems.length) throw new Error(`${page.src} 打包失败：\n  · ${problems.join('\n  · ')}`);

  const outFile = path.join(OUT_DIR, page.out);
  await fs.writeFile(outFile, BANNER(page.name) + html);
  return { outFile, size: Buffer.byteLength(BANNER(page.name) + html), fontCount, fontBytes };
}

await fs.mkdir(OUT_DIR, { recursive: true });
const fontCache = new Map();
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
try {
  for (const page of PAGES) {
    const res = await buildPage(page, fontCache);
    console.log(`已生成 ${path.relative(ROOT, res.outFile)}`);
    console.log(`  内联字体 ${res.fontCount} 处（${kb(res.fontBytes)}），产物大小 ${kb(res.size)}`);
  }
  // 使用说明一起放到 dist/，发文件时两个一起发过去
  await fs.copyFile(GUIDE_SRC, GUIDE_OUT);
  console.log(`已生成 ${path.relative(ROOT, GUIDE_OUT)}`);
} catch (err) {
  console.error(String(err.message || err));
  process.exitCode = 1;
}
