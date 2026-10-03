/**
 * 把两个页面（练习页、教学页）各自打包成「一个 HTML 文件」，方便直接发给别人
 * （微信 / 邮件都行）。
 *
 * 做法：把样式、脚本、字体（woff2 转成 data URI）全部内联进 HTML。
 * 产物不依赖任何外部文件、不依赖服务器、也不依赖系统装了什么字体，
 * 双击打开就能用（file:// 下没有任何跨域请求）。
 *
 * 两个页面之间用相对链接互相跳转，链接目标名随产物目录变化：
 *   dist/ 里是「泰语组合练习.html / 泰语教学.html」（发给别人，中文名好认）
 *   docs/ 里是「index.html / tutorial.html」（GitHub Pages 的地址好看）
 * 打包时会把源码里的 index.html / tutorial.html **整串替换**成目标目录里的实际文件名，
 * 所以页面里的静态链接和 JS 里的跳转（教学页搜到的词会带着 ?word= 跳去练习页）都能对上。
 * 单独发练习页时那个跳转链接点了会说找不到文件，页面本身的功能不受影响。
 *
 * 用法：
 *   node web/build-standalone.mjs
 * 产物：
 *   dist/泰语组合练习.html、dist/泰语教学.html、dist/使用说明.txt（随文件一起发给人看怎么打开）
 *   docs/index.html、docs/tutorial.html、docs/使用说明.txt（GitHub Pages 直接用）
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const WEB = import.meta.dirname;
const ROOT = path.resolve(WEB, '..');
const GUIDE_SRC = path.join(ROOT, 'docs', '使用说明.txt');

/**
 * 写到哪几个目录、文件名怎么对应。
 * names 的 key 是源码里的文件名，value 是这一份产物里的文件名。
 */
const TARGETS = [
  {
    label: 'dist',
    dir: path.join(ROOT, 'dist'),
    names: { 'index.html': '泰语组合练习.html', 'tutorial.html': '泰语教学.html' },
  },
  {
    label: 'docs',
    dir: path.join(ROOT, 'docs'),
    names: { 'index.html': 'index.html', 'tutorial.html': 'tutorial.html' },
    // docs/ 是给 GitHub Pages 部署的那一份，**不内联**：字体、词典、音频都按需加载 +
    // 缓存，首屏从 2.5MB 降到几十 KB（国内网络下差别很大）。内联单文件版留给 dist/。
    external: true,
  },
];

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
    styles: ['fonts.css', 'fonts-cjk.css', 'style.css'],
    scripts: ['rules.js', 'dict.js', 'data/dict.js', 'audio.js', 'data/audio.js', 'data/common.js', 'data/syllable-index.js', 'pagefx.js', 'tour.js', 'seg.js', 'app.js'],
  },
  {
    name: '泰语拼读入门',
    src: 'tutorial.html',
    styles: ['fonts.css', 'fonts-cjk.css', 'style.css', 'tutorial.css'],
    scripts: ['rules.js', 'dict.js', 'data/dict.js', 'tutorial-data.js', 'tutorial-search.js', 'pagefx.js', 'tour.js', 'seg.js', 'tutorial.js'],
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

/** 把源码里的页面名换成这一份产物里的实际文件名（静态 href 和 JS 里的字符串都要换） */
function retargetLinks(html, names) {
  let out = html;
  for (const [from, to] of Object.entries(names)) {
    if (from !== to) out = out.replaceAll(from, to);
  }
  return out;
}

async function buildPage(page, fontCache, target) {
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
  html = retargetLinks(html, target.names);

  // 自检：绝不能残留外部引用，否则发给别人就打不开 / 掉字体
  //   mailto: / tel: 是点开邮件的链接，不会联网取资源，不算外部引用
  //   相对路径的 *.html 是两个页面之间的互跳（练习 ⇄ 教学），也不取资源
  //   （文件名可能是中文，所以不能用 \w 判断）
  const leftovers = [...html.matchAll(/(?:src|href)="(?!data:|#|mailto:|tel:)([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !/^[^/\\:?#]+\.html$/.test(url));
  const problems = [];
  if (leftovers.length) problems.push(`外部引用：${leftovers.join(', ')}`);
  if (/<link rel="stylesheet"/.test(html)) problems.push('仍有未内联的 <link rel="stylesheet">');
  if (/<script src=/.test(html)) problems.push('仍有未内联的 <script src>');
  for (const name of [...page.styles, ...page.scripts]) {
    if (html.includes(`"${name}"`)) problems.push(`残留对 ${name} 的引用`);
  }
  if (problems.length) throw new Error(`${page.src} 打包失败：\n  · ${problems.join('\n  · ')}`);

  const outFile = path.join(target.dir, target.names[page.src]);
  await fs.writeFile(outFile, BANNER(page.name) + html);
  return { outFile, size: Buffer.byteLength(BANNER(page.name) + html), fontCount, fontBytes };
}

const fontCache = new Map();
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

/** 外链版要拷过去的文件（页面 + 样式 + 脚本 + 按需加载的数据） */
const EXTERNAL_FILES = [
  'index.html', 'tutorial.html',
  'fonts.css', 'fonts-cjk.css', 'style.css', 'tutorial.css',
  'rules.js', 'dict.js', 'audio.js', 'pagefx.js', 'tour.js', 'seg.js', 'app.js',
  'tutorial-data.js', 'tutorial-search.js', 'tutorial.js',
  'data/dict.js', 'data/audio.js', 'data/common.js', 'data/syllable-index.js',
];

/**
 * 外链版：把 web/ 里那两个页面真正要用的文件原样摆进产物目录（不内联）。
 * 两个页面在 docs/ 里的文件名和源码一致，所以不用改写链接；`?v=` 源码里已经带着。
 */
async function copyExternal(target) {
  for (const rel of EXTERNAL_FILES) {
    const dst = path.join(target.dir, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(path.join(WEB, rel), dst);
  }
  const fontDir = path.join(WEB, 'fonts');
  await fs.mkdir(path.join(target.dir, 'fonts'), { recursive: true });
  for (const f of await fs.readdir(fontDir)) {
    if (f.endsWith('.woff2')) await fs.copyFile(path.join(fontDir, f), path.join(target.dir, 'fonts', f));
  }
  console.log(`已生成 ${path.relative(ROOT, path.join(target.dir, 'index.html'))} 等外链版（页面 ${EXTERNAL_FILES.length} 个文件 + woff2）`);
}

try {
  for (const target of TARGETS) {
    await fs.mkdir(target.dir, { recursive: true });
    if (target.external) {
      await copyExternal(target);
    } else {
      for (const page of PAGES) {
        const res = await buildPage(page, fontCache, target);
        console.log(`已生成 ${path.relative(ROOT, res.outFile)}（内联字体 ${res.fontCount} 处，产物 ${kb(res.size)}）`);
      }
    }
    // 使用说明跟着产物目录走，发文件时两个一起发过去
    await fs.copyFile(GUIDE_SRC, path.join(target.dir, '使用说明.txt'));
    // 发音音频：跟随产物目录（docs/ 是提交进仓库的部署目录，dist/ 是发人用的）
    const audioSrc = path.join(WEB, 'audio');
    let audioSrcOk = true;
    try { await fs.access(audioSrc); } catch { audioSrcOk = false; }
    if (audioSrcOk) {
      const audioDst = path.join(target.dir, 'audio');
      let same = false;
      try { same = (await fs.realpath(audioSrc)) === (await fs.realpath(audioDst)); } catch { same = false; }
      if (!same) {
        await fs.mkdir(audioDst, { recursive: true });
        const files = (await fs.readdir(audioSrc)).filter((f) => f.endsWith('.mp3'));
        let copied = 0;
        for (const f of files) {
          const s = path.join(audioSrc, f);
          const d = path.join(audioDst, f);
          let need = true;
          try { need = (await fs.stat(s)).size !== (await fs.stat(d)).size; } catch { need = true; }
          if (need) { await fs.copyFile(s, d); copied += 1; }
        }
        if (copied) console.log(`  音频 ${audioDst.startsWith(ROOT) ? path.relative(ROOT, audioDst) : audioDst}：新增/更新 ${copied} 个（共 ${files.length}）`);
      }
    }
  }
  console.log('已生成各目录的 使用说明.txt');
} catch (err) {
  console.error(String(err.message || err));
  process.exitCode = 1;
}
