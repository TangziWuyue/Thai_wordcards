/**
 * 新手引导（练习页、教学页共用）
 *
 * 做法：盖一层半透明遮罩，在要讲的那个控件上「挖一个洞」（`.tour-hole` 用超大
 * box-shadow 遮住其余部分），旁边弹一张小卡（`.tour-tip`）。样式都在 style.css 里。
 *
 * 用法：
 *   const tour = Tour.create({
 *     steps: [{ sel, title, text, before? }],   // before 用来先把要讲的东西展开
 *     storageKey: 'thai-wordcards.tourDone',    // 看过就记下来，不再自动弹
 *     onStart: () => {},                        // 每次开始（页脚按钮也走这里）
 *     onEnd:   () => {},                        // 退出引导（走完 / 跳过 / 点遮罩都算）
 *   });
 *   tour.start();              // 页脚按钮
 *   tour.maybeAutoStart();     // 第一次访问时自动走一遍
 *
 * 注意：localStorage 不可用（无痕模式）时按「已经看过」处理，不要每次都弹。
 */
const Tour = (() => {
  'use strict';

  function create({ steps, storageKey, onStart, onEnd }) {
    const state = { index: 0, active: false };
    const hole = document.createElement('div');
    const mask = document.createElement('div');
    const tip = document.createElement('div');
    hole.className = 'tour-hole';
    mask.className = 'tour-mask';
    tip.className = 'tour-tip';
    hole.hidden = true;
    mask.hidden = true;
    tip.hidden = true;
    document.body.append(mask, hole, tip);

    function seen() {
      try {
        return !!localStorage.getItem(storageKey);
      } catch {
        return true;   // 存不了就别自动弹
      }
    }

    function markSeen() {
      try {
        localStorage.setItem(storageKey, '1');
      } catch { /* 无痕模式等场景下忽略 */ }
    }

    function end(mark = true) {
      state.active = false;
      mask.hidden = true;
      hole.hidden = true;
      tip.hidden = true;
      if (mark) markSeen();
      if (onEnd) onEnd();
    }

    /** 把洞和提示卡摆到当前这一步的目标元素上（窗口尺寸变了要重摆） */
    function place() {
      const step = steps[state.index];
      const target = document.querySelector(step.sel);
      if (!target) return;
      const pad = 6;
      const r = target.getBoundingClientRect();
      const box = {
        top: Math.max(4, r.top - pad),
        left: Math.max(4, r.left - pad),
        width: Math.min(window.innerWidth - 8, r.width + pad * 2),
        height: Math.min(window.innerHeight - 8, r.height + pad * 2),
      };
      hole.style.top = `${box.top}px`;
      hole.style.left = `${box.left}px`;
      hole.style.width = `${box.width}px`;
      hole.style.height = `${box.height}px`;

      // 提示卡默认放在洞的下方；下面放不下就翻到上面；上下都放不下就贴屏幕底
      const t = tip.getBoundingClientRect();
      const gap = 12;
      let top;
      if (box.top + box.height + gap + t.height <= window.innerHeight - 8) {
        top = box.top + box.height + gap;
      } else if (box.top - gap - t.height >= 8) {
        top = box.top - gap - t.height;
      } else {
        top = Math.max(8, window.innerHeight - t.height - 8);
      }
      const left = Math.max(8, Math.min(
        box.left + box.width / 2 - t.width / 2,
        window.innerWidth - t.width - 8,
      ));
      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
    }

    function show() {
      const step = steps[state.index];
      if (step.before) step.before();
      const target = document.querySelector(step.sel);
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      const total = steps.length;
      const last = state.index === total - 1;

      const title = document.createElement('h4');
      title.append(step.title);
      const stepLabel = document.createElement('span');
      stepLabel.className = 'tour-step';
      stepLabel.textContent = `${state.index + 1}/${total}`;
      title.append(stepLabel);

      const text = document.createElement('p');
      text.textContent = String(step.text || '').replace(/\*\*/g, '');

      const actions = document.createElement('div');
      actions.className = 'tour-actions';
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.textContent = '跳过';
      skip.addEventListener('click', () => end());
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '上一步';
      prev.disabled = state.index === 0;
      prev.addEventListener('click', () => {
        state.index = Math.max(0, state.index - 1);
        show();
      });
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'primary';
      next.textContent = last ? '开始使用' : '下一步';
      next.addEventListener('click', () => {
        if (last) { end(); return; }
        state.index += 1;
        show();
      });
      const spacer = document.createElement('span');
      spacer.className = 'spacer';
      actions.append(skip, spacer, prev, next);

      tip.replaceChildren(title, text, actions);
      mask.hidden = false;
      hole.hidden = false;
      tip.hidden = false;
      place();
    }

    function start() {
      if (state.active || !steps.length) return;
      state.active = true;
      state.index = 0;
      if (onStart) onStart();
      show();
    }

    /** 第一次打开时自动走一遍（延迟一点，等页面自己摆好） */
    function maybeAutoStart(delay = 500) {
      if (seen()) return false;
      setTimeout(start, delay);
      return true;
    }

    // 点遮罩 = 下一步；最后一步再点就结束
    mask.addEventListener('click', () => {
      if (state.index >= steps.length - 1) end();
      else {
        state.index += 1;
        show();
      }
    });
    window.addEventListener('resize', () => {
      if (state.active) place();
    });

    return { start, end, maybeAutoStart, seen, markSeen, isActive: () => state.active };
  }

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tour;
if (typeof window !== 'undefined') window.Tour = Tour;
