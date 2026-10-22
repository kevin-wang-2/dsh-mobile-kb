import { applyViewport } from './viewport.js';
import { applyDrawer } from './drawer.js';
import { applyKeys } from './keys.tsx';
import { CSS } from './style.js';

export const name = 'dsh-mobile-kb';
export const inject = ['layout', 'slots'];

export function apply(ctx) {
  // 同一插件热重载时，先清理旧的 DOM 和监听器。
  window.__dshMobileDispose?.();
  const cleanups = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.reverse()) cleanup?.();
    if (window.__dshMobileDispose === dispose) delete window.__dshMobileDispose;
  };
  window.__dshMobileDispose = dispose;
  const scoped = { layout: ctx.layout, slots: {
    inject: (key, callback) => ctx.slots.inject(key, callback),
    register: (...args) => {
      const unregister = ctx.slots.register(...args);
      cleanups.push(unregister);
      return unregister;
    },
  },
    effect: (effect) => { cleanups.push(effect()); } };
  scoped.effect(() => {
    const style = document.createElement('style');
    style.id = 'dsh-mobile-style';
    style.dataset.plugin = name;
    style.dataset.pluginCss = name + '/mobile.css';
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  });
  const media = matchMedia('(max-width: 1023.98px)');
  applyViewport(scoped, media);
  applyDrawer(scoped, media);
  applyKeys(scoped);
  ctx.effect(() => dispose, 'DSH 手机布局、抽屉与输入');
}
