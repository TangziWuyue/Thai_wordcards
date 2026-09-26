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

  // 默认勾选全部辅音，只留 ฃ ฅ 这两个废弃字母让人手动开
  const DEFAULT_CONSONANTS = R.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  // 词表里能勾选的元音（排除「无元音」这种只在固定模式内部使用的项）
  const SELECTABLE_VOWELS = R.VOWELS.filter((v) => !v.internal).map((v) => v.id);

  const state = {
    consonants: new Set(DEFAULT_CONSONANTS),
    vowels: new Set(SELECTABLE_VOWELS),
    allowClusters: false,
    allowFinal: true,
    allowVowelOnset: false,
    strict: true,
    autoSpeak: false,
    font: 'sarabun',
    theme: 'auto',
    romanSystem: 'latin',
    // 'random' = 随机组合；'fixed' = 自己挑一个辅音 / 一个元音来拼读
    mode: 'random',
    fixedOnset: null,
    fixedVowelId: null,
    parts: null,
  };

  const el = {
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
    strictHint: document.getElementById('strictHint'),
    rowClusters: document.getElementById('rowClusters'),
    rowFinal: document.getElementById('rowFinal'),
    rowVowelOnset: document.getElementById('rowVowelOnset'),
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
    optStrict: document.getElementById('optStrict'),
    optAutoSpeak: document.getElementById('optAutoSpeak'),
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
        strict: state.strict,
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
      if (typeof data.strict === 'boolean') state.strict = data.strict;
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
      const inGroup = R.VOWELS.filter((v) => v.group === group.id);
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
    const counted = R.VOWELS.filter((v) => !v.internal && v.group !== 'variant').length;
    const variants = R.VOWELS.filter((v) => v.group === 'variant').length;
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
      [el.rowAutoSpeak, el.optAutoSpeak],
    ];
    for (const [row, input] of randomOnly) {
      input.disabled = fixed;
      row.classList.toggle('off', fixed);
      row.title = fixed ? '固定模式下不适用（只影响随机组合）' : '';
    }
    el.optionsHint.textContent = fixed
      ? '固定模式只用到字体、音标、外观和拼写规则；灰掉的几项只对随机组合生效'
      : '';
    // 「遵守拼写规则」后面那句话跟着模式换：随机模式讲声调限制，固定模式讲补位
    el.strictHint.textContent = fixed
      ? '单选元/辅音时用อ补位'
      : '禁用该组合用不上的声调';
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
      el.syllable.textContent = '—';
      el.roman.textContent = state.mode === 'fixed'
        ? '固定模式：点下面的字母，选一个辅音和/或一个元音'
        : '点「随机组合」开始';
      setChildren(el.parts);
      el.toneHint.textContent = '';
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
  }

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
    const vowelOnsetAvailable = state.allowVowelOnset
      && R.VOWELS.some((v) => v.canBeOnset && state.vowels.has(v.id));
    if (!state.vowels.size || (!state.consonants.size && !vowelOnsetAvailable)) {
      state.parts = null;
      renderCard();
      el.syllable.textContent = '—';
      el.roman.textContent = '请先在词表里至少勾选一个辅音和一个元音';
      return;
    }
    const parts = R.generate({
      consonants: [...state.consonants],
      vowels: [...state.vowels],
      allowClusters: state.allowClusters,
      allowFinal: state.allowFinal,
      allowVowelOnset: state.allowVowelOnset,
      strict: state.strict,
    });
    if (!parts) {
      // 清掉上一张卡，避免「卡片上还留着上一个音节的字形」和提示互相矛盾
      state.parts = null;
      renderCard();
      el.syllable.textContent = '—';
      el.roman.textContent = '当前词表组不出音节，试试多勾几个字母';
      return;
    }
    state.parts = parts;
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
    if (thaiVoice) el.voiceInfo.textContent = `语音：${thaiVoice.name}（${thaiVoice.lang}）`;
    else if (voices.length) el.voiceInfo.textContent = '语音：未找到泰语语音，朗读会不准';
    else el.voiceInfo.textContent = '语音：加载中…';
  }

  function speak() {
    if (!state.parts) return;
    if (!('speechSynthesis' in window)) {
      el.voiceInfo.textContent = '语音：当前浏览器不支持朗读';
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(R.assemble(state.parts));
    utter.lang = 'th-TH';
    utter.rate = 0.75;
    if (thaiVoice) utter.voice = thaiVoice;
    window.speechSynthesis.speak(utter);
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
    [el.optAutoSpeak, 'autoSpeak'],
  ];
  for (const [input, key] of bindings) {
    input.checked = state[key];
    input.addEventListener('change', () => {
      state[key] = input.checked;
      save();
    });
  }
  el.optStrict.checked = state.strict;
  el.optStrict.addEventListener('change', () => {
    state.strict = el.optStrict.checked;
    // 固定模式下这个开关决定要不要补 อ，得重新拼一遍，不能只重绘卡片
    if (state.mode === 'fixed') applyFixed();
    else renderCard();
    save();
  });

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
  } catch (err) {
    showFatal(`初始化失败：${(err && err.message) || err}`);
    throw err;
  }
})();
