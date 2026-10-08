/**
 * 发音播放器。
 *
 * 两种音频：
 *   · 单词 —— 按 data/audio.js 清单里的词查文件（load / has / play / url）；
 *   · 音节 —— 固定模式全组合的 syl/v1/{key}.mp3，文件名由 rules.js 的 soundKey
 *     直接算出来、没有清单，用 playUrl / fileUrl 播（教学页的字母发音也走这条）。
 * 清单里没有的词 / 没有音频的组合，调用方自己决定按钮灰不灰。
 *
 * 纯逻辑 + 若干 Audio 元素，不碰界面；双击打开（file://）时按需注入 data/audio.js。
 */
(function (global) {
  'use strict';

  const SRC = 'data/audio.js';
  let data = null;
  let loadPromise = null;
  const els = new Map();   // word -> HTMLAudioElement
  const urlEls = new Map(); // url -> HTMLAudioElement（音节音频，不查清单）

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

  /** 音节音频（syl/v1/xxx.mp3 这种相对路径）的完整地址；清单没加载时用默认 audio/。 */
  function fileUrl(rel) {
    if (!rel) return null;
    return ((data && data.dir) || 'audio/') + rel;
  }

  /** 只允许一个在响：把别的（词的、音节的）都停掉 */
  function pauseOthers(except) {
    for (const other of els.values()) {
      if (other !== except && !other.paused) other.pause();
    }
    for (const other of urlEls.values()) {
      if (other !== except && !other.paused) other.pause();
    }
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
      pauseOthers(el);
      el.currentTime = 0;
      return el.play();
    });
  }

  /** 播放任意音频地址（音节包用，不依赖词表清单）。 */
  function playUrl(u) {
    if (!u) return Promise.reject(new Error('没有音频地址'));
    let el = urlEls.get(u);
    if (!el) {
      el = new Audio(u);
      el.preload = 'auto';
      urlEls.set(u, el);
    }
    pauseOthers(el);
    el.currentTime = 0;
    return el.play();
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

  global.ThaiAudio = { load, play, playUrl, fileUrl, warm, has, info, url, ready };
})(typeof window !== 'undefined' ? window : globalThis);
