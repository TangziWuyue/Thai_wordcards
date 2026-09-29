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
      host.append(groupBox(cls === 'mid' ? 'อักษรกลาง' : cls === 'high' ? 'อักษรสูง' : 'อักษรต่ำ',
        R.CLASS_LABEL[cls], list.length));
      const rows = el('div', 'tut-rows');
      for (const c of list) {
        const meta = [thai('span', 't-name', `${c.ch}อ ${c.example}`)];
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
        const meta = [thai('span', 't-name', v.name), roman(v.roman)];
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
        tag(R.FINALS[chars[0]].sonorant ? '响音尾 · 活音节' : '塞音尾 · 死音节')];
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
        tags: [R.FINALS[chars[0]].sonorant ? '清尾辅音 · 活音节' : '浊尾辅音 · 死音节'],
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

  function buildSeg(host, list, current, onPick) {
    while (host.firstChild) host.firstChild.remove();
    for (const item of list) {
      const btn = el('button', '', item.label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(item.id === current));
      btn.addEventListener('click', () => onPick(item.id));
      host.append(btn);
    }
  }

  function renderSettings() {
    const prefs = applyPrefs(readPrefs());
    buildSeg($('fontSeg'), FONTS, prefs.font, (id) => {
      writePrefs({ font: id });
      renderSettings();
    });
    buildSeg($('themeSeg'), THEMES, prefs.theme, (id) => {
      writePrefs({ theme: id });
      renderSettings();
    });
  }

  // ── 目录锚点：滚动时高亮当前这一节 ─────────────────────────────────
  function buildToc() {
    const host = $('toc');
    const secs = [...document.querySelectorAll('.tut-sec')];
    for (const sec of secs) {
      const link = el('a', 'toc-link', sec.dataset.title);
      link.href = `#${sec.id}`;
      host.append(link);
    }
    if (!('IntersectionObserver' in window)) return;
    const links = new Map([...host.children].map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const [id, link] of links) {
          if (id === entry.target.id) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-72px 0px -60% 0px' });
    for (const sec of secs) io.observe(sec);
  }

  // ── 搜索：输入字母 / 注音 / 中文都能查，选中就跳过去并高亮 ──────────
  const search = { input: null, list: null, clear: null, matches: [], nodes: [], active: -1 };

  const findMatches = (query) => S.findMatches(INDEX, query);

  function closeResults() {
    search.list.hidden = true;
    search.active = -1;
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
    search.matches = found.list;
    search.nodes = [];
    search.active = -1;
    while (search.list.firstChild) search.list.firstChild.remove();
    if (!query.trim()) {
      closeResults();
      return;
    }
    if (!search.matches.length) {
      const empty = el('li', 'res empty', '没找到，换个写法试试（可以搜泰文字母、罗马注音、中文意思）');
      empty.setAttribute('aria-disabled', 'true');
      search.list.append(empty);
      search.list.hidden = false;
      return;
    }
    // 退到「例词和讲解里提到」时说明一句，免得用户以为搜错了
    if (found.tier === 'loose') {
      const note = el('li', 'res note', '字形和名称里没有，下面是例词或讲解里提到的');
      note.setAttribute('aria-disabled', 'true');
      search.list.append(note);
    }
    search.matches.forEach((item, i) => {
      const li = el('li', 'res');
      li.id = `res${i}`;
      li.setAttribute('role', 'option');
      li.append(thai('span', 'res-glyph', item.glyph));
      const main = el('span', 'res-main');
      main.append(el('b', '', item.name));
      if (item.roman) main.append(el('span', 'res-roman', item.roman));
      if (item.tags.length) main.append(el('span', 'res-sec', item.tags[0]));
      li.append(main, el('span', 'res-snippet', item.text));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); jumpTo(item); });
      search.list.append(li);
      search.nodes.push(li);
    });
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
        if (!search.matches.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        search.active = (search.active + step + search.matches.length) % search.matches.length;
        paintActive();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = search.matches[search.active >= 0 ? search.active : 0];
        if (item) jumpTo(item);
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
