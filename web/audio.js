/**
 * 单词发音播放器。
 *
 * 优先播放内置音频（AI 合成 + 声调校正，见 data/audio.js 清单）；
 * 清单里没有这个词（比如随机生成的无义音节）时抛错，由调用方回退到系统语音。
 *
 * 纯逻辑 + 一个 Audio 元素，不碰界面；双击打开（file://）时按需注入 data/audio.js。
 */
(function (global) {
  'use strict';

  const SRC = 'data/audio.js';
  let data = null;
  let loadPromise = null;
  const els = new Map();   // word -> HTMLAudioElement

  function inject(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = () => resolve();
      tag.onerror = () => reject(new Error(`音频清单加载失败：${src}`));
      document.head.append(tag);
    });
  }

  /** 加载清单（只加载一次）。单文件版已内联时直接可用。 */
  function load() {
    if (!loadPromise) {
      loadPromise = (global.ThaiAudioData ? Promise.resolve() : inject(SRC))
        .then(() => {
          const raw = global.ThaiAudioData;
          if (!raw || !raw.words) throw new Error('音频清单格式不对');
          data = raw;
          return data;
        })
        .catch((err) => {
          loadPromise = null;   // 失败后允许重试
          throw err;
        });
    }
    return loadPromise;
  }

  function info(word) {
    return (data && word && data.words[word]) || null;
  }

  function has(word) {
    return !!info(word);
  }

  function url(word) {
    const it = info(word);
    return it ? data.dir + it[0] : null;
  }

  /** 播放；清单里没有这个词时 reject（调用方回退到系统语音）。 */
  function play(word) {
    return load().then(() => {
      const u = url(word);
      if (!u) throw new Error(`没有内置发音：${word}`);
      let el = els.get(word);
      if (!el) {
        el = new Audio(u);
        el.preload = 'auto';
        els.set(word, el);
      }
      // 只允许一个词在响：把其他的停掉
      for (const [w, other] of els) {
        if (w !== word && !other.paused) other.pause();
      }
      el.currentTime = 0;
      return el.play();
    });
  }

  /** 预加载（不播放），给「换一个」提前缓冲用。 */
  function warm(word) {
    if (!word) return;
    load().then(() => {
      const u = url(word);
      if (!u || els.has(word)) return;
      const el = new Audio(u);
      el.preload = 'auto';
      els.set(word, el);
    }).catch(() => { /* 清单没加载出来就静默 */ });
  }

  /** 清单是否可用（加载成功返回 true）。 */
  function ready() {
    return load().then(() => true, () => false);
  }

  global.ThaiAudio = { load, play, warm, has, info, url, ready };
})(typeof window !== 'undefined' ? window : globalThis);
