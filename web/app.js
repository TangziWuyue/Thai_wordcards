/**
 * 界面逻辑：词表勾选、随机组合、声调切换、朗读。
 * 规则全部来自 rules.js，这里只做渲染与交互。
 */
(() => {
  'use strict';

  const R = window.ThaiRules;
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

  const state = {
    consonants: new Set(DEFAULT_CONSONANTS),
    vowels: new Set(R.VOWELS.map((v) => v.id)),
    allowClusters: false,
    allowFinal: true,
    allowVowelOnset: false,
    strict: true,
    autoSpeak: false,
    font: 'sarabun',
    theme: 'auto',
    romanSystem: 'latin',
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
    vowelHint: document.getElementById('vowelHint'),
    fontSeg: document.getElementById('fontSeg'),
    themeSeg: document.getElementById('themeSeg'),
    romanSeg: document.getElementById('romanSeg'),
    randomBtn: document.getElementById('randomBtn'),
    speakBtn: document.getElementById('speakBtn'),
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
      const knownVowels = new Set(R.VOWELS.map((v) => v.id));
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
    } catch { /* 数据坏了就用默认值 */ }
  }

  // ── 词表 ────────────────────────────────────────────────────────────
  function chip(content, pressed, title, extraClass, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `chip ${extraClass}` : 'chip';
    if (Array.isArray(content)) btn.append(...content);
    else btn.textContent = content;
    btn.title = title;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildConsonants() {
    el.consonants.replaceChildren();
    for (const cls of ['mid', 'high', 'low']) {
      const row = document.createElement('div');
      row.className = 'row';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = R.CLASS_LABEL[cls];
      row.append(tag);
      for (const c of R.CONSONANTS.filter((x) => x.cls === cls)) {
        const flags = [c.rare && '罕用', c.obsolete && '已废弃'].filter(Boolean);
        const title = [c.ch, R.CLASS_LABEL[cls], c.roman, ...flags].filter(Boolean).join(' · ');
        row.append(chip(c.ch, state.consonants.has(c.ch), title, '', () => {
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
    el.vowels.replaceChildren();
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
        row.append(vowelChip(v));
      }
      el.vowels.append(head, row);
    }
    const counted = R.VOWELS.filter((v) => v.group !== 'variant').length;
    const variants = R.VOWELS.filter((v) => v.group === 'variant').length;
    el.vowelHint.textContent = `${counted} 个 + ${variants} 个变体写法`;
  }

  function vowelChip(v) {
    const notes = [
      `${v.name} · ${v.en}`,
      `拉丁转写 ${v.roman} · 国际音标 ${v.ipa}`,
      v.short ? '短音' : '长音',
      v.example && `例：${v.example}`,
      v.canBeOnset && '可单独作声母',
      !v.allowsFinal && !v.requiresFinal && '不能带尾辅音',
      v.requiresFinal && '必须带尾辅音',
      v.noTone && '不写声调符号',
      v.note,
    ].filter(Boolean);
    return chip(vowelChipContent(v), state.vowels.has(v.id), notes.join(' · '), 'vowel-chip', () => {
      if (state.vowels.has(v.id)) state.vowels.delete(v.id);
      else state.vowels.add(v.id);
      buildVowels();
      save();
    });
  }

  // ── 字体与外观 ──────────────────────────────────────────────────────
  function buildSeg(container, items, current, onPick) {
    container.replaceChildren(...items.map((item) => {
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
    el.tones.replaceChildren(...R.TONES.map((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tone';
      btn.dataset.tone = t.id;
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = t.mark || '—';
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
      el.roman.textContent = '点「随机组合」开始';
      el.parts.replaceChildren();
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

    el.syllable.textContent = info.text;
    const systemLabel = state.romanSystem === 'ipa' ? '国际音标 IPA' : '拉丁转写';
    el.roman.textContent = `/${info.roman}/ · ${systemLabel}，不含声调`;

    const breakdown = [];
    if (info.isVowelOnset) breakdown.push(renderPart('声母', '元音充当声母'));
    else breakdown.push(renderPart('首辅音', `${state.parts.onset} ${info.onsetClassLabel}`));
    if (state.parts.cluster) {
      const cluster = `${state.parts.onset}${state.parts.cluster}`;
      breakdown.push(renderPart('辅音簇', info.clusterNote ? `${cluster}（${info.clusterNote}）` : cluster));
    }
    breakdown.push(renderPart('元音', `${info.vowelName}（${info.vowelLength}）`));
    if (state.parts.final) breakdown.push(renderPart('尾辅音', state.parts.final));
    breakdown.push(renderPart('声调', info.toneName));
    el.parts.replaceChildren(...breakdown);

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
    renderCard();
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

  load();
  applyFont();
  applyTheme();
  buildConsonants();
  buildVowels();
  buildTones();
  renderSettings();
  renderCard();
  refreshVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    setTimeout(refreshVoices, 600);
  }
})();
