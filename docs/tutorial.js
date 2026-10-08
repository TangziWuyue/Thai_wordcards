/**
 * 泰语拼读入门（教学页）
 *
 * 结构照搬 jyutping.io 的教学页：先讲「一个音节由哪几块组成」，
 * 再按分组把辅音、元音、尾辅音、声调一块一块摊开讲。
 *
 * 表里的字形、名称、罗马注音、例词**全部来自 rules.js**，不另抄一份，
 * 这样练习页和教学页永远说同一件事；这里只手写「发音讲解」那一列
 * （SAY_* 三个表）——它是给人看的文字，写错了会误导初学者，改动前先对课本。
 */
(function () {
  'use strict';

  const R = window.ThaiRules;
  const D = window.TutorialData;
  const S = window.TutorialSearch;
  const $ = (id) => document.getElementById(id);

  // 搜索索引：每一行渲染时把自己登记进来，搜索框才有东西可查
  const INDEX = [];
  let currentSection = '';

  // 尾辅音的标签：页面上显示的、登记进搜索索引的必须是同一套说法
  // （课本叫「清尾辅音 / 浊尾辅音」，跟正文一致。以前页面和索引各写各的，
  // 结果搜页面上看得见的词 0 命中）
  const FINAL_TAG = (sonorant) => (sonorant ? '清尾辅音 · 活音节' : '浊尾辅音 · 死音节');

  // ── DOM 小工具 ────────────────────────────────────────────────────
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function thai(tag, className, text) {
    const node = el(tag, className, text);
    node.lang = 'th';
    return node;
  }

  /** 目录点一下「字往下沉」：用点击后跑的动画，不用 :active（触控板轻点只闪一两帧） */
  function sinkTap(node) {
    if (!node || (window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    node.classList.remove('sink');
    void node.offsetWidth;          // 连点同一项也要能重头跑
    node.classList.add('sink');
    setTimeout(() => node.classList.remove('sink'), 300);
  }

  /**
   * 把一行登记进搜索索引。匹配规则本身在 tutorial-search.js 里（纯逻辑、可测）。
   * 手写行（尾辅音那几行）也要走这里，不然搜索会取不到这些字段。
   */
  function register(box, say, info) {
    box.id = `r${INDEX.length + 1}`;
    const entry = S.makeEntry({ ...info, text: say || '' }, currentSection);
    entry.id = box.id;
    entry.el = box;
    INDEX.push(entry);
  }

  /**
   * 一行：左侧字形，右侧「名称 + 注音 + 讲解」。
   * extra 是一整行宽的附加内容（例词 / 字母清单），放在讲解下面。
   * info 是给搜索用的：字形、名称、注音、标签、例词、这一节的标题。
   * 每一行都会拿到一个稳定的 id，搜索跳过来就靠它。
   */
  function row(glyphNodes, nameNodes, say, extra, info) {
    const box = el('div', 'trow');
    const g = el('div', 't-glyph');
    for (const node of glyphNodes) g.append(node);
    const meta = el('div', 't-meta');
    for (const node of nameNodes) meta.append(node);
    // 带标签的行（借词用字 / 已废弃）本来就挤在换行边缘：衬线体比标准体宽一点，
    // 「ณ เณร 小沙弥 n 借词用字」这一行就会从 1 行变成 2 行，整页跟着往下挪 12px。
    // 给它预留两行高度，两种字体下都一样高（用户报过「改字体导致页面位移」）
    if (meta.querySelector('.t-tag')) meta.classList.add('has-tag');
    box.append(g, meta, el('p', 't-say', say));
    if (extra) box.append(extra);
    if (info) register(box, say, info);
    return box;
  }

  /** 例词行：泰文部分用泰文字体，罗马注音用等宽一点的字形 */
  function exampleLine(text) {
    const box = el('div', 't-ex');
    const [word, rest] = String(text).split(' = ');
    box.append(thai('span', 't-ex-word', word));
    if (rest) box.append(el('span', '', ` = ${rest}`));
    return box;
  }

  /** 例词行（结构化的那种）：泰文 + 罗马注音 + 中文，可选一句补充 */
  function exampleItem(ex) {
    const box = el('div', 't-ex');
    box.append(thai('span', 't-ex-word', ex.word), el('span', 't-ex-roman', ex.roman),
      el('span', '', ` ${ex.gloss}`));
    if (ex.note) box.append(el('span', 't-ex-note', ex.note));
    return box;
  }

  /** 元音的字形：用 อ 当底座写出来（课本里 เ-าะ 就读成 เอาะ） */
  function vowelGlyph(v) {
    const form = `${v.lead || ''}${v.follow || ''}${v.tail || ''}`;
    if (!form) return [el('span', 't-none', '无')];
    // ฤ ฤๅ ฦ ฦๅ 自己就是元音本身，不加底座
    if (v.canBeOnset) return [thai('span', '', form)];
    const nodes = [];
    if (v.lead) nodes.push(thai('span', '', v.lead));
    nodes.push(thai('span', 't-carrier', 'อ'));
    if (v.follow) nodes.push(thai('span', '', v.follow));
    if (v.tail) nodes.push(thai('span', '', v.tail));
    return nodes;
  }

  const roman = (text, extra) => {
    const span = el('span', 't-roman' + (extra ? ` ${extra}` : ''), text);
    return span;
  };

  const tag = (text) => el('span', 't-tag', text);

  // ── 字母发音（一行一个「听发音」按钮）─────────────────────────────
  // 用固定模式同一套音节音频 syl/v1/{key}.mp3（做过声调曲线校正）。
  // 为什么不用自然合成：TTS 的自然读法句尾会往下滑（用户明确说不要下滑），
  // 校正版按字母本身的调走（中/低辅音名读第 1 调、高辅音名读第 5 调），不滑。
  // 辅音读字母名（กอ），元音读「อ + 元音」的样子；拼写变体本身拼不出完整音节，
  // 按讲解里的同音写法读（见 tutorial-data.js 的 VOWEL_SAY）。
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function speakerIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('aria-hidden', 'true');
    const body = document.createElementNS(SVG_NS, 'path');
    body.setAttribute('d', 'M4 9.5v5h3.5L12 18V6L7.5 9.5H4z');
    body.setAttribute('fill', 'currentColor');
    const wave = document.createElementNS(SVG_NS, 'path');
    wave.setAttribute('d', 'M15.5 9a4.2 4.2 0 0 1 0 6');
    wave.setAttribute('fill', 'none');
    wave.setAttribute('stroke', 'currentColor');
    wave.setAttribute('stroke-width', '1.8');
    wave.setAttribute('stroke-linecap', 'round');
    svg.append(body, wave);
    return svg;
  }

  /** 教学页字母音频的路径（和固定模式同一个文件，见上面的说明） */
  function letterFile(parts) {
    return parts ? R.soundFile(parts) : null;
  }

  function soundButton(parts, label) {
    const file = letterFile(parts);
    const btn = el('button', 't-sound');
    btn.type = 'button';
    btn.append(speakerIcon());
    btn.title = file ? `播放发音：${label}` : '这个音没有内置发音';
    btn.setAttribute('aria-label', btn.title);
    if (!file) {
      btn.disabled = true;
      return btn;
    }
    btn.addEventListener('click', () => {
      sinkTap(btn);
      const A = window.ThaiAudio;
      if (!A) return;
      A.playUrl(A.fileUrl(file)).catch(() => {
        btn.title = '音频没加载出来（audio 文件夹要和页面放在一起）';
      });
    });
    return btn;
  }

  function groupBox(thaiTitle, zhTitle, count) {
    const head = el('div', 'tut-group');
    head.append(thai('b', '', thaiTitle), el('span', '', `${zhTitle} ${count} 个`));
    return head;
  }

  function appendAll(parent, children) {
    for (const child of children) parent.append(child);
  }

  // ── 一、辅音 ──────────────────────────────────────────────────────
  function renderConsonants() {
    const host = $('consTable');
    currentSection = '辅音';
    for (const cls of ['mid', 'high', 'low']) {
      const list = R.CONSONANTS.filter((c) => c.cls === cls);
      host.append(groupBox(R.CLASS_THAI[cls], R.CLASS_LABEL[cls], list.length));
      const rows = el('div', 'tut-rows');
      for (const c of list) {
        const meta = [
          soundButton(R.fixedParts({ onset: c.ch, strict: true }), `${c.ch}อ`),
          thai('span', 't-name', `${c.ch}อ ${c.example}`),
        ];
        if (c.gloss) meta.push(el('span', 't-gloss', c.gloss));
        meta.push(roman(c.roman || '—'));
        if (c.rare) meta.push(tag('借词用字'));
        if (c.obsolete) meta.push(tag('已废弃'));
        rows.append(row([thai('span', '', c.ch)], meta, D.SAY_CONS[c.ch], null, {
          glyph: c.ch,
          name: `${c.ch}อ ${c.example}`,
            roman: c.roman || '',
          tags: [R.CLASS_LABEL[c.cls], c.rare ? '借词用字' : '', c.obsolete ? '已废弃' : ''].filter(Boolean),
          extra: `${c.example} ${c.gloss || ''}`,
        }));
      }
      host.append(rows);
    }
  }

  // ── 二、元音 ──────────────────────────────────────────────────────
  function renderVowels() {
    const host = $('vowelTable');
    currentSection = '元音';
    for (const group of R.VOWEL_GROUPS) {
      const list = R.VOWELS.filter((v) => v.group === group.id);
      if (!list.length) continue;
      host.append(groupBox(group.thai, group.label, list.length));
      const rows = el('div', 'tut-rows vowels');
      for (const v of list) {
        const form = `${v.lead || ''}${v.follow || ''}${v.tail || ''}`;
        // 顺序按「念得出来」排：泰文名称 → 罗马注音 → 长短/限制 → 英文名称
        const meta = [
          soundButton(R.fixedParts({ vowelId: D.VOWEL_SAY[v.id] || v.id, strict: true }), v.name),
          thai('span', 't-name', v.name),
          roman(v.roman),
        ];
        // 超额元音里的 ฤ ฦ 系列按课本不算长短音，只标「自带声母」
        if (group.id !== 'extra') meta.push(tag(v.short ? '短音' : '长音'));
        if (v.canBeOnset) meta.push(tag('自带声母'));
        if (v.requiresFinal) meta.push(tag('必须有尾音'));
        if (v.noTone) meta.push(tag('不写声调'));
        meta.push(el('span', 't-gloss', v.en));
        rows.append(row(vowelGlyph(v), meta, D.SAY_VOWEL[v.id] || '',
          v.example ? exampleLine(v.example) : null, {
            glyph: form || '无',
            name: v.name,
            roman: v.roman,
            tags: [group.label, v.short ? '短音' : '长音', v.noTone ? '不写声调' : '',
              v.requiresFinal ? '必须有尾音' : ''].filter(Boolean),
            extra: v.example || '',
          }));
      }
      host.append(rows);
    }
  }

  // ── 三、尾辅音 ────────────────────────────────────────────────────
  function renderFinals() {
    const host = $('finalTable');
    currentSection = '尾辅音';
    const rows = el('div', 'tut-rows finals');
    // 每种读音一行：左边是它读什么，右边列「哪些字母落在这一组」
    for (const sound of ['k', 't', 'p', 'n', 'ng', 'm', 'y', 'w']) {
      const chars = R.FINAL_GROUPS[sound];
      const meta = [el('span', 't-gloss', `${chars.length} 个字母`),
        tag(FINAL_TAG(R.FINALS[chars[0]].sonorant))];
      const box = el('div', 'trow');
      const g = el('div', 't-glyph');
      g.append(roman(`-${sound}`, 't-final-roman'));
      const meta2 = el('div', 't-meta');
      for (const node of meta) meta2.append(node);
      box.append(g, meta2, el('p', 't-say', D.SAY_FINAL[sound]));
      const letters = el('div', 't-letters');
      letters.append(thai('span', '', chars.join(' ')));
      box.append(letters, exampleItem(D.FINAL_EXAMPLES[sound]));
      register(box, D.SAY_FINAL[sound] || '', {
        glyph: `-${sound}`,
        name: `尾音 -${sound}`,
        roman: `-${sound}`,
        tags: [FINAL_TAG(R.FINALS[chars[0]].sonorant)],
        extra: `${chars.join(' ')} ${D.FINAL_EXAMPLES[sound].word} ${D.FINAL_EXAMPLES[sound].gloss}`,
      });
      rows.append(box);
    }
    host.append(rows);

    // 哪些字母不能当尾音，直接从尾辅音表倒推，不另抄名单
    const cannot = R.CONSONANTS.filter((c) => !R.FINALS[c.ch]).map((c) => c.ch);
    const note = $('finalCannot');
    note.append(thai('span', '', cannot.join(' ')),
      el('span', '', ` 这 ${cannot.length} 个字母不能当尾辅音。`));
  }


  // ── 四、声调 ──────────────────────────────────────────────────────
  function renderTones() {
    const host = $('toneTable');
    currentSection = '声调';
    // 类名别用 .tones —— 那是练习页「声调按钮」的网格样式，套上来会把这五张行排成五列
    const rows = el('div', 'tut-rows tonelist');
    for (const n of [1, 2, 3, 4, 5]) {
      const t = R.SPOKEN_TONES[n];
      const meta = [el('span', 't-name', `${n} · ${t.zh}`), thai('span', 't-gloss', t.thai)];
      // 声调符号单独放会飘成一条横杠，垫一个 อ 它才落在正常位置（跟练习页一个道理）
      const glyph = n === 1 ? el('span', 't-none', '—') : thai('span', '', `อ${D.TONE_SIGN[n]}`);
      rows.append(row([glyph], meta, D.TONE_HOW[n],
        exampleItem(D.TONE_EXAMPLE[n]), {
          glyph: n === 1 ? '—' : `อ${D.TONE_SIGN[n]}`,
          name: `第 ${n} 调 · ${t.zh}`,
          roman: t.thai,
          tags: [`第 ${n} 调`],
          extra: `${D.TONE_EXAMPLE[n].word} ${D.TONE_EXAMPLE[n].roman} ${D.TONE_EXAMPLE[n].gloss}`,
        }));
    }
    host.append(rows);

    // 规则表：读第几调 = 辅音类别 × 有没有写符号 × 音节死活
    const table = $('toneRules');
    const head = el('div', 'trule head');
    head.append(el('div', 'trule-cls', '辅音类别'));
    for (const col of D.TONE_COLS) head.append(el('div', '', col));
    table.append(head);
    for (const rule of D.TONE_RULES) {
      const line = el('div', 'trule');
      line.append(el('div', 'trule-cls', rule.label));
      for (const cell of rule.cells) {
        const box = el('div', 'trule-cell');
        for (const item of cell) {
          const one = el('span', 'trule-one');
          one.append(el('b', '', item.n ? `第 ${item.n} 调` : '用不了'));
          if (item.note) one.append(el('i', '', item.note));
          box.append(one);
        }
        line.append(box);
      }
      table.append(line);
    }
  }

  // ── 开头的「一个音节由哪几块组成」────────────────────────────────
  // 例子不手抄，直接让规则引擎拼一遍，保证跟练习页完全一致
  function renderAnatomy() {
    const host = $('anatomy');
    for (const spec of D.ANATOMY) {
      const parts = { ...R.fixedParts({ onset: spec.onset, vowelId: spec.vowelId }), ...spec.patch };
      const word = R.assemble(parts);
      const box = el('div', 'trow');
      const g = el('div', 't-glyph big');
      g.append(thai('span', '', word));
      const say = el('p', 't-say');
      say.append(el('span', 't-name', R.romanize(parts) || '—'));
      for (const piece of spec.pieces) {
        say.append(el('span', 't-piece', piece));
      }
      box.append(g, say);
      host.append(box);
    }
  }


  // ── 字体 / 外观：跟练习页共用一份设置 ───────────────────────────────
  // 存在同一个 localStorage 里，所以在教学页改了字体，回练习页也是这个字体
  const STORE_KEY = 'thai-wordcards.v3';
  const FONTS = [{ id: 'sarabun', label: '标准体' }, { id: 'serif', label: '印刷衬线' }];
  const THEMES = [{ id: 'auto', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }];

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function writePrefs(patch) {
    try {
      const data = readPrefs();
      Object.assign(data, patch);
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch { /* 无痕模式等场景下忽略 */ }
  }

  function applyPrefs(data) {
    const font = FONTS.some((f) => f.id === data.font) ? data.font : 'sarabun';
    const theme = THEMES.some((t) => t.id === data.theme) ? data.theme : 'auto';
    document.documentElement.dataset.font = font;
    document.documentElement.dataset.theme = theme;
    return { font, theme };
  }

  // 分段控件（含滑块与按压反馈）在 web/seg.js 里，练习页共用同一份。
  // 选完之后**只改选中态、不重建按钮**：重建的话滑块只能瞬移，还会闪一下。
  let segsBuilt = false;
  function renderSettings() {
    const prefs = applyPrefs(readPrefs());
    const fontHost = $('fontSeg');
    const themeHost = $('themeSeg');
    if (!segsBuilt) {
      segsBuilt = true;
      Seg.build(fontHost, FONTS, prefs.font, (id) => {
        // 手机上换字体会让整页重新排版，锚住这一排控件，页面就不会跳一下
        Seg.keepAnchored(fontHost, () => {
          writePrefs({ font: id });
          applyPrefs(readPrefs());
          Seg.select(fontHost, id);
        });
        Seg.pulse(fontHost, id);
      });
      Seg.build(themeHost, THEMES, prefs.theme, (id) => {
        Seg.keepAnchored(themeHost, () => {
          writePrefs({ theme: id });
          applyPrefs(readPrefs());
          Seg.select(themeHost, id);
        });
        Seg.pulse(themeHost, id);
      });
      return;
    }
    Seg.select(fontHost, prefs.font);
    Seg.select(themeHost, prefs.theme);
  }

  // ── 目录锚点：滚动时高亮当前这一节 ─────────────────────────────────
  let tocLinks = [];
  let tocThumb = null;
  // 点目录跳章节期间先锁住高亮，滚动停下再解开（否则会一节一节扫过去）
  let tocLocked = false;

  /**
   * 平滑滚动停下之后再跑 fn。
   * 优先用 scrollend（Chrome / 新版 Safari），不支持的就自己盯着滚动位置，
   * 连续两次没动就算停了——固定 700ms 的兜底太短，从概览跳到「声调」要滚好几千像素。
   */
  function afterScroll(fn) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', finish);
      fn();
    };
    if ('onscrollend' in window) window.addEventListener('scrollend', finish, { once: true });
    let last = window.scrollY;
    let still = 0;
    let ticks = 0;
    const tick = () => {
      if (done) return;
      const y = window.scrollY;
      still = Math.abs(y - last) < 1 ? still + 1 : 0;
      last = y;
      ticks += 1;
      if (still >= 2 || ticks >= 30) {
        finish();
        return;
      }
      setTimeout(tick, 100);
    };
    setTimeout(tick, 120);
  }

  /**
   * 跳到某一节：靠 html { scroll-behavior: smooth } 平滑滚过去，到了再把标题点亮一下。
   * 关键是**点击时先在原位置把标题藏起来**——只加「落进来」的动画的话，
   * 标题会先按正常样子露一帧、再跳回透明从头淡入，看着像闪了一下。
   */
  function arriveAt(sec) {
    const heading = sec.querySelector('h2');
    // 高亮立刻跟到目标那一节，并锁住观察器到滚动停下——中间那几节不再依次亮一遍
    tocLocked = true;
    setTocCurrent(sec.id);
    if (!heading || !window.matchMedia
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 上一次点的那一节要是还没露出来，先放出来，别留下一个永远隐身的标题
    for (const other of document.querySelectorAll('.tut-sec > h2.arrive-hidden')) {
      other.classList.remove('arrive-hidden');
    }
    heading.classList.add('arrive-hidden');
    afterScroll(() => {
      tocLocked = false;
      heading.classList.remove('arrive');
      void heading.offsetWidth;   // 连点同一节时让动画能从头跑
      heading.classList.add('arrive');
      heading.classList.remove('arrive-hidden');   // 交给动画接管
      setTimeout(() => heading.classList.remove('arrive'), 900);
    });
  }

  function buildToc() {
    const host = $('toc');
    const secs = [...document.querySelectorAll('.tut-sec')];
    // 高亮滑块：跟分段控件一个思路，只动 transform，不碰布局
    tocThumb = el('span', 'toc-thumb');
    tocThumb.setAttribute('aria-hidden', 'true');
    host.append(tocThumb);
    for (const sec of secs) {
      const link = el('a', 'toc-link', sec.dataset.title);
      link.href = `#${sec.id}`;
      // 不拦默认行为：让浏览器带着 scroll-margin-top 平滑滚过去（CSS 里开了 smooth）
      link.addEventListener('click', () => {
        sinkTap(link);
        arriveAt(sec);
      });
      host.append(link);
    }
    tocLinks = [...host.querySelectorAll('.toc-link')];
    setTocCurrent(secs[0].id, false);
    window.addEventListener('resize', () => {
      if (tocLocked) paintToc(false);
      else setTocCurrent(activeSection().id, false);
    });
    if (!('IntersectionObserver' in window)) return;
    // 判定交给 activeSection() 现算，观察器只负责「有变化时叫一声」。
    // 早先是「谁出现在判定区里就把高亮给谁」，往上滚的时候，上面那一节会**新**进入
    // 判定区（要上报），而目标那一节位置没变（不上报），于是高亮被带回上面那一节——
    // 就是用户说的「从右往左点会多跳一格」。
    const io = new IntersectionObserver(() => {
      // 点目录跳章节期间先锁住：从概览跳到声调要滚过四节，
      // 不锁的话高亮会「元音 → 尾辅音 → 声调」一路扫过去
      if (tocLocked) return;
      setTocCurrent(activeSection().id);
    }, { rootMargin: '0px 0px -1px 0px' });
    for (const sec of secs) io.observe(sec);
  }

  // 比 CSS 里的 scroll-margin-top（130px）大一点：跳过去之后目标那一节的顶边正好
  // 落在 130，算「已经越线」，高亮才会停在目标上而不是退回去一节。
  const TOC_LINE = 132;

  /** 现在该高亮哪一节：顶边越过吸顶栏的最后一节（页面滚到底就取最后一节） */
  function activeSection() {
    const secs = [...document.querySelectorAll('.tut-sec')];
    const scrolledToEnd = window.scrollY + window.innerHeight
      >= document.documentElement.scrollHeight - 2;
    if (scrolledToEnd) return secs[secs.length - 1];
    let best = secs[0];
    for (const sec of secs) {
      if (sec.getBoundingClientRect().top <= TOC_LINE) best = sec;
      else break;
    }
    return best;
  }

  /** 把高亮挪到某一节；animate=false 用于首次渲染（别让它从左上角飞过来） */
  function setTocCurrent(id, animate = true) {
    for (const link of tocLinks) {
      if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    paintToc(animate);
  }

  function paintToc(animate) {
    const host = $('toc');
    if (!host || !tocThumb) return;
    const link = tocLinks.find((a) => a.getAttribute('aria-current') === 'true');
    if (!link) {
      tocThumb.style.opacity = '0';
      return;
    }
    const c = host.getBoundingClientRect();
    const b = link.getBoundingClientRect();
    if (!animate) tocThumb.style.transition = 'none';
    tocThumb.style.width = `${b.width}px`;
    tocThumb.style.height = `${b.height}px`;
    tocThumb.style.transform = `translate(${b.left - c.left}px, ${b.top - c.top}px)`;
    tocThumb.style.opacity = '1';
    if (!animate) {
      void tocThumb.offsetWidth;
      tocThumb.style.transition = '';
    }
  }

  // ── 搜索：输入字母 / 注音 / 中文都能查，选中就跳过去并高亮 ──────────
  const search = { input: null, list: null, clear: null, nodes: [], active: -1 };

  // 练习页的文件名。发布单文件版时打包脚本会把它替换成实际文件名
  const PRACTICE_PAGE = 'index.html';
  const dict = window.ThaiDict;
  const DICT_ROWS = 5;
  const dictState = { ready: false, failed: false, loading: false };
  const hasThaiText = (t) => /[\u0E00-\u0E7F]/.test(t);
  const hasCJKText = (t) => /[\u3400-\u9fff]/.test(t);
  /** 够长的拉丁串才拿去反查释义（打 k / kh / ai 只查字母和注音，不然一捞一大把） */
  const isGlossWord = (t) => /^[a-zA-Z]{4,}$/.test(t.trim());

  const findMatches = (query) => S.findMatches(INDEX, query);

  /**
   * 词库是按需联网加载的（1.6MB），教学页平时不碰它；
   * 只有当搜索框里打进泰文时才顺手取回来，取完再画一次结果。
   */
  function ensureDict() {
    if (!dict || dictState.ready || dictState.loading || dictState.failed) return;
    dictState.loading = true;
    dict.loadWords().then(() => {
      dictState.ready = true;
      dictState.loading = false;
      if (search.input.value.trim()) renderResults();
    }).catch(() => {
      // 取不到就当没有查词功能，字母/元音搜索不受影响
      dictState.failed = true;
      dictState.loading = false;
    });
  }

  /** 点辞典里的词：带着它跳到练习页，卡片上就是这个词（带注音和释义） */
  function openWord(word) {
    const url = `${PRACTICE_PAGE}?word=${encodeURIComponent(word)}`;
    // 走 pagefx：先把这一页淡出再跳，跟页脚那些链接一个处理
    if (window.PageFX) window.PageFX.goTo(url);
    else location.href = url;
  }

  function closeResults() {
    search.list.hidden = true;
    search.active = -1;
    search.input.setAttribute('aria-expanded', 'false');
  }

  function paintActive() {
    // 只看可选中的那些 li —— 顶部那条「讲解里提到」的说明不算一格
    search.nodes.forEach((li, i) => {
      li.classList.toggle('active', i === search.active);
      if (i === search.active) li.scrollIntoView({ block: 'nearest' });
    });
    const active = search.nodes[search.active];
    search.input.setAttribute('aria-activedescendant', active ? active.id : '');
  }

  /** 跳到某一行并闪一下，让人看清落在哪 */
  function jumpTo(item) {
    closeResults();
    for (const other of INDEX) other.el.classList.remove('hit');
    item.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // 先读一次布局，同一个目标连点两次也能重新亮
    void item.el.offsetWidth;
    item.el.classList.add('hit');
    setTimeout(() => item.el.classList.remove('hit'), 2400);
  }

  function renderResults() {
    const query = search.input.value;
    search.clear.hidden = !query;
    const found = findMatches(query);
    const q = query.trim();
    // 查词：泰文查拼写，中文（和够长的英文）查释义；
    // 短的拉丁串（k / kh / ai）不查词典——那是注音，一查能捞出一堆含它的释义
    const wantDict = hasThaiText(q) || hasCJKText(q) || isGlossWord(q);
    const words = dictState.ready && wantDict ? dict.search(q, DICT_ROWS) : [];
    if (wantDict) ensureDict();
    search.nodes = [];
    search.active = -1;
    let seq = 0;
    while (search.list.firstChild) search.list.firstChild.remove();
    if (!q) {
      closeResults();
      return;
    }
    search.input.setAttribute('aria-expanded', 'true');
    if (!found.list.length && !words.length) {
      // 词库还在下载时别说「没找到」，免得刚好卡在这个瞬间的人以为查不到
      const loading = wantDict && !dictState.ready && !dictState.failed;
      const empty = el('li', 'res empty', loading
        ? '正在查词库…'
        : '没找到，换个写法试试（可以搜泰文字母、罗马注音、中文意思）');
      empty.setAttribute('aria-disabled', 'true');
      search.list.append(empty);
      search.list.hidden = false;
      return;
    }
    // 退到「例词和讲解里提到」时说明一句，免得用户以为搜错了。
    // 一条都没命中时别加这句——那时候下面只有辞典结果（或空提示），加在这里反而费解
    if (found.list.length && found.tier === 'loose') {
      const note = el('li', 'res note', '字形和名称里没有，下面是例词或讲解里提到的');
      note.setAttribute('aria-disabled', 'true');
      search.list.append(note);
    }
    found.list.forEach((item) => {
      const li = el('li', 'res');
      li.id = `res${seq++}`;
      li.setAttribute('role', 'option');
      li.append(thai('span', 'res-glyph', item.glyph));
      const main = el('span', 'res-main');
      main.append(el('b', '', item.name));
      if (item.roman) main.append(el('span', 'res-roman', item.roman));
      if (item.tags.length) main.append(el('span', 'res-sec', item.tags[0]));
      li.append(main, el('span', 'res-snippet', item.text));
      li._go = () => jumpTo(item);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); li._go(); });
      search.list.append(li);
      search.nodes.push(li);
    });

    // 辞典：打的是泰文时顺带把词库里的词列出来，点一个去练习页看它的卡片
    if (words.length) {
      const head = el('li', 'res group', '辞典 · 点一个词去练习页看卡片');
      head.setAttribute('aria-disabled', 'true');
      search.list.append(head);
      for (const entry of words) {
        const li = el('li', 'res word');
        li.id = `res${seq++}`;
        li.setAttribute('role', 'option');
        li.append(thai('span', 'res-glyph', entry[0]));
        const main = el('span', 'res-main');
        if (entry[1]) main.append(el('span', 'res-roman', entry[1]));
        if (entry[4]) main.append(el('span', 'res-sec', '常用'));
        if (!entry[2] && entry[5]) main.append(el('span', 'res-sec', '英文'));
        li.append(main, el('span', 'res-snippet', entry[2] || entry[5] || '无释义'));
        li._go = () => openWord(entry[0]);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); li._go(); });
        search.list.append(li);
        search.nodes.push(li);
      }
    }
    search.list.hidden = false;
  }

  function buildSearch() {
    search.input = $('tutSearch');
    search.list = $('tutResults');
    search.clear = $('tutSearchClear');
    if (!search.input) return;

    search.input.addEventListener('input', renderResults);
    search.input.addEventListener('focus', () => { if (search.input.value.trim()) renderResults(); });
    search.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (search.list.hidden) renderResults();
        if (!search.nodes.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        search.active = (search.active + step + search.nodes.length) % search.nodes.length;
        paintActive();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        // 选中的可能是「字母/元音」行，也可能是「辞典」里的词，各走各的动作
        const node = search.nodes[search.active >= 0 ? search.active : 0];
        if (node && node._go) node._go();
        return;
      }
      if (e.key === 'Escape') {
        search.input.value = '';
        search.clear.hidden = true;
        closeResults();
        search.input.blur();
      }
    });
    search.clear.addEventListener('click', () => {
      search.input.value = '';
      search.clear.hidden = true;
      closeResults();
      search.input.focus();
    });
    // 点到别处就收起下拉
    document.addEventListener('click', (e) => {
      if (!search.input.contains(e.target) && !search.list.contains(e.target)) closeResults();
    });
    // 按 / 直接跳到搜索框（跟很多文档站一个习惯）
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      search.input.focus();
    });
    // 允许用 ?q=xxx 打开就带着搜索结果（方便把某个音的链接发给别人）
    const seed = new URLSearchParams(location.search).get('q');
    if (seed) {
      search.input.value = seed;
      renderResults();
    }

  }

  function main() {
    renderAnatomy();
    renderConsonants();
    renderVowels();
    renderFinals();
    renderTones();
    renderSettings();
    buildSearch();
    buildToc();
    buildTour();
    // 跳到练习页时先淡出一下，别硬切（pagefx.js，两边共用）
    if (window.PageFX) window.PageFX.setup();
  }

  // ── 新手引导 ────────────────────────────────────────────────────────
  // 引导本体在 web/tour.js（练习页共用同一份），这里只写「教学页要讲哪几步」。
  // 存储键跟练习页分开：两页各看各的引导，互不影响。
  const TOUR_KEY = 'thai-wordcards.tutTourDone';
  const TOUR_STEPS = [
    {
      sel: '.tut-search',
      title: '搜一搜',
      text: '字母、注音、中文都能搜，按 / 也能唤起；搜一个词会直接给出辞典结果。',
    },
    {
      sel: '.toc',
      title: '目录',
      text: '点一节跳过去，滚到哪儿它会跟着亮。',
    },
    {
      sel: '#consTable .trow',
      title: '一行一个字母',
      text: '左边是字形，右边是名称、注音和发音讲解——舌头怎么摆、像哪个汉语拼音；'
        + '每一行的小喇叭都能点开听这个字母的发音。',
    },
    {
      sel: '.foot',
      title: '字体与外观',
      text: '标准体 / 印刷衬线、深浅色都在这里；回练习页的入口也在下面。',
    },
  ];

  function buildTour() {
    if (!window.Tour) return;
    const tour = window.Tour.create({ steps: TOUR_STEPS, storageKey: TOUR_KEY });
    const btn = $('tutTourBtn');
    if (btn) btn.addEventListener('click', () => tour.start());
    // 第一次进教学页自动走一遍，之后可以在页脚点「新手引导」重看
    tour.maybeAutoStart(600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
