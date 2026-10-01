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

  // 内置发音（AI 合成 + 声调校正）：清单里命中就播音频，没命中回退系统语音。
  // audio.js 没加载出来（旧缓存等）时 A 为 null，功能静默回退。
  const A = window.ThaiAudio || null;
  let audioReady = false;

  const FONTS = [
    { id: 'sarabun', label: '标准体', sample: 'ก' },
    { id: 'serif', label: '印刷衬线', sample: 'ข' },
  ];
  const THEMES = [
    { id: 'auto', label: '跟随系统' },
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
  ];
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
    whatsNewBtn: document.getElementById('whatsNewBtn'),
    dictHit: document.getElementById('dictHit'),
    dictList: document.getElementById('dictList'),
    dictMore: document.getElementById('dictMore'),
    dictHint: document.getElementById('dictHint'),
    dictNote: document.getElementById('dictNote'),
    dictSource: document.getElementById('dictSource'),
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
      // 判「有没有存过」而不是「数组非空」：用户点过「全不选」时存的就是空数组，
      // 用长度判断会把他的选择当成没存过、刷新后又恢复成默认全选
      if (Array.isArray(data.consonants)) state.consonants = new Set(cons);
      if (Array.isArray(data.vowels)) state.vowels = new Set(vows);
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
      if (data.mode === 'fixed' || data.mode === 'random') state.mode = data.mode;
      // 固定模式选中的字母也要过白名单：脏数据（改坏的 localStorage）会渲染成
      // 「XYZอ」这种乱码卡片，而且固定模式下没有入口能清掉它
      if (known.has(data.fixedOnset)) state.fixedOnset = data.fixedOnset;
      if (knownVowels.has(data.fixedVowelId)) state.fixedVowelId = data.fixedVowelId;
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
  let longPressBtn = null; // 同时记下是哪个字块长按的——只跳过那一个字块紧跟的 click
  // 上一次按下用的是什么指针。触屏轻点会顺带触发 focus / 合成的 mouseenter，
  // 放大卡片就自己挂住了；鼠标悬停本来就是要看的，所以这里要分得开。
  let lastPointerType = 'mouse';

  function startPress(btn, pointerType) {
    if (pointerType === 'mouse') return; // 鼠标走 mouseenter
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressAt = Date.now();
      longPressBtn = btn;
      showTip(btn);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  function chip(content, pressed, tipData, extraClass, onClick, key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `chip ${extraClass}` : 'chip';
    // 记一下这一块代表哪个字母/元音，syncChipStates() 靠它对号入座
    if (key) btn.dataset.key = key;
    // 字块里的字单独包一层：按下去时只让「字」往下沉一点，不影响选中态的底色
    const inner = document.createElement('span');
    inner.className = 'chip-in';
    if (Array.isArray(content)) inner.append(...content);
    else inner.textContent = content;
    btn.append(inner);
    btn._tipData = tipData;
    btn.setAttribute('aria-label', tipText(tipData));
    btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('mouseenter', () => showTip(btn));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('blur', hideTip);
    btn.addEventListener('pointerdown', (e) => {
      lastPointerType = e.pointerType || 'mouse';
      startPress(btn, e.pointerType);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      btn.addEventListener(type, cancelPress);
    }
    // 手机上长按常常会走 contextmenu，顺手接住：既不弹系统菜单，也把卡片显示出来
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      longPressAt = Date.now();
      longPressBtn = btn;
      showTip(btn);
    });
    btn.addEventListener('click', (e) => {
      // 只吃掉「刚长按过的这个字块」的那一次 click。
      // 不判断是哪个字块的话，长按 A 之后一秒内点 B 也会被吞掉
      if (btn === longPressBtn && Date.now() - longPressAt < 1000) {
        e.preventDefault();
        return;
      }
      // 触屏轻点一下会顺带触发 focus（有的浏览器还有合成的 mouseenter），
      // 放大卡片本来会自己挂在那儿。以前是随后的 buildConsonants()/buildVowels()
      // 顺手收掉的，现在点击不再重建字块了，得在这里自己收（长按那次上面已经 return）。
      if (lastPointerType !== 'mouse') hideTip();
      onClick(e);
    });
    return btn;
  }

  function buildConsonants() {
    hideTip();
    setChildren(el.consonants);
    for (const cls of ['mid', 'high', 'low']) {
      const list = R.CONSONANTS.filter((x) => x.cls === cls);
      // 跟元音那边同一套排法：类别名单独一行，字块在下面整行排。
      // （原来是左边 34px 的竖排标签，字块换行后会缩到标签底下，
      //   两组的字块左边缘也和元音那边差 40px——用户说「电脑上不也对齐下」）
      const head = document.createElement('div');
      head.className = 'chip-group';
      const thaiName = document.createElement('b');
      thaiName.textContent = R.CLASS_THAI[cls];
      const zhName = document.createElement('span');
      zhName.textContent = `${R.CLASS_LABEL[cls]} ${list.length}`;
      head.append(thaiName, zhName);

      const row = document.createElement('div');
      row.className = 'chips';
      const fixed = state.mode === 'fixed';
      for (const c of list) {
        const flags = [c.rare && '罕用', c.obsolete && '已废弃'].filter(Boolean);
        const rows = [
          ['类别', [R.CLASS_LABEL[cls], ...flags].join(' · ')],
          ['罗马注音', c.roman || '—'],
          ['例词', c.example ? `${c.ch} ${c.example}${c.gloss ? `（${c.gloss}）` : ''}` : ''],
        ].filter(([, v]) => v);
        const on = fixed ? state.fixedOnset === c.ch : state.consonants.has(c.ch);
        row.append(chip(c.ch, on, { glyph: c.ch, rows }, '', () => {
          if (fixed) {
            // 固定模式：点一下选它，再点一下取消（可以只留元音，或者什么都不留）
            state.fixedOnset = state.fixedOnset === c.ch ? null : c.ch;
            syncChipStates();
            applyFixed();
            save();
            return;
          }
          if (state.consonants.has(c.ch)) state.consonants.delete(c.ch);
          else state.consonants.add(c.ch);
          syncChipStates();
          save();
        }, c.ch));
      }
      el.consonants.append(head, row);
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
      head.className = 'chip-group';
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
    // 拼装规则放在规则引擎里（R.fixedParts），这里只管画
    const next = R.fixedParts({ onset, vowelId, strict: state.strict });
    if (!next) {
      state.parts = null;
      renderCard();
      return;
    }
    // 之前选过的声调如果还能用就留着，来回换字母时不用重新点
    const prevTone = state.parts ? state.parts.tone : 'none';
    if (prevTone && prevTone !== 'none') {
      const option = R.toneOptions(next, state.strict).find((t) => t.id === prevTone);
      if (option && option.allowed) next.tone = prevTone;
    }
    state.parts = next;
    renderCard();
  }

  // ── 模式切换的衔接动画 ──────────────────────────────────────────────
  // 时间线：卡片内容滑出（SWAP_MS）→ 换内容 → 从另一侧滑入
  const SWAP_MS = 150;

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * 让卡片做一次「滑出 → 换内容 → 滑入」。
   * dir = -1 表示往左走（随机 → 固定），1 表示往右走。
   * 只动 opacity / transform，卡片每行的高度是定死的，所以不会把下面的按钮顶走。
   * 返回定时器 id，调用方需要时可以取消（连点模式按钮时要先把上一次落定）。
   */
  function swapCard(dir, apply, done) {
    const card = el.card;
    if (!card || prefersReducedMotion()) {
      apply();
      if (done) done();
      return null;
    }
    card.style.setProperty('--swap-x', `${dir * -14}px`);
    card.classList.add('swapping');
    return setTimeout(() => {
      // 关掉过渡 → 把入场起点摆到另一侧 → 换内容 → 恢复过渡，让它自己滑回来
      card.classList.add('no-swap-anim');
      card.style.setProperty('--swap-x', `${dir * 14}px`);
      apply();
      void card.offsetWidth; // 强制回流，让上面的起点真的生效
      card.classList.remove('no-swap-anim');
      card.classList.remove('swapping');
      if (done) done();
    }, SWAP_MS);
  }

  /** 模式按钮按一下收一下，给个即时反馈（卡片内容要等一个节拍才换） */
  function pulseModeButton() {
    // 缩的是整条「随机组合 + ⇄」（.split），只缩 ⇄ 那一半会从容器缝里露出直角灰边
    const group = el.modeBtn && el.modeBtn.closest('.split');
    pulseButton(group || el.modeBtn);
  }

  /** 单颗按钮点一下收一下（随机组合 / 播放发音 / 模式切换都用它） */
  function pulseButton(node) {
    if (!node || prefersReducedMotion()) return;
    node.classList.remove('pulse');
    void node.offsetWidth;          // 连点也要能重头跑一次
    node.classList.add('pulse');
    setTimeout(() => node.classList.remove('pulse'), 400);
  }

  /** 提示文案换了内容：淡入一下，别硬切 */
  function flashHint(node) {
    if (!node || prefersReducedMotion()) return;
    node.classList.remove('in');
    void node.offsetWidth;
    node.classList.add('in');
    setTimeout(() => node.classList.remove('in'), 300);
  }

  /**
   * 声调 / 词表字块点一下「字往下沉」。
   * 不能用 CSS 的 :active——它只在「按住」的那一小会儿生效，触控板轻点（tap to click）
   * 那一下就闪一两帧，看上去像没反应（用户拿 MacBook 试出来的）。
   * 改成点击之后自己跑一次动画：轻触、按住都能看到，跟分段控件是同一套节拍。
   */
  function sinkTap(node) {
    if (!node || prefersReducedMotion()) return;
    node.classList.remove('sink');
    void node.offsetWidth;          // 连点同一项也要能重头跑
    node.classList.add('sink');
    setTimeout(() => node.classList.remove('sink'), 300);
  }

  /** 把还没落定的那次卡片过渡立刻做完（连点模式 / 档位时用，免得停在半路） */
  function settleSwap() {
    if (!pendingSwap) return;
    clearTimeout(pendingSwap.timer);
    pendingSwap.apply();
    pendingSwap = null;
  }

  // 动画期间用户又点了：把上一次先落定再开始新的，否则连点会「丢一次」
  // （state.mode 要等动画结束才更新，第二次点会算出同一个目标）
  let pendingSwap = null;

  /** 现在「算哪个模式」——动画没结束时算目标模式，这样连点能正确来回切 */
  function currentMode() {
    // pendingSwap 里带 mode 的才是「模式过渡」；换档位那一种没有这个字段
    return pendingSwap && pendingSwap.mode ? pendingSwap.mode : state.mode;
  }

  function setMode(mode) {
    settleSwap();
    if (mode === state.mode) {
      // 上一次刚被「落定」，这一次等于没动。卡片可能还停在滑出那一帧
      // （半透明 + 位移），这里把样式收干净，别让它卡在看不见的状态
      if (el.card) el.card.classList.remove('swapping');
      return;
    }
    pulseModeButton();
    // 切到固定模式时内容往左走，切回随机时往右走（⇄ 在右边，方向感一致）
    const apply = () => applyModeChange(mode);
    const timer = swapCard(mode === 'fixed' ? -1 : 1, apply, () => { pendingSwap = null; });
    pendingSwap = timer === null ? null : { mode, apply, timer };
  }

  function applyModeChange(mode) {
    state.mode = mode;
    if (mode === 'fixed') {
      // 接着刚才随机出来的那个音节练：把声母和元音带进固定模式
      if (state.parts) {
        state.fixedOnset = state.parts.onset;
        // 只带「词表里真的能勾选」的元音：o_implied（无元音符号的闭音节）在词表里
        // 没有对应字块，带进来会卡成「卡片只显示一个辅音、元音栏什么都没选中」，
        // 而且没有任何入口能清掉（开关在固定模式下是灰的，刷新也还在）。
        // o_long 仍然过滤掉：它是「只选辅音」时的补位元音，用户并没有选过它
        const vid = state.parts.vowelId;
        state.fixedVowelId = (vid !== 'o_long' && SELECTABLE_VOWELS.includes(vid)) ? vid : null;
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
    // 这四项只影响随机组合：固定模式灰掉、选不中（字体/外观、组合范围两种模式都保留）
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
      ['长短', v.short ? '短音' : '长音'],
      ['例词', v.example],
      ['说明', notes.join(' · ')],
    ].filter(([, value]) => value);
    const tipData = { glyph: '', glyphNodes: () => vowelChipContent(v), rows };
    return chip(vowelChipContent(v), on, tipData, 'vowel-chip', () => {
      if (state.mode === 'fixed') {
        // 固定模式：点一下选它，再点一下取消（可以只留辅音，或者什么都不留）
        state.fixedVowelId = state.fixedVowelId === v.id ? null : v.id;
        syncChipStates();
        applyFixed();
        save();
        return;
      }
      if (state.vowels.has(v.id)) state.vowels.delete(v.id);
      else state.vowels.add(v.id);
      syncChipStates();
      save();
    }, v.id);
  }

  /**
   * 只更新字块的选中态，**不重建节点**。
   * 原来点一下就 buildConsonants()/buildVowels() 整列重建：刚点的那一块当场被换掉，
   * 点击动画（.sink）根本没机会播完（用户报「轻触看不到下沉」有一半是这个原因）。
   * 顺便也少了一堆无谓的重排。
   */
  function syncChipStates() {
    const fixed = state.mode === 'fixed';
    for (const btn of el.consonants.querySelectorAll('.chip')) {
      const ch = btn.dataset.key;
      btn.setAttribute('aria-pressed', String(fixed ? state.fixedOnset === ch : state.consonants.has(ch)));
    }
    for (const btn of el.vowels.querySelectorAll('.chip')) {
      const id = btn.dataset.key;
      btn.setAttribute('aria-pressed', String(fixed ? state.fixedVowelId === id : state.vowels.has(id)));
    }
  }

  // ── 字体与外观 ──────────────────────────────────────────────────────
  // 分段控件（含滑块）在 web/seg.js 里，教学页共用同一份
  const buildSeg = Seg.build;

  function applyFont() {
    document.documentElement.dataset.font = state.font;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }

  function renderSettings() {
    buildSeg(el.fontSeg, FONTS, state.font, (id) => {
      // 换字体会让整页重新排版（泰文宽窄变了、换行位置跟着变），锚住控件别让页面跳
      Seg.keepAnchored(el.fontSeg, () => {
        state.font = id;
        applyFont();
        // 只改选中态，不重建按钮：滑块才会「滑过去」，也不会有一次重绘闪烁
        Seg.select(el.fontSeg, id);
      });
      Seg.pulse(el.fontSeg, id);
      save();
    });
    buildSeg(el.themeSeg, THEMES, state.theme, (id) => {
      Seg.keepAnchored(el.themeSeg, () => {
        state.theme = id;
        applyTheme();
        Seg.select(el.themeSeg, id);
      });
      Seg.pulse(el.themeSeg, id);
      save();
    });
    buildSeg(el.rangeSeg, RANGES, state.range, (id) => {
      // 状态和按钮立刻更新：过渡那 150ms 里按空格随机、或者刷新，都得按新档位来
      state.range = id;
      syncRange();
      // 提示行讲的是「这一档怎么拼」，必须当场跟着换；
      // 之前只有 renderSettings() 末尾和词库加载完才调，切档后提示会停在上一档
      applyRangeHint();
      // 选到「常用词」就顺手把词表取回来，不然第一次点随机组合还得现等；
      // 取完（或失败）都要重画一次提示，因为提示文案跟「词库好没好」有关
      if (id === 'common') {
        D.loadWords().catch(() => { /* 取不到就退回普通随机，提示里会说明 */ })
          .then(() => applyRangeHint());
      }
      // 只改选中态（不重建），滑块滑过去 + 选中的那个收一下
      Seg.select(el.rangeSeg, id);
      Seg.pulse(el.rangeSeg, id);
      flashHint(el.rangeHint);
      save();
      // 卡片也跟着变（声调按钮哪些能用、固定模式要不要用 อ 补位），走一遍卡片过渡：
      // dir = 0 → 只淡出淡入，不左右滑（左右滑是「换模式」的语汇）
      settleSwap();
      const apply = () => {
        if (state.mode === 'fixed') applyFixed();
        else renderCard();
      };
      const timer = swapCard(0, apply, () => { pendingSwap = null; });
      pendingSwap = timer === null ? null : { apply, timer };
    });
    // 放在最后统一调：buildSeg 会重建按钮、把 disabled 清零，
    // 字体/主题那两个 onPick 也会走到这里，不补这一下「常用词」在固定模式下的禁用态就丢了
    applyRangeHint();
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
    // 常用词档要靠词库；词库没加载出来时不能再承诺「一定是真实存在的词」，
    // 否则页面会一边说要出真词、一边全出无义音节，还一个字都不解释
    const offline = state.range === 'common' && !fixed && !D.ready();
    el.rangeHint.textContent = offline
      ? '词库没加载出来：暂时按普通音节拼，联网后重开本页即可'
      : RANGE_HINT[state.range][fixed ? 'fixed' : 'random'];
    // 「常用词」只对随机组合有意义（固定模式是手动挑字母），灰掉但保留选择，
    // 切回随机模式还是这一档
    const commonBtn = [...el.rangeSeg.children].find((b) => b.dataset.id === 'common');
    if (commonBtn) {
      commonBtn.disabled = fixed;
      commonBtn.title = fixed ? '固定模式下不适用（常用词只影响随机组合）' : '';
    }
    el.optionsHint.textContent = fixed
      ? '固定模式只用到字体和外观；灰掉的几项只对随机组合生效'
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
    Seg.sync(el.tones);
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

  /** 和 renderPart 一样，但值可以是节点——用来放「อ + 声调符号」这种组合 */
  function renderPartNodes(label, ...valueNodes) {
    const span = document.createElement('span');
    span.append(`${label} `);
    const b = document.createElement('b');
    b.append(...valueNodes);
    span.append(b);
    return span;
  }

  /**
   * 往卡片上放泰文。字号按字数缩：7 个码点的长组合在窄卡片上会折成两行，
   * 一折行卡片高度就翻倍、整页跟着跳，所以字越多缩得越小，永远占一行。
   * （样式的字号写成 calc(基础字号 * var(--syl-scale))，见 style.css）
   */
  function setSyllable(text) {
    el.syllable.textContent = text;
    const len = [...text].length;
    el.syllable.style.setProperty('--syl-scale', len >= 5 ? String((4 / len).toFixed(3)) : '1');
  }

  function renderCard() {
    normalizeTone();

    if (!state.parts) {
      state.commonFallback = false;
      // 辞典里点过来的词优先；没有就摆打招呼那个词
      const entry = state.word ? D.lookup(state.word) : null;
      setSyllable(state.word || GREETING.text);
      el.roman.textContent = state.word
        ? `/${(entry && entry[1]) || '—'}/ · 罗马注音`
        : `/${GREETING.roman}/ · 罗马注音`;
      const hint = document.createElement('span');
      if (state.word) hint.textContent = '来自辞典 · 点「随机组合」回到随机练习';
      else if (state.mode === 'fixed') hint.textContent = '固定模式：点下面的字母，选一个辅音和/或一个元音';
      else hint.textContent = '点「随机组合」开始';
      // 辞典点过来的词：把它的实际读音一并写出来（拼写 ≠ 读音的那种词最需要这一行）
      if (entry && entry[6]) {
        setChildren(el.parts, renderPart('读音', entry[6]), hint);
      } else {
        setChildren(el.parts, hint);
      }
      el.toneHint.textContent = '';
      updateDictHit();
      for (const btn of el.tones.querySelectorAll('button')) {
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'false');
        btn.title = '';
      }
      Seg.sync(el.tones);
      return;
    }

    // 注音只用罗马注音（国际音标已经从界面上去掉了，引擎里还留着数据与函数）
    const info = R.describe(state.parts, state.strict, 'latin');
    // 关闭规则检查时允许生成「规则上不合法」的组合，这种情况不算异常
    // 固定模式选到「必须带尾辅音」的元音（ั เ-ิ เ-็）拼出来不完整是设计里的已知情况，
    // 卡片上有提示说明，不用再往控制台打警告——打出来会淹没真正的问题
    const knownIncomplete = state.mode === 'fixed'
      && info.issues.length > 0
      && info.issues.every((one) => one.indexOf('必须带尾辅音') !== -1);
    if (info.issues.length && state.strict && !knownIncomplete) {
      console.warn('组合自检异常', info.issues, info.text);
    }

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
      // 这条分支不走 setSyllable，得自己把缩放值复位，
      // 否则会留着上一个长音节的比例，一个符号被缩得明显偏小
      el.syllable.style.setProperty('--syl-scale', '1');
    } else {
      setSyllable(info.text);
    }
    // อ 之类的字母在罗马注音里本来就没有对应写法，显示成 — 而不是空斜杠
    el.roman.textContent = `/${info.roman || '—'}/ · 罗马注音，不含声调`;

    // 这一行是给零基础看的，用大白话：声母 / 元音 / 尾音 / 声调。
    // 原来的「首辅音 ค 低类 · 元音 สระ ออ（长音）· 尾辅音 ก · 标 อ๋ → 读第4调 ตรี」术语太密：
    // 首辅音→声母（中文里现成的说法）、低类→低辅音（说明这是哪一类）、
    // สระ 是泰语的「元音」，前面已经写了「元音」就不用再重复、尾辅音→尾音
    const breakdown = [];
    if (info.isVowelOnset) breakdown.push(renderPart('声母', '没有，这个元音自己当声母'));
    else {
      // 「中类」+「辅音」= 中类辅音念着别扭，这里写「中辅音」
      const cls = { mid: '中', high: '高', low: '低' }[info.onsetClass] || '';
      breakdown.push(renderPart('声母', cls ? `${state.parts.onset}（${cls}辅音）` : state.parts.onset));
    }
    if (state.parts.cluster) {
      const cluster = `${state.parts.onset}${state.parts.cluster}`;
      breakdown.push(renderPart('辅音簇', info.clusterNote ? `${cluster}（${info.clusterNote}）` : cluster));
    }
    // 关闭拼写规则时会用到「无元音」这个内部项，这时不显示元音那一栏
    if (state.parts.vowelId !== 'none') {
      breakdown.push(renderPart('元音', `${info.vowelName.replace(/^สระ\s*/, '')}（${info.vowelLength}）`));
    }
    if (state.parts.final) breakdown.push(renderPart('尾音', state.parts.final));
    // 声调这一行要回答「实际读第几调」——写什么符号只是手段。
    // 低辅音 + 长元音 + ้（比如 รู้）写的是 โท，读出来却是 ตรี，只显示符号名会误导
    // 这个拼写如果正好是个真词、而它的实际读音跟拼写不一样（ไทย 读 ไท、สัตว์ 读 สัด），
    // 就把实际读音补一行。数据来自维基词典的 Phonemic 字段
    const dictEntry = D.lookup(R.assemble(state.parts));
    // 词表里带 IPA 的真词：以 IPA 的声调为准。英语借词（บอส=老板、แอป=app、เคส=case…）
    // 一律读第 4 调，拼写规则算出来是第 2/3 调，这类例外必须标出来
    const ipaTone = dictEntry && dictEntry[7] ? R.toneFromIPA(dictEntry[7]) : null;
    // 声调符号是组合符号，直接写进文字里会浮在右上角、看着像一条孤零零的横杠。
    // 和声调按钮一个做法：垫一个 อ 当底座，符号就落在正常位置
    const toneNodes = [];
    if (state.parts.tone === 'none') {
      toneNodes.push('不写 ');
    } else {
      toneNodes.push('写 ');
      const base = document.createElement('span');
      base.className = 'ghost-base';
      base.textContent = 'อ';
      base.setAttribute('aria-hidden', 'true');
      toneNodes.push(base, R.toneMark(state.parts.tone), ' ');
    }
    if (!info.spokenTone) {
      toneNodes.push(info.toneName);
    } else if (ipaTone && ipaTone !== info.spokenTone) {
      // 借词这类词级例外：以词典 IPA 为准，同时把规则算出来的也写出来
      toneNodes.push(`→ 实际读第${ipaTone}调（按规则应该第${info.spokenTone}调）`);
    } else {
      toneNodes.push(`→ 读第${info.spokenTone}调`);
    }
    breakdown.push(renderPartNodes('声调', ...toneNodes));
    if (dictEntry && dictEntry[6]) breakdown.push(renderPart('读音', dictEntry[6]));
    setChildren(el.parts, ...breakdown);

    const disabledReasons = [];
    for (const btn of el.tones.querySelectorAll('button')) {
      const opt = info.tones.find((t) => t.id === btn.dataset.tone);
      btn.disabled = !opt.allowed;
      btn.setAttribute('aria-pressed', String(state.parts.tone === opt.id));
      btn.title = opt.allowed ? `${opt.name}${opt.mark ? ` ${opt.mark}` : ''}` : opt.reason;
      if (!opt.allowed && !disabledReasons.includes(opt.reason)) disabledReasons.push(opt.reason);
    }
    // 声调那一排的滑块跟着走（切换声调时它会滑过去）
    Seg.sync(el.tones);
    // 提示行：规则问题 > 声调原因 > 常用词兜底
    const hints = [];
    if (state.strict && info.issues.length) {
      // 固定模式没有尾辅音可选，像 ั / เ-ิ / เ-็ 这类「必须带尾辅音」的元音
      // 单独选出来就拼不成完整音节——这件事必须写出来，光在控制台警告用户看不见
      const needsFinal = info.issues.includes('该元音必须带尾辅音');
      hints.push(state.mode === 'fixed' && needsFinal
        ? '这个元音必须带尾辅音，固定模式拼不完整，换一个元音'
        : info.issues.join('；'));
    }
    if (disabledReasons.length) {
      // 规则检查现在是「组合范围」三档控件管的，它不在「选项」面板里——
      // 旧文案指向了一个已经不存在的开关，用户翻遍选项也找不到
      hints.push(`${disabledReasons.join('；')}（组合范围切到「任意」即不限）`);
    }
    if (state.commonFallback) {
      hints.push('词表里没抽到常用词，先给普通音节，多勾几个字母更容易中');
    }
    el.toneHint.textContent = hints.join('；');
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
    const mark = (text_, className) => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text_;
      return span;
    };
    // 不是真词也标一下，跟「真词」对称：看到「无义」就知道这个拼写泰语里不成立
    if (!D.isWord(text)) {
      el.dictHit.append(mark('无义', 'dh-mark plain'));
      return;
    }
    el.dictHit.append(mark('真词', 'dh-mark'));
    // 有释义就摆释义（这正是这个提示的意义）；没有就只留「真词」两个字，
    // 不要再写「常用词表未收录」那种解释——那是给开发者看的，不是给学的人看的
    if (entry && entry[2]) {
      const zh = document.createElement('span');
      zh.className = 'dh-zh';
      zh.textContent = entry[2];
      el.dictHit.append(zh);
    } else if (entry && entry[5]) {
      // 中文词表没收录这个词，退回英文释义——标一下「英文」，别让人以为是中文没写好
      const en = document.createElement('span');
      en.className = 'dh-en';
      en.textContent = entry[5];
      el.dictHit.append(mark('英文', 'dh-pos'), en);
    } else {
      // 真是泰语词，但两套词表都没给释义，明确写出来，别让人以为界面坏了
      el.dictHit.append(mark('无释义', 'dh-pos'));
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
  }

  /** 索引没加载好时不显示结论，加载完再重绘一次当前卡片 */
  function updateDictHit() {
    if (A) A.warm(currentText());   // 提前缓冲当前词的发音（没有就算了）
    if (D.isWord(currentText()) === null) {
      // 这一行始终占位（见 style.css 里的 min-height），内容空着也不会让页面跳
      setChildren(el.dictHit);
      D.loadIndex()
        .then(() => {
          renderDictHit();
          // 首屏这条异步路径也要重画一次提示：初始化时 applyRangeHint() 跑在前面，
          // 那时词库还没就绪，「常用词」档会被写成降级文案，不补这一下就永远不会自愈
          // （单文件版明明离线可用，却一直说「联网后重开本页」）
          applyRangeHint();
        })
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
    // 点辞典里的词就直接发音（有内置音频时）
    if (A && A.has(word)) A.play(word).catch(() => { /* 浏览器拒绝播放时静默 */ });
    el.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function ensureDict() {
    if (dictLoaded) return;
    // 取词库期间先占好位置，免得内容到货时把面板顶高、跟展开动画打架
    el.dictList.classList.add('loading');
    D.loadWords()
      .then(() => {
        dictLoaded = true;
        renderDictBatch();
        el.dictList.classList.remove('loading');
        el.dictNote.textContent = D.note();
        el.dictSource.textContent = D.source();
        applyRangeHint(); // 词库好了，「常用词」档的提示要从降级文案切回来
      })
      .catch(() => {
        el.dictList.classList.remove('loading');
        el.dictList.textContent = '';
        el.dictNote.textContent = '词库没加载出来：这部分数据要联网取，检查网络后重新打开本页。';
        el.dictSource.textContent = '';
        applyRangeHint();
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
    Seg.pulse(el.tones, id);   // 选中的那个声调也收一下
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
      setSyllable('—');
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
      setSyllable('—');
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
    if (audioReady) {
      const n = (window.ThaiAudioData && window.ThaiAudioData.count) || 0;
      el.voiceInfo.textContent = n
        ? `语音：内置发音 ${n} 条（AI 合成）`
        : '语音：内置发音（AI 合成）';
      el.voiceInfo.title = '真词（含辞典里的词）用内置发音；随机生成的无义音节回退到本机系统语音。';
      return;
    }
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

  /** 系统语音兜底：内置音频里没有这个词时用；没装泰语语音就把原因写在页脚 */
  function fallbackSpeak(text) {
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

  /** 朗读一段泰文：优先内置音频（AI 合成 + 声调校正），没有就回退系统语音 */
  function speakText(text) {
    if (!text) return;
    if (A && A.has(text)) {
      A.play(text).catch(() => fallbackSpeak(text));
      return;
    }
    if (A && !audioReady) {
      // 清单还没加载完：等它一下，命中就播，否则用系统语音
      A.ready().then((ok) => {
        audioReady = ok;
        refreshVoices();
        if (ok && A.has(text)) A.play(text).catch(() => fallbackSpeak(text));
        else fallbackSpeak(text);
      });
      return;
    }
    fallbackSpeak(text);
  }

  function speak() {
    speakText(currentText());
  }

  // ── 面板展开 / 收起的衔接 ───────────────────────────────────────────
  // <details> 是瞬间展开的，这里手动接管：只动 .panel-body 的 height，
  // 收起时等动画走完再真正 open=false。
  //
  // 为什么不用 max-height（上一版就是那么写的）：max-height 只是个上限，
  // 目标值一旦量得比真实高度大（词库是展开后才联网取的、泰文字体也可能晚到），
  // 动画会在「空气」里白滑一段，结尾再「啪」地跳到真实高度——就是用户说的「结尾卡顿」。
  // 现在直接量真实高度，动画结束后再核对一次：这 190ms 里长高的那截单独补一段滑完。
  const PANEL_MS = 190;   // 最短时长（小面板）；长面板按高度往上加，见下面的 dur
  const panelState = new WeakMap();

  function panelFinish(body) {
    body.style.height = '';
    body.style.paddingTop = '';
    body.style.paddingBottom = '';
    body.style.overflow = '';
    body.style.willChange = '';
  }

  function togglePanel(panel) {
    const body = panel.querySelector('.panel-body');
    if (!body || prefersReducedMotion() || typeof body.animate !== 'function') {
      panel.open = !panel.open;
      return;
    }
    // 连点时先把上一次没走完的收尾做掉，别让两个动画叠在一起
    const pending = panelState.get(panel);
    if (pending) pending();

    // .panel-body 上下有 padding（4px / 20px）。全站 box-sizing 是 border-box，
    // 而 border-box 的高度**压不过 padding**——只把 height 动到 0，盒子会停在 24px
    // 高下不去，动画尾巴空转两帧、收尾再「啪」地消失。逐帧量过：高度序列 87 → 77 → 77 → 53，
    // 那两帧停住 + 最后 24px 的跳变就是用户说的「卡一下」。所以 padding 要跟着一起动。
    const cs = getComputedStyle(body);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;

    const opening = !panel.open;
    const from = opening ? 0 : body.getBoundingClientRect().height;
    if (opening) panel.open = true;   // 先让它显示出来，才量得到目标高度
    body.style.overflow = 'hidden';
    body.style.willChange = 'height';
    // 目标高度必须在不被约束的状态下量（scrollHeight 含 padding，跟 height 的取值口径一致）
    const to = opening ? body.scrollHeight : 0;
    body.style.height = `${from}px`;
    body.style.paddingTop = `${opening ? 0 : padTop}px`;
    body.style.paddingBottom = `${opening ? 0 : padBottom}px`;

    const shrunk = { height: '0px', paddingTop: '0px', paddingBottom: '0px' };
    const full = { height: `${to}px`, paddingTop: `${padTop}px`, paddingBottom: `${padBottom}px` };
    // 缓动别用「起步就冲」的那种：词表展开一次要动 670px，前 10ms 就吃掉四分之一，
    // 看着像直接跳过去。改成两头慢、中间快；长面板再按高度多给一点时间。
    const dur = Math.round(Math.min(300, Math.max(PANEL_MS, 150 + to / 5)));
    const anim = body.animate(
      opening ? [shrunk, full] : [full, shrunk],
      { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    );

    const settle = () => {
      anim.cancel();
      panelState.delete(panel);
      panelFinish(body);
      if (!opening) panel.open = false;   // 收完了才真正关掉
    };

    anim.onfinish = () => {
      const grown = opening ? body.scrollHeight : 0;
      settle();
      // 动画期间内容又长高了（词库到货 / 字体晚到）：补一小段，别硬跳
      if (opening && grown - to > 1) {
        body.style.overflow = 'hidden';
        const extra = body.animate(
          [{ height: `${to}px` }, { height: `${grown}px` }],
          { duration: 130, easing: 'ease-out' }
        );
        extra.onfinish = () => { extra.cancel(); body.style.overflow = ''; };
      }
    };
    panelState.set(panel, settle);
  }

  function setupPanels() {
    for (const panel of document.querySelectorAll('details.panel')) {
      const summary = panel.querySelector('summary');
      if (!summary) continue;
      summary.addEventListener('click', (event) => {
        event.preventDefault();   // 默认行为是瞬间展开，这里自己来
        // 辞典面板要先把词库的占位高度加上再展开：<details> 的 toggle 事件是异步派发的，
        // 等它去触发 ensureDict() 就晚了，动画量到的会是「空面板」的高度（会先滑一半再跳一下）
        if (panel.id === 'dictPanel' && !panel.open) ensureDict();
        togglePanel(panel);
      });
    }
  }

  // ── 绑定 ────────────────────────────────────────────────────────────
  el.randomBtn.addEventListener('click', () => { pulseButton(el.randomBtn); randomize(); });
  el.speakBtn.addEventListener('click', () => { pulseButton(el.speakBtn); speak(); });
  el.consAll.addEventListener('click', () => setAllConsonants(true));
  el.consNone.addEventListener('click', () => setAllConsonants(false));
  el.vowelAll.addEventListener('click', () => setAllVowels(true));
  el.vowelNone.addEventListener('click', () => setAllVowels(false));
  el.modeBtn.addEventListener('click', () => setMode(currentMode() === 'fixed' ? 'random' : 'fixed'));

  // 声调 / 词表字块：点一下让「字」沉一下。挂在捕获阶段，
  // 免得被字块自己的长按拦截（那条会 preventDefault）影响
  document.addEventListener('click', (event) => {
    const target = event.target;
    const node = target && target.closest ? target.closest('.tone, .chip') : null;
    if (node) sinkTap(node);
  }, true);

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
      // 固定模式下「随机组合」是灰的：空格这一下不该有按压反馈，也不该换音节。
      // 鼠标点它被 disabled 挡住了，但键盘这条是自己接的，得单独拦一次（用户报过）。
      if (el.randomBtn.disabled) return;
      pulseButton(el.randomBtn);   // 空格也当按了一次「随机组合」
      randomize();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pulseButton(el.speakBtn);
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
      text: '点「随机组合」生成音节。标「真词」的是真实存在的词。',
    },
    {
      sel: '.split',
      title: '随机 / 固定',
      text: '左边换一个，右边切固定模式自己点字母拼；下面选组合范围。',
    },
    {
      sel: '.tones',
      title: '声调',
      text: '点一下换声调，灰色表示用不上。',
    },
    {
      sel: '#consonants',
      title: '词表',
      text: '勾选要练的字母，悬停（手机长按）看读音和例词。',
    },
    {
      sel: '#dictPanel',
      title: '辞典',
      text: '常用词一次看几个，点词就放到主卡片上。',
      before: () => { el.dictPanel.open = true; ensureDict(); },
    },
    {
      sel: '.head-link',
      title: '拼读教学',
      text: '字母、元音、尾辅音、声调怎么读，这里逐条讲，还有发音讲解。',
    },
  ];

  // 引导本体在 web/tour.js（教学页共用同一份）
  let tourPrevMode = state.mode;
  const tour = Tour.create({
    steps: TOUR_STEPS,
    storageKey: TOUR_KEY,
    onStart: () => {
      tourPrevMode = state.mode;
      hideTip();
    },
    onEnd: () => {
      // 万一以后加了「会切模式」的演示步骤，退出时统一切回来：
      // 从中间某步点「跳过」就直接退出了，只写在最后一步的 before 里不够
      if (state.mode !== tourPrevMode) setMode(tourPrevMode);
      renderCard();
      maybeShowWhatsNew();
    },
  });

  /** 第一次打开时自动走一遍引导；在页脚点「新手引导」可以随时重看 */
  function maybeStartTour() {
    // 顺序是：先走新手引导，结束之后再弹「更新内容」（onEnd 里接着调）。
    // 引导已经看过（或 localStorage 不可用）就直接弹更新通知。
    if (!tour.maybeAutoStart()) maybeShowWhatsNew();
  }

  el.tourBtn.addEventListener('click', () => tour.start());

  // ── 更新内容通知 ────────────────────────────────────────────────────
  // 新手引导走完之后弹一次；看过就记下来，之后只在页脚留个入口。
  // 发新版时改 WHATS_NEW.version（用版本号当 key，所以每版只会弹一次）。
  const WHATS_NEW_KEY = 'thai-wordcards.whatsNew';
  const WHATS_NEW = {
    // 版本号同时是 localStorage 的 key：改它老用户才会再看到一次通知。
    version: '3.0.0',
    items: [
      '切换「组合范围」（任意 / 按规则 / 常用词）时，下面的说明会立刻跟着换了。',
      '全量穷举、压力测试和真实浏览器点击复测后的其他修正；教学页内容与外部资料核对无误。',
    ],
  };

  const wn = {
    mask: document.createElement('div'),
    box: document.createElement('div'),
    showing: false,
  };
  wn.mask.className = 'wn-mask';
  wn.box.className = 'wn-box';
  wn.mask.hidden = true;
  wn.mask.append(wn.box);
  document.body.append(wn.mask);

  function showWhatsNew() {
    const title = document.createElement('h4');
    title.append(`更新内容 · ${WHATS_NEW.version}`);
    const list = document.createElement('ul');
    for (const item of WHATS_NEW.items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
    const actions = document.createElement('div');
    actions.className = 'wn-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = '知道了';
    ok.addEventListener('click', () => closeWhatsNew(true));
    actions.append(ok);
    setChildren(wn.box, title, list, actions);
    wn.mask.hidden = false;
    wn.showing = true;
  }

  function closeWhatsNew(markSeen = true) {
    wn.mask.hidden = true;
    wn.showing = false;
    if (markSeen) {
      try {
        localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW.version);
      } catch { /* 无痕模式等场景下忽略 */ }
    }
  }

  function maybeShowWhatsNew() {
    if (wn.showing || tour.active) return;
    let seen = false;
    try {
      seen = localStorage.getItem(WHATS_NEW_KEY) === WHATS_NEW.version;
    } catch { seen = true; }
    if (!seen) showWhatsNew();
  }

  wn.mask.addEventListener('click', (event) => {
    // 点遮罩也算看过，但点卡片本身不关
    if (event.target === wn.mask) closeWhatsNew(true);
  });
  document.addEventListener('keydown', (event) => {
    if (wn.showing && event.key === 'Escape') closeWhatsNew(true);
  });
  el.whatsNewBtn.addEventListener('click', () => showWhatsNew());

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
    // 从教学页的搜索框点过来的词（?word=ใช่）：直接摆到卡片上。
    // 词是辞典里的整词，跟固定模式「自己挑字母」不是一回事，所以顺手切回随机模式
    const sharedWord = (new URLSearchParams(location.search).get('word') || '').trim();
    if (sharedWord) {
      state.word = sharedWord;
      state.mode = 'random';
      // 词库是异步取的：现在先画一次（没有词库时注音会显示成「—」），
      // 等它到了再画一次，注音和释义才齐全
      D.loadWords().then(() => renderCard()).catch(() => { /* 取不到就只显示词形 */ });
    }
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
    // 内置发音清单：加载成功后页脚改报「内置发音 N 条」
    if (A) {
      A.ready().then((ok) => {
        audioReady = ok;
        refreshVoices();
      });
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      setTimeout(refreshVoices, 600);
    }
    // 跳到教学页时先淡出一下，别硬切（pagefx.js，两边共用）
    if (window.PageFX) window.PageFX.setup();
    // 词表 / 辞典 / 选项三个面板的展开收起动画
    setupPanels();
    maybeStartTour();
  } catch (err) {
    showFatal(`初始化失败：${(err && err.message) || err}`);
    throw err;
  }
})();
