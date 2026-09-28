/**
 * 界面逻辑：词表勾选、随机组合、声调切换、朗读。
 * 规则全部来自 rules.js，这里只做渲染与交互。
 */
(() => {
  'use strict';

  const R = window.ThaiRules;
  // rules.js 没跑起来时（老浏览器 / 被预览器拦掉）给出明确提示，而不是留个空页面
  if (!R) {
    const box = document.createElement('div');
    box.className = 'notice';
    box.innerHTML = '<p class="notice-title">规则引擎没有加载</p>'
      + '<p>页面需要用浏览器打开（不要用「预览」），麻烦截图发我。</p>';
    (document.querySelector('.app') || document.body).prepend(box);
    return;
  }
  // 词表结构变动时递增版本号，避免读到旧版不兼容的勾选记录
  const STORE_KEY = 'thai-wordcards.v3';

  // 打开页面时卡片上先摆一个真实的泰语词，别空着；点「随机组合」后就被替换掉
  const GREETING = { text: 'สวัสดี', roman: 'sà-wàt-dii' };

  // 辞典是可选功能：dict.js 没加载出来（旧缓存、被预览器拦掉）时整个功能静默停用
  const D = window.ThaiDict || {
    loadWords: () => Promise.reject(new Error('no dict')),
    loadIndex: () => Promise.reject(new Error('no dict')),
    isWord: () => false,
    lookup: () => null,
    nextBatch: () => [],
    total: () => 0,
    source: () => '',
    note: () => '',
  };

  const FONTS = [
    { id: 'sarabun', label: '标准体', sample: 'ก' },
    { id: 'serif', label: '印刷衬线', sample: 'ข' },
  ];
  const THEMES = [
    { id: 'auto', label: '跟随系统' },
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
  ];
  const ROMAN_SEGS = R.ROMAN_SYSTEMS.map((s) => ({ id: s.id, label: s.label }));
  // 随机组合的范围，从宽到严。原来只有一个「遵守拼写规则」开关，
  // 现在把「只拼常用词」并进来做成同一档：一档比一档严，不会出现「不检查规则却只出常用词」这种自相矛盾的状态
  const RANGES = [
    { id: 'any', label: '任意' },
    { id: 'strict', label: '按规则' },
    { id: 'common', label: '常用词' },
  ];

  // 默认勾选全部辅音，只留 ฃ ฅ 这两个废弃字母让人手动开
  const DEFAULT_CONSONANTS = R.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  // 词表里能勾选的元音（排除内部项，以及由开关单独控制的「无元音符号」那种写法）
  const SELECTABLE_VOWELS = R.SELECTABLE_VOWEL_IDS;

  const state = {
    consonants: new Set(DEFAULT_CONSONANTS),
    vowels: new Set(SELECTABLE_VOWELS),
    allowClusters: false,
    allowFinal: true,
    allowVowelOnset: false,
    allowImplicit: false,
    // 'any' = 不检查规则；'strict' = 按泰语拼写规则；'common' = 只拼词表里的常用词
    range: 'strict',
    // 由 range 推出来的（除了「任意」都要检查规则）。规则判断统一读这个字段，
    // 不要单独给它赋值，改 range 之后调 syncRange()
    strict: true,
    autoSpeak: false,
    font: 'sarabun',
    theme: 'auto',
    romanSystem: 'latin',
    // 'random' = 随机组合；'fixed' = 自己挑一个辅音 / 一个元音来拼读
    mode: 'random',
    fixedOnset: null,
    fixedVowelId: null,
    // 常用词模式下没抽中、退回了普通音节（只在这一次随机里有效，用来提示一句）
    commonFallback: false,
    // 从辞典里点出来、正在主卡片上展示的词（没有音节时用它替代打招呼那个词）
    word: null,
    parts: null,
  };

  const el = {
    card: document.getElementById('card'),
    syllable: document.getElementById('syllable'),
    roman: document.getElementById('roman'),
    parts: document.getElementById('parts'),
    tones: document.getElementById('tones'),
    toneHint: document.getElementById('toneHint'),
    consonants: document.getElementById('consonants'),
    vowels: document.getElementById('vowels'),
    consHint: document.getElementById('consHint'),
    vowelHint: document.getElementById('vowelHint'),
    optionsHint: document.getElementById('optionsHint'),
    rangeSeg: document.getElementById('rangeSeg'),
    rangeHint: document.getElementById('rangeHint'),
    rowClusters: document.getElementById('rowClusters'),
    rowFinal: document.getElementById('rowFinal'),
    rowVowelOnset: document.getElementById('rowVowelOnset'),
    rowImplicit: document.getElementById('rowImplicit'),
    rowAutoSpeak: document.getElementById('rowAutoSpeak'),
    consAll: document.getElementById('consAll'),
    consNone: document.getElementById('consNone'),
    vowelAll: document.getElementById('vowelAll'),
    vowelNone: document.getElementById('vowelNone'),
    fontSeg: document.getElementById('fontSeg'),
    themeSeg: document.getElementById('themeSeg'),
    romanSeg: document.getElementById('romanSeg'),
    randomBtn: document.getElementById('randomBtn'),
    speakBtn: document.getElementById('speakBtn'),
    modeBtn: document.getElementById('modeBtn'),
    voiceInfo: document.getElementById('voiceInfo'),
    optClusters: document.getElementById('optClusters'),
    optFinal: document.getElementById('optFinal'),
    optVowelOnset: document.getElementById('optVowelOnset'),
    optImplicit: document.getElementById('optImplicit'),
    optAutoSpeak: document.getElementById('optAutoSpeak'),
    tourBtn: document.getElementById('tourBtn'),
    dictHit: document.getElementById('dictHit'),
    dictList: document.getElementById('dictList'),
    dictMore: document.getElementById('dictMore'),
    dictHint: document.getElementById('dictHint'),
    dictNote: document.getElementById('dictNote'),
    dictPanel: document.getElementById('dictPanel'),
    optionsPanel: document.getElementById('optionsPanel'),
  };

  // ── 偏好持久化 ───────────────────────────────────────────────────────
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        consonants: [...state.consonants],
        vowels: [...state.vowels],
        allowClusters: state.allowClusters,
        allowFinal: state.allowFinal,
        allowVowelOnset: state.allowVowelOnset,
        allowImplicit: state.allowImplicit,
        range: state.range,
        autoSpeak: state.autoSpeak,
        font: state.font,
        theme: state.theme,
        romanSystem: state.romanSystem,
        mode: state.mode,
        fixedOnset: state.fixedOnset,
        fixedVowelId: state.fixedVowelId,
      }));
    } catch { /* 无痕模式等场景下忽略 */ }
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch { return; }
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const known = new Set(R.CONSONANTS.map((c) => c.ch));
      const knownVowels = new Set(SELECTABLE_VOWELS);
      const cons = (data.consonants || []).filter((ch) => known.has(ch));
      const vows = (data.vowels || []).filter((id) => knownVowels.has(id));
      if (cons.length) state.consonants = new Set(cons);
      if (vows.length) state.vowels = new Set(vows);
      if (typeof data.allowClusters === 'boolean') state.allowClusters = data.allowClusters;
      if (typeof data.allowFinal === 'boolean') state.allowFinal = data.allowFinal;
      if (typeof data.allowVowelOnset === 'boolean') state.allowVowelOnset = data.allowVowelOnset;
      if (typeof data.allowImplicit === 'boolean') state.allowImplicit = data.allowImplicit;
      // 老版本存的是布尔值 strict，映射到新的三档上
      if (RANGES.some((r) => r.id === data.range)) state.range = data.range;
      else if (typeof data.strict === 'boolean') state.range = data.strict ? 'strict' : 'any';
      if (typeof data.autoSpeak === 'boolean') state.autoSpeak = data.autoSpeak;
      if (FONTS.some((f) => f.id === data.font)) state.font = data.font;
      if (THEMES.some((t) => t.id === data.theme)) state.theme = data.theme;
      if (R.ROMAN_SYSTEMS.some((s) => s.id === data.romanSystem)) state.romanSystem = data.romanSystem;
      if (data.mode === 'fixed' || data.mode === 'random') state.mode = data.mode;
      if (typeof data.fixedOnset === 'string') state.fixedOnset = data.fixedOnset;
      if (typeof data.fixedVowelId === 'string') state.fixedVowelId = data.fixedVowelId;
    } catch { /* 数据坏了就用默认值 */ }
  }

  // ── 词表 ────────────────────────────────────────────────────────────
  /** 清空并放进新内容。不用 replaceChildren：老版本 iOS Safari 没有这个方法 */
  function setChildren(parent, ...nodes) {
    while (parent.firstChild) parent.firstChild.remove();
    if (nodes.length) parent.append(...nodes);
  }

  /** 悬浮卡片：放大字形 + 注释合并在一起 */
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);

  function tipText(data) {
    return [data.glyph, ...data.rows.map(([k, v]) => `${k} ${v}`)].join(' · ');
  }

  function showTip(btn) {
    const data = btn._tipData;
    if (!data) return;
    const glyph = document.createElement('div');
    glyph.className = 'glyph';
    if (typeof data.glyphNodes === 'function') glyph.append(...data.glyphNodes());
    else glyph.textContent = data.glyph;

    const list = document.createElement('dl');
    for (const [label, value] of data.rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    }
    setChildren(tip, glyph, list);
    tip.hidden = false;

    const r = btn.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let top = r.top - t.height - 10;
    if (top < 8) top = r.bottom + 10;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
    tip.style.top = `${top + window.scrollY}px`;
    tip.style.left = `${left + window.scrollX}px`;
  }

  function hideTip() {
    tip.hidden = true;
  }

  // 触屏没有 hover：长按 450ms 弹卡片，并且这次长按不再触发「选中/取消」
  const LONG_PRESS_MS = 450;
  let pressTimer = null;
  let longPressAt = 0; // 用时间戳而不是布尔：长按后万一没派发 click，也不会把下一次点击吃掉

  function startPress(btn, pointerType) {
    if (pointerType === 'mouse') return; // 鼠标走 mouseenter
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressAt = Date.now();
      showTip(btn);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  function chip(content, pressed, tipData, extraClass, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `chip ${extraClass}` : 'chip';
    if (Array.isArray(content)) btn.append(...content);
    else btn.textContent = content;
    btn._tipData = tipData;
    btn.setAttribute('aria-label', tipText(tipData));
    btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('mouseenter', () => showTip(btn));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('blur', hideTip);
    btn.addEventListener('pointerdown', (e) => startPress(btn, e.pointerType));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      btn.addEventListener(type, cancelPress);
    }
    // 手机上长按常常会走 contextmenu，顺手接住：既不弹系统菜单，也把卡片显示出来
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      longPressAt = Date.now();
      showTip(btn);
    });
    btn.addEventListener('click', (e) => {
      if (Date.now() - longPressAt < 1000) {
        e.preventDefault();
        return;
      }
      onClick(e);
    });
    return btn;
  }

  function buildConsonants() {
    hideTip();
    setChildren(el.consonants);
    for (const cls of ['mid', 'high', 'low']) {
      const row = document.createElement('div');
      row.className = 'row';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = R.CLASS_LABEL[cls];
      row.append(tag);
      const fixed = state.mode === 'fixed';
      for (const c of R.CONSONANTS.filter((x) => x.cls === cls)) {
        const flags = [c.rare && '罕用', c.obsolete && '已废弃'].filter(Boolean);
        const rows = [
          ['类别', [R.CLASS_LABEL[cls], ...flags].join(' · ')],
          ['罗马注音', c.roman || '—'],
          ['国际音标', R.consonantIPA(c.ch)],
          ['例词', c.example ? `${c.ch} ${c.example}${c.gloss ? `（${c.gloss}）` : ''}` : ''],
        ].filter(([, v]) => v);
        const on = fixed ? state.fixedOnset === c.ch : state.consonants.has(c.ch);
        row.append(chip(c.ch, on, { glyph: c.ch, rows }, '', () => {
          if (fixed) {
            // 固定模式：点一下选它，再点一下取消（可以只留元音，或者什么都不留）
            state.fixedOnset = state.fixedOnset === c.ch ? null : c.ch;
            buildConsonants();
            applyFixed();
            save();
            return;
          }
          if (state.consonants.has(c.ch)) state.consonants.delete(c.ch);
          else state.consonants.add(c.ch);
          buildConsonants();
          save();
        }));
      }
      el.consonants.append(row);
    }
  }

  // 只有组合符号的元音（ั ิ ี ึ ื ุ ู）单独显示时会偏到左上角。
  // 用一个透明的 อ 当底座（和课本里「สระ อิ」的写法一致），符号就会落在正常位置。
  const COMBINING_ONLY = /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;

  function vowelForm(v) {
    if (v.id === 'o_implied') return '无';
    return `${v.lead ? `${v.lead}-` : ''}${v.follow || ''}${v.tail || ''}`;
  }

  /** 字块里的内容：组合符号前面补一个看不见的 อ */
  function vowelChipContent(v) {
    const form = vowelForm(v);
    if (!COMBINING_ONLY.test(form)) return form;
    const base = document.createElement('span');
    base.className = 'ghost-base';
    base.textContent = 'อ';
    base.setAttribute('aria-hidden', 'true');
    return [base, document.createTextNode(form)];
  }

  function buildVowels() {
    hideTip();
    setChildren(el.vowels);
    const fixed = state.mode === 'fixed';
    for (const group of R.VOWEL_GROUPS) {
      // 「无元音符号」那种写法由选项面板的开关控制，不出现在词表里
      const inGroup = R.VOWELS.filter((v) => v.group === group.id && R.isSelectableVowel(v));
      if (!inGroup.length) continue;
      const head = document.createElement('div');
      head.className = 'vowel-group';
      const name = document.createElement('b');
      name.textContent = group.thai;
      const zh = document.createElement('span');
      zh.textContent = `${group.label} ${inGroup.length}`;
      head.append(name, zh);
      const row = document.createElement('div');
      row.className = 'chips';
      for (const v of inGroup) {
        row.append(vowelChip(v, fixed ? state.fixedVowelId === v.id : state.vowels.has(v.id)));
      }
      el.vowels.append(head, row);
    }
    const counted = R.VOWELS.filter((v) => R.isSelectableVowel(v) && v.group !== 'variant').length;
    const variants = R.VOWELS.filter((v) => R.isSelectableVowel(v) && v.group === 'variant').length;
    el.vowelHint.textContent = fixed
      ? '点一下选择，再点取消'
      : `${counted} 个 + ${variants} 个变体写法`;
    el.consHint.textContent = fixed ? '点一下选择，再点取消' : '44 个';
  }

  // ── 一键全选 / 全不选 ───────────────────────────────────────────────
  function setAllConsonants(on) {
    state.consonants = new Set(on ? R.CONSONANTS.map((c) => c.ch) : []);
    buildConsonants();
    save();
  }

  // ── 固定模式：自己挑一个辅音 / 一个元音来拼读 ────────────────────────
  /**
   * 固定模式的三种情况：
   *   只选辅音 → 补上 สระออ，显示成 กอ（就是字母本身的读法）
   *   只选元音 → 用 อ 当载体，显示成 อา（课本里写单元音的方式）
   *   都选了   → 正常拼成一个音节，如 กา
   */
  function applyFixed() {
    state.commonFallback = false; // 固定模式是自己挑字母，和「常用词」无关
    state.word = null;            // 一旦自己挑字母，辞典点过来的那个词就不留了
    const onset = state.fixedOnset;
    const vowelId = state.fixedVowelId;
    if (!onset && !vowelId) {
      state.parts = null;
      renderCard();
      return;
    }
    const vowel = vowelId ? R.VOWELS.find((v) => v.id === vowelId) : null;
    const vowelForm = vowel ? `${vowel.lead || ''}${vowel.follow || ''}${vowel.tail || ''}` : '';
    // 只选元音时要补载体吗：遵守规则时补；「无元音符号」这种本身没有字形的也必须补，
    // 否则卡片会是一片空白。ฤ ฤๅ ฦ ฦๅ 自己能站住，不补。
    const needCarrier = !!vowel && !vowel.canBeOnset && (state.strict || !vowelForm);
    const next = onset
      // 只选辅音时：遵守拼写规则就补一个 สระออ（读作 กอ，字母本身的读法）；
      //            关掉规则就不补，卡片上只留这个辅音
      ? { vowelId: vowelId || (state.strict ? 'o_long' : 'none'), onset, cluster: null, tone: 'none', final: null }
      // 只选元音时：遵守拼写规则就补一个 อ 当载体（课本写单元音的方式）；
      //            关掉规则就不补。ฤ ฤๅ ฦ ฦๅ 自己能站住，任何时候都不补。
      : {
        vowelId,
        onset: needCarrier ? 'อ' : null,
        cluster: null,
        tone: 'none',
        final: null,
      };
    // 之前选过的声调如果还能用就留着，来回换字母时不用重新点
    const prevTone = state.parts ? state.parts.tone : 'none';
    if (prevTone && prevTone !== 'none') {
      const option = R.toneOptions(next, state.strict).find((t) => t.id === prevTone);
      if (option && option.allowed) next.tone = prevTone;
    }
    state.parts = next;
    renderCard();
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    if (mode === 'fixed') {
      // 接着刚才随机出来的那个音节练：把声母和元音带进固定模式
      if (state.parts) {
        state.fixedOnset = state.parts.onset;
        state.fixedVowelId = state.parts.vowelId === 'o_long' ? null : state.parts.vowelId;
      }
    }
    applyMode();
    buildConsonants();
    buildVowels();
    if (mode === 'fixed') applyFixed();
    else renderCard();
    save();
  }

  /** 把与模式有关的界面状态刷一遍（按钮文字/状态、全选按钮的显隐） */
  function applyMode() {
    const fixed = state.mode === 'fixed';
    // 全选/全不选只对随机模式有意义，固定模式下藏起来
    for (const btn of [el.consAll, el.consNone, el.vowelAll, el.vowelNone]) btn.hidden = fixed;
    // 这四项只影响随机组合：固定模式灰掉、选不中（字体/音标/外观、拼写规则两种模式都保留）
    const randomOnly = [
      [el.rowClusters, el.optClusters],
      [el.rowFinal, el.optFinal],
      [el.rowVowelOnset, el.optVowelOnset],
      [el.rowImplicit, el.optImplicit],
      [el.rowAutoSpeak, el.optAutoSpeak],
    ];
    for (const [row, input] of randomOnly) {
      input.disabled = fixed;
      row.classList.toggle('off', fixed);
      row.title = fixed ? '固定模式下不适用（只影响随机组合）' : '';
    }
    applyRangeHint();
    el.modeBtn.setAttribute('aria-pressed', String(fixed));
    el.modeBtn.title = fixed ? '当前：固定模式（点它切回随机组合）' : '切换：随机组合 / 自己挑选搭配';
    el.randomBtn.disabled = fixed;
    if (fixed) {
      setChildren(el.randomBtn, document.createTextNode('固定模式'));
    } else {
      const kbd = document.createElement('kbd');
      kbd.textContent = '空格';
      setChildren(el.randomBtn, document.createTextNode('随机组合'), kbd);
    }
  }

  function setAllVowels(on) {
    state.vowels = new Set(on ? SELECTABLE_VOWELS : []);
    buildVowels();
    save();
  }

  function vowelChip(v, on) {
    const notes = [
      v.canBeOnset && '可单独作声母',
      !v.allowsFinal && !v.requiresFinal && '不能带尾辅音',
      v.requiresFinal && '必须带尾辅音',
      v.noTone && '不写声调符号',
      v.note,
    ].filter(Boolean);
    const rows = [
      ['名称', `${v.name} · ${v.en}`],
      ['罗马注音', v.roman],
      ['国际音标', v.ipa],
      ['长短', v.short ? '短音' : '长音'],
      ['例词', v.example],
      ['说明', notes.join(' · ')],
    ].filter(([, value]) => value);
    const tipData = { glyph: '', glyphNodes: () => vowelChipContent(v), rows };
    return chip(vowelChipContent(v), on, tipData, 'vowel-chip', () => {
      if (state.mode === 'fixed') {
        // 固定模式：点一下选它，再点一下取消（可以只留辅音，或者什么都不留）
        state.fixedVowelId = state.fixedVowelId === v.id ? null : v.id;
        buildVowels();
        applyFixed();
        save();
        return;
      }
      if (state.vowels.has(v.id)) state.vowels.delete(v.id);
      else state.vowels.add(v.id);
      buildVowels();
      save();
    });
  }

  // ── 字体与外观 ──────────────────────────────────────────────────────
  function buildSeg(container, items, current, onPick) {
    setChildren(container, ...items.map((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      if (item.sample) {
        const span = document.createElement('span');
        span.className = 'sample';
        span.textContent = item.sample;
        btn.append(span);
      }
      btn.setAttribute('aria-pressed', String(item.id === current));
      btn.dataset.id = item.id;
      btn.addEventListener('click', () => onPick(item.id));
      return btn;
    }));
  }

  function applyFont() {
    document.documentElement.dataset.font = state.font;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }

  function renderSettings() {
    buildSeg(el.fontSeg, FONTS, state.font, (id) => {
      state.font = id;
      applyFont();
      renderSettings();
      save();
    });
    buildSeg(el.romanSeg, ROMAN_SEGS, state.romanSystem, (id) => {
      state.romanSystem = id;
      renderSettings();
      renderCard();
      save();
    });
    buildSeg(el.themeSeg, THEMES, state.theme, (id) => {
      state.theme = id;
      applyTheme();
      renderSettings();
      save();
    });
    buildSeg(el.rangeSeg, RANGES, state.range, (id) => {
      state.range = id;
      syncRange();
      // 选到「常用词」就顺手把词表取回来，不然第一次点随机组合还得现等
      if (id === 'common') D.loadWords().catch(() => { /* 取不到就退回普通随机 */ });
      // 固定模式下这一档决定要不要用 อ 补位，得重新拼一遍
      if (state.mode === 'fixed') applyFixed();
      else renderCard();
      renderSettings();
      applyRangeHint();
      save();
    });
  }

  /** range 是唯一信息源，strict 从它推出来，免得两处状态对不上 */
  function syncRange() {
    state.strict = state.range !== 'any';
  }

  // 「组合范围」这一档在两种模式下含义不同：随机模式讲怎么拼，固定模式讲要不要补 อ
  const RANGE_HINT = {
    any: {
      random: '不检查规则：可能拼出泰语里不存在的组合，声调也不受限',
      fixed: '不检查规则：只选元音时不补 อ',
    },
    strict: {
      random: '按泰语拼写规则拼：禁用这个组合用不上的声调',
      fixed: '单选元/辅音时用 อ 补位',
    },
    common: {
      random: '只从常用词里取：拼出来的一定是真实存在的词',
      fixed: '固定模式下等同于「按规则」',
    },
  };

  function applyRangeHint() {
    const fixed = state.mode === 'fixed';
    el.rangeHint.textContent = RANGE_HINT[state.range][fixed ? 'fixed' : 'random'];
    // 「常用词」只对随机组合有意义（固定模式是手动挑字母），灰掉但保留选择，
    // 切回随机模式还是这一档
    const commonBtn = [...el.rangeSeg.children].find((b) => b.dataset.id === 'common');
    if (commonBtn) {
      commonBtn.disabled = fixed;
      commonBtn.title = fixed ? '固定模式下不适用（常用词只影响随机组合）' : '';
    }
    el.optionsHint.textContent = fixed
      ? '固定模式只用到字体、音标和外观；灰掉的几项只对随机组合生效'
      : '';
  }

  // ── 渲染卡片 ────────────────────────────────────────────────────────
  function buildTones() {
    setChildren(el.tones, ...R.TONES.map((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tone';
      btn.dataset.tone = t.id;
      const mark = document.createElement('span');
      mark.className = 'mark';
      // 声调符号是组合符号，单独放会浮在右上角。用一个淡显的 อ 当底座，
      // 五个按钮就都是「淡 อ (+ 符号)」，高度和位置才一致。
      const base = document.createElement('span');
      base.className = 'ghost-base';
      base.textContent = 'อ';
      base.setAttribute('aria-hidden', 'true');
      mark.append(base, document.createTextNode(t.mark || ''));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.shortName;
      btn.append(mark, name);
      btn.addEventListener('click', () => selectTone(t.id));
      return btn;
    }));
  }

  /** 当前声调若在新设置下不可用，退回「无音调」 */
  function normalizeTone() {
    if (!state.parts) return;
    const options = R.toneOptions(state.parts, state.strict);
    const current = options.find((t) => t.id === state.parts.tone);
    if (!current || !current.allowed) state.parts.tone = 'none';
  }

  function renderPart(label, value) {
    const span = document.createElement('span');
    span.append(`${label} `);
    const b = document.createElement('b');
    b.textContent = value;
    span.append(b);
    return span;
  }

  function renderCard() {
    normalizeTone();

    if (!state.parts) {
      state.commonFallback = false;
      // 辞典里点过来的词优先；没有就摆打招呼那个词
      const entry = state.word ? D.lookup(state.word) : null;
      el.syllable.textContent = state.word || GREETING.text;
      el.roman.textContent = state.word
        ? `/${(entry && entry[1]) || '—'}/ · 罗马注音`
        : `/${GREETING.roman}/ · 罗马注音`;
      const hint = document.createElement('span');
      if (state.word) hint.textContent = '来自辞典 · 点「随机组合」回到随机练习';
      else if (state.mode === 'fixed') hint.textContent = '固定模式：点下面的字母，选一个辅音和/或一个元音';
      else hint.textContent = '点「随机组合」开始';
      setChildren(el.parts, hint);
      el.toneHint.textContent = '';
      updateDictHit();
      for (const btn of el.tones.children) {
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'false');
        btn.title = '';
      }
      return;
    }

    const info = R.describe(state.parts, state.strict, state.romanSystem);
    // 关闭规则检查时允许生成「规则上不合法」的组合，这种情况不算异常
    if (info.issues.length && state.strict) console.warn('组合自检异常', info.issues, info.text);

    // 固定模式下只选了元音时，卡片上的 อ 是自动补的载体，不是使用者选的，淡显出来
    // 不补位（关闭拼写规则）时，孤立的组合符号（ิ ี ึ ื ุ ู ั）默认浮在卡片上方，
    // 单独把它往下/上挪一点，落在卡片中间
    const l = R.layout(state.parts);
    const bareMark = state.mode === 'fixed' && !state.strict && !l.onset
      && l.follow.length === 1 && R.COMBINING_CHARS.has(l.follow) && !l.tail;
    if (bareMark) {
      const span = document.createElement('span');
      span.className = R.BELOW_COMBINING_CHARS.has(l.follow) ? 'bare-mark below' : 'bare-mark';
      span.textContent = l.follow;
      setChildren(el.syllable, span);
    } else {
      el.syllable.textContent = info.text;
    }
    const systemLabel = state.romanSystem === 'ipa' ? '国际音标 IPA' : '罗马注音';
    // อ 之类的字母在罗马注音里本来就没有对应写法，显示成 — 而不是空斜杠
    el.roman.textContent = `/${info.roman || '—'}/ · ${systemLabel}，不含声调`;

    const breakdown = [];
    if (info.isVowelOnset) breakdown.push(renderPart('声母', '元音充当声母'));
    else breakdown.push(renderPart('首辅音', `${state.parts.onset} ${info.onsetClassLabel}`));
    if (state.parts.cluster) {
      const cluster = `${state.parts.onset}${state.parts.cluster}`;
      breakdown.push(renderPart('辅音簇', info.clusterNote ? `${cluster}（${info.clusterNote}）` : cluster));
    }
    // 关闭拼写规则时会用到「无元音」这个内部项，这时不显示元音那一栏
    if (state.parts.vowelId !== 'none') {
      breakdown.push(renderPart('元音', `${info.vowelName}（${info.vowelLength}）`));
    }
    if (state.parts.final) breakdown.push(renderPart('尾辅音', state.parts.final));
    breakdown.push(renderPart('声调', info.toneName));
    setChildren(el.parts, ...breakdown);

    const disabledReasons = [];
    for (const btn of el.tones.children) {
      const opt = info.tones.find((t) => t.id === btn.dataset.tone);
      btn.disabled = !opt.allowed;
      btn.setAttribute('aria-pressed', String(state.parts.tone === opt.id));
      btn.title = opt.allowed ? `${opt.name}${opt.mark ? ` ${opt.mark}` : ''}` : opt.reason;
      if (!opt.allowed && !disabledReasons.includes(opt.reason)) disabledReasons.push(opt.reason);
    }
    el.toneHint.textContent = disabledReasons.length
      ? `${disabledReasons.join('；')}（可在选项中关闭规则检查）`
      : '';
    if (state.commonFallback) {
      const note = '当前词表里没抽到常用词，先给一个普通音节（多勾几个字母更容易抽中）';
      el.toneHint.textContent = el.toneHint.textContent
        ? `${el.toneHint.textContent}；${note}`
        : note;
    }
    updateDictHit();
  }

  // ── 卡片上的「真词」提示 ──────────────────────────────────────────
  // 组合出来的音节大多不是真词，这是刻意的；碰巧撞上真词时顺手把释义带上，
  // 索引是懒加载的（近 500KB），所以第一张卡片可能先没有结论，加载完再补上。
  // fn = 虚词：没有实义、只起语法或语气作用（ครับ ค่ะ นะ 这类），单独标出来
  const POS_LABEL = {
    n: '名', v: '动', adj: '形', adv: '副', pron: '代',
    num: '数', cls: '量', intj: '叹', fn: '虚词', x: '其它',
  };

  /** 卡片上现在是哪段泰文；还没生成时就是打招呼的那个词 */
  function currentText() {
    if (state.parts) return R.assemble(state.parts);
    if (state.word) return state.word;
    return GREETING.text;
  }

  function renderDictHit() {
    const text = currentText();
    const entry = D.lookup(text);
    setChildren(el.dictHit);
    if (!D.isWord(text)) {
      el.dictHit.hidden = true;
      return;
    }
    const mark = document.createElement('span');
    mark.className = 'dh-mark';
    mark.textContent = '真词';
    el.dictHit.append(mark);
    // 有释义就摆释义（这正是这个提示的意义）；没有就只留「真词」两个字，
    // 不要再写「常用词表未收录」那种解释——那是给开发者看的，不是给学的人看的
    if (entry && entry[2]) {
      const zh = document.createElement('span');
      zh.className = 'dh-zh';
      zh.textContent = entry[2];
      el.dictHit.append(zh);
    } else if (entry && entry[5]) {
      // 中文词表没收录这个词，退回英文释义——标一下「英文」，别让人以为是中文没写好
      const tag = document.createElement('span');
      tag.className = 'dh-pos';
      tag.textContent = '英文';
      const en = document.createElement('span');
      en.className = 'dh-en';
      en.textContent = entry[5];
      el.dictHit.append(tag, en);
    }
    // 没有实义的虚词（ครับ ค่ะ นะ …）单独标一下，看到就知道不用去记「意思」
    if (entry && entry[3] === 'fn') {
      const fn = document.createElement('span');
      fn.className = 'dh-pos';
      fn.textContent = '虚词';
      el.dictHit.append(fn);
    }
    // 「常用」只在它真的是常用词时才标
    if (entry && entry[4]) {
      const tag = document.createElement('span');
      tag.className = 'dh-pos';
      tag.textContent = '常用';
      el.dictHit.append(tag);
    }
    el.dictHit.hidden = false;
  }

  /** 索引没加载好时不显示结论，加载完再重绘一次当前卡片 */
  function updateDictHit() {
    if (D.isWord(currentText()) === null) {
      el.dictHit.hidden = true;
      setChildren(el.dictHit);
      D.loadIndex()
        .then(() => renderDictHit())
        .catch(() => { /* 取不到索引就当没有这个功能，卡片照常用 */ });
      return;
    }
    renderDictHit();
  }

  // ── 辞典面板：常用词，少量多次 ─────────────────────────────────────
  const DICT_BATCH = 6;
  let dictLoaded = false;

  function renderDictBatch() {
    const batch = D.nextBatch(DICT_BATCH);
    setChildren(el.dictList);
    for (const entry of batch) {
      const [word, rom, zh, pos] = entry;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dict-word';
      const thai = document.createElement('span');
      thai.className = 'dw-thai';
      thai.textContent = word;
      const meta = document.createElement('span');
      meta.className = 'dw-meta';
      if (rom) {
        const r = document.createElement('span');
        r.className = 'dw-rom';
        r.textContent = rom;
        meta.append(r);
      }
      if (pos && POS_LABEL[pos]) {
        const p = document.createElement('span');
        p.className = 'dw-pos';
        p.textContent = POS_LABEL[pos];
        meta.append(p);
      }
      const cn = document.createElement('span');
      cn.className = 'dw-zh';
      if (zh) {
        cn.textContent = zh;
      } else if (entry[5]) {
        // 同卡片：「英文」两个字提示这是英文释义，不是没翻好的中文
        const tag = document.createElement('span');
        tag.className = 'dw-en-tag';
        tag.textContent = '英文';
        cn.append(tag, document.createTextNode(entry[5]));
        cn.classList.add('dw-en');
      }
      item.append(thai, meta, cn);
      item.title = '点一下显示在主卡片上';
      item.addEventListener('click', () => showWordOnCard(word));
      el.dictList.append(item);
    }
    el.dictHint.textContent = `共 ${D.total()} 条`;
  }

  /** 把辞典里的词放到主卡片上：放大字形 + 注音 + 释义都在同一处看 */
  function showWordOnCard(word) {
    state.parts = null;
    state.commonFallback = false;
    state.word = word;
    renderCard();
    el.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function ensureDict() {
    if (dictLoaded) return;
    D.loadWords()
      .then(() => {
        dictLoaded = true;
        renderDictBatch();
        el.dictNote.textContent = `${D.note()}　来源：${D.source()}`;
      })
      .catch(() => {
        el.dictList.textContent = '';
        el.dictNote.textContent = '词库没加载出来：这部分数据是联网取的，检查一下网络后重新打开本页。';
      });
  }

  el.dictMore.addEventListener('click', () => {
    if (dictLoaded) renderDictBatch();
  });
  el.dictPanel.addEventListener('toggle', () => {
    if (el.dictPanel.open) ensureDict();
  });

  function selectTone(id) {
    if (!state.parts) return;
    const option = R.toneOptions(state.parts, state.strict).find((t) => t.id === id);
    if (!option || !option.allowed) return;
    state.parts.tone = id;
    renderCard();
  }

  // ── 动作 ────────────────────────────────────────────────────────────
  function randomize() {
    if (state.mode === 'fixed') return; // 固定模式下由词表点击驱动
    state.word = null;                  // 随机组合一按，辞典点过来的词就让位
    const vowelOnsetAvailable = state.allowVowelOnset
      && R.VOWELS.some((v) => v.canBeOnset && state.vowels.has(v.id));
    if (!state.vowels.size || (!state.consonants.size && !vowelOnsetAvailable)) {
      state.parts = null;
      renderCard();
      el.syllable.textContent = '—';
      el.roman.textContent = '请先在词表里至少勾选一个辅音和一个元音';
      return;
    }
    // 常用词模式下反复抽，直到抽到一个真实存在的常用词为止。
    // 随机音节命中常用词的概率大约 1%，所以多试几百次基本不会落空；
    // 实在抽不到（比如词表只勾了一两个字母）就退回普通随机，并说明原因
    const wantCommon = state.range === 'common' && D.ready();
    const MAX_TRIES = wantCommon ? 2000 : 1;
    let parts = null;
    for (let i = 0; i < MAX_TRIES; i += 1) {
      const candidate = R.generate({
        consonants: [...state.consonants],
        // 「允许无元音符号的闭音节」打开时，把那种不写符号的 โอะ 加进候选
        vowels: state.allowImplicit ? [...state.vowels, 'o_implied'] : [...state.vowels],
        allowClusters: state.allowClusters,
        allowFinal: state.allowFinal,
        allowVowelOnset: state.allowVowelOnset,
        strict: state.strict,
      });
      if (!candidate) break;
      parts = candidate;
      if (!wantCommon || D.isCommon(R.assemble(candidate))) break;
    }
    if (!parts) {
      // 清掉上一张卡，避免「卡片上还留着上一个音节的字形」和提示互相矛盾
      state.parts = null;
      renderCard();
      el.syllable.textContent = '—';
      el.roman.textContent = '当前词表组不出音节，试试多勾几个字母';
      return;
    }
    state.parts = parts;
    // 常用词模式下没抽中（词表勾得太少）时的兜底提示，交给 renderCard 一起写出来，
    // 免得覆盖掉声调那一行本来要显示的原因
    state.commonFallback = !!wantCommon && !D.isCommon(R.assemble(parts));
    renderCard();
    if (state.autoSpeak) speak();
  }

  let thaiVoice = null;

  function refreshVoices() {
    if (!('speechSynthesis' in window)) {
      el.voiceInfo.textContent = '语音：当前浏览器不支持朗读';
      return;
    }
    const voices = window.speechSynthesis.getVoices() || [];
    thaiVoice = voices.find((v) => /^th([-_]|$)/i.test(v.lang)) || null;
    if (thaiVoice) {
      el.voiceInfo.textContent = `语音：${thaiVoice.name}（${thaiVoice.lang}）`;
      el.voiceInfo.title = '';
    } else if (voices.length) {
      el.voiceInfo.textContent = '语音：未找到泰语语音，无法发音';
      el.voiceInfo.title = '安装泰语语音：Windows → 设置 → 时间和语言 → 语言和区域 → 给泰语添加语音包；'
        + 'macOS → 系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音 → 下载泰语；'
        + 'iPhone → 设置 → 辅助功能 → 朗读内容 → 声音 → 泰语';
    } else {
      el.voiceInfo.textContent = '语音：加载中…';
    }
  }

  /** 朗读任意一段泰文；没装泰语语音时把原因写在页脚，而不是静默失败 */
  function speakText(text) {
    if (!text) return;
    if (!('speechSynthesis' in window)) {
      el.voiceInfo.textContent = '语音：当前浏览器不支持朗读';
      return;
    }
    refreshVoices();  // 语音列表是异步加载的，点之前先刷一遍
    if (!thaiVoice) {
      // 安卓常见：系统没装泰语语音包，说了也是静音或乱读，不如直接说清楚
      el.voiceInfo.textContent = '语音：这台设备没有泰语语音，暂时无法发音';
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.rate = 0.75;
    utter.voice = thaiVoice;
    window.speechSynthesis.speak(utter);
  }

  function speak() {
    speakText(currentText());
  }

  // ── 绑定 ────────────────────────────────────────────────────────────
  el.randomBtn.addEventListener('click', randomize);
  el.speakBtn.addEventListener('click', speak);
  el.consAll.addEventListener('click', () => setAllConsonants(true));
  el.consNone.addEventListener('click', () => setAllConsonants(false));
  el.vowelAll.addEventListener('click', () => setAllVowels(true));
  el.vowelNone.addEventListener('click', () => setAllVowels(false));
  el.modeBtn.addEventListener('click', () => setMode(state.mode === 'fixed' ? 'random' : 'fixed'));

  const bindings = [
    [el.optClusters, 'allowClusters'],
    [el.optFinal, 'allowFinal'],
    [el.optVowelOnset, 'allowVowelOnset'],
    [el.optImplicit, 'allowImplicit'],
    [el.optAutoSpeak, 'autoSpeak'],
  ];
  for (const [input, key] of bindings) {
    input.addEventListener('change', () => {
      state[key] = input.checked;
      save();
    });
  }
  /** 把界面上的开关同步成 state 的值。必须在 load() 之后调用一次，
      否则会「界面显示默认值、实际用的是本地恢复的值」两不一致 */
  function syncInputs() {
    for (const [input, key] of bindings) input.checked = state[key];
  }

  document.addEventListener('keydown', (event) => {
    const tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SUMMARY') return;
    if (event.code === 'Space') {
      event.preventDefault();
      randomize();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      speak();
    }
  });

  // 点到别处或者滚动时把卡片收起来（长按出来的卡片也是）
  document.addEventListener('pointerdown', (event) => {
    const onChip = event.target instanceof Element && event.target.closest('.chip');
    if (!onChip) hideTip();
  }, true);
  window.addEventListener('scroll', hideTip, { passive: true });

  // ── 新手引导 ────────────────────────────────────────────────────────
  const TOUR_KEY = 'thai-wordcards.tourDone';
  const TOUR_STEPS = [
    {
      sel: '.card',
      title: '卡片',
      text: '点「随机组合」生成音节，多无词义，只练拼读。',
    },
    {
      sel: '.split',
      title: '随机 / 固定',
      text: '左半边随机换一个，右半边 ⇄ 切固定模式。下面的「组合范围」选拼得多严。',
    },
    {
      sel: '.tones',
      title: '声调',
      text: '点一下换声调，灰色表示用不上。',
    },
    {
      sel: '#consonants',
      title: '词表',
      text: '勾选要练的字母；悬停看例词和读音（手机长按）。',
    },
    {
      sel: '#dictPanel',
      title: '辞典',
      text: '常用词一次看几个，点「换一批」继续。碰巧拼出真词时，卡片上会标出来。',
      before: () => { el.dictPanel.open = true; ensureDict(); },
    },
    {
      sel: '#optionsPanel',
      title: '选项',
      text: '字体、音标、外观在这里调；固定模式下用不到的会变灰。',
      before: () => { el.optionsPanel.open = true; },
    },
    {
      sel: '.split',
      title: '固定模式',
      text: '点字母就能拼，再点一下取消。',
      before: () => setMode('fixed'),
    },
    {
      sel: '.foot',
      title: '反馈',
      text: '有问题发邮件；安卓暂不支持发音，后续会加。',
      before: () => setMode(tour.prevMode || 'random'),
    },
  ];

  const tour = {
    index: 0,
    prevMode: 'random',   // 引导里会切到固定模式演示，结束时要切回去
    hole: document.createElement('div'),
    mask: document.createElement('div'),
    tip: document.createElement('div'),
    active: false,
  };
  tour.hole.className = 'tour-hole';
  tour.mask.className = 'tour-mask';
  tour.tip.className = 'tour-tip';
  tour.mask.hidden = true;
  tour.hole.hidden = true;
  tour.tip.hidden = true;
  document.body.append(tour.mask, tour.hole, tour.tip);

  function placeTour() {
    const step = TOUR_STEPS[tour.index];
    const target = document.querySelector(step.sel);
    if (!target) return;
    const pad = 6;
    const r = target.getBoundingClientRect();
    const hole = {
      top: Math.max(4, r.top - pad),
      left: Math.max(4, r.left - pad),
      width: Math.min(window.innerWidth - 8, r.width + pad * 2),
      height: Math.min(window.innerHeight - 8, r.height + pad * 2),
    };
    tour.hole.style.top = `${hole.top}px`;
    tour.hole.style.left = `${hole.left}px`;
    tour.hole.style.width = `${hole.width}px`;
    tour.hole.style.height = `${hole.height}px`;

    const t = tour.tip.getBoundingClientRect();
    const gap = 12;
    let top;
    if (hole.top + hole.height + gap + t.height <= window.innerHeight - 8) {
      top = hole.top + hole.height + gap;
    } else if (hole.top - gap - t.height >= 8) {
      top = hole.top - gap - t.height;
    } else {
      top = Math.max(8, window.innerHeight - t.height - 8);
    }
    const left = Math.max(8, Math.min(
      hole.left + hole.width / 2 - t.width / 2,
      window.innerWidth - t.width - 8,
    ));
    tour.tip.style.top = `${top}px`;
    tour.tip.style.left = `${left}px`;
  }

  function showTourStep() {
    const step = TOUR_STEPS[tour.index];
    if (step.before) step.before();
    const target = document.querySelector(step.sel);
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    const total = TOUR_STEPS.length;
    const last = tour.index === total - 1;
    const title = document.createElement('h4');
    title.append(step.title);
    const stepLabel = document.createElement('span');
    stepLabel.className = 'tour-step';
    stepLabel.textContent = `${tour.index + 1}/${total}`;
    title.append(stepLabel);
    const text = document.createElement('p');
    text.textContent = step.text.replace(/\*\*/g, '');
    const actions = document.createElement('div');
    actions.className = 'tour-actions';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = '跳过';
    skip.addEventListener('click', () => endTour());
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '上一步';
    prev.disabled = tour.index === 0;
    prev.addEventListener('click', () => {
      tour.index = Math.max(0, tour.index - 1);
      showTourStep();
    });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    next.textContent = last ? '开始使用' : '下一步';
    next.addEventListener('click', () => {
      if (last) {
        endTour();
        return;
      }
      tour.index += 1;
      showTourStep();
    });
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    actions.append(skip, spacer, prev, next);
    setChildren(tour.tip, title, text, actions);

    tour.mask.hidden = false;
    tour.hole.hidden = false;
    tour.tip.hidden = false;
    placeTour();
  }

  function startTour() {
    if (tour.active) return;
    tour.active = true;
    tour.index = 0;
    tour.prevMode = state.mode;
    hideTip();
    showTourStep();
  }

  /** 第一次打开时自动走一遍引导；在页脚点「新手引导」可以随时重看 */
  function maybeStartTour() {
    let seen = false;
    try {
      seen = !!localStorage.getItem(TOUR_KEY);
    } catch { seen = true; }
    if (!seen) setTimeout(startTour, 500);
  }

  function endTour(markDone = true) {
    tour.active = false;
    tour.mask.hidden = true;
    tour.hole.hidden = true;
    tour.tip.hidden = true;
    renderCard();
    if (markDone) {
      try {
        localStorage.setItem(TOUR_KEY, '1');
      } catch { /* 无痕模式等场景下忽略 */ }
    }
  }

  tour.mask.addEventListener('click', () => {
    if (tour.index >= TOUR_STEPS.length - 1) endTour();
    else {
      tour.index += 1;
      showTourStep();
    }
  });
  window.addEventListener('resize', () => {
    if (tour.active) placeTour();
  });
  el.tourBtn.addEventListener('click', () => startTour());

  /** 出错时直接把原因写在页面上，方便对方截图反馈，而不是只看到空页面 */
  function showFatal(message) {
    const box = document.createElement('div');
    box.className = 'notice';
    const title = document.createElement('p');
    title.className = 'notice-title';
    title.textContent = '页面出错了';
    const text = document.createElement('p');
    text.textContent = `${message} —— 麻烦把这一屏截图发我，我照着修。`;
    box.append(title, text);
    const host = document.querySelector('.app') || document.body;
    host.prepend(box);
  }

  try {
    load();
    syncInputs();   // 开关的勾选状态要跟着刚读回来的设置走
    syncRange();    // strict 由 range 推出来，load() 之后必须重算一次
    applyFont();
    applyTheme();
    buildConsonants();
    buildVowels();
    buildTones();
    renderSettings();
    applyMode();
    if (state.mode === 'fixed') applyFixed();
    else renderCard();
    refreshVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      setTimeout(refreshVoices, 600);
    }
    maybeStartTour();
  } catch (err) {
    showFatal(`初始化失败：${(err && err.message) || err}`);
    throw err;
  }
})();
