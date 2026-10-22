// 侧栏叠层与会话聚焦压制改编自 better-er/dsh-mobile-drawer (MIT)。
const POSITION_KEY = 'dsh-mobile-drawer-position';

export function applyDrawer(ctx, media) {
  ctx.effect(() => {
    const controller = new AbortController();
    const listen = (target, event, callback, options = {}) =>
      target.addEventListener(event, callback, { ...options, signal: controller.signal });
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'dsh-mobile-fab';
    fab.setAttribute('aria-label', '展开侧栏（可拖动）');
    fab.title = '点击展开侧栏，拖动调整位置';
    const scrim = document.createElement('div');
    scrim.className = 'dsh-mobile-scrim';
    // 固定外壳会建立层叠上下文；遮罩必须与抽屉同在外壳内，否则会盖住抽屉。
    const shell = document.getElementById('root');
    shell.append(scrim, fab);
    let icon;
    let position;
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
    } catch { /* 浏览器可能禁用本地存储，仍可在本次页面中拖动。 */ }
    let drag;
    let dragged = false;
    let suppressUntil = 0;
    let suppressHits = 0;
    let frame = 0;
    const geometry = () => {
      // 图标在外壳内绝对定位，只使用外壳自己的 CSS 像素尺寸。
      return { width: shell.clientWidth, height: shell.clientHeight };
    };
    const place = () => {
      const view = geometry();
      // 拖动全程使用像素；百分比只用于松手后的存储和非拖动状态的屏幕适配。
      const x = Math.max(8, Math.min(view.width - 52, drag?.left ?? (position?.x ?? 0) * view.width));
      const y = Math.max(8, Math.min(view.height - 52, drag?.top ?? (position?.y ?? .45) * view.height));
      fab.style.left = x + 'px';
      fab.style.top = y + 'px';
    };
    const update = () => {
      frame = 0;
      const collapsed = document.querySelector('[data-sidebar-collapsed]') !== null;
      const canOverlay = media.matches && document.querySelector('[data-rightbar-collapsed]') !== null;
      if (!icon && canOverlay && collapsed) {
        const svg = document.querySelector('[data-sidebar-collapsed] > div:first-child button svg');
        if (svg) { icon = svg.cloneNode(true); fab.append(icon); }
      }
      document.body.classList.toggle('dsh-mobile-collapsed', canOverlay && collapsed && !!icon);
      document.body.classList.toggle('dsh-mobile-expanded', canOverlay && !collapsed);
      fab.setAttribute('aria-expanded', 'false');
      if (!media.matches) { suppressUntil = 0; suppressHits = 0; }
      place();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    listen(fab, 'pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      // 不让按钮夺走 composer 焦点，否则键盘会在拖动过程中收起并改变坐标系。
      event.preventDefault();
      const left = parseFloat(fab.style.left), top = parseFloat(fab.style.top);
      // 触摸读取物理屏幕位移；鼠标读取窗口位移，不依赖不同平台的屏幕原点。
      const xKey = event.pointerType === 'touch' ? 'screenX' : 'clientX';
      const yKey = event.pointerType === 'touch' ? 'screenY' : 'clientY';
      drag = { id: event.pointerId, xKey, yKey, pointerX: event[xKey], pointerY: event[yKey],
        startLeft: left, startTop: top, left, top, scale: window.visualViewport?.scale ?? 1 };
      dragged = false;
      fab.setPointerCapture(event.pointerId);
    });
    listen(fab, 'pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      // screen 坐标不随键盘的视口平移改变。正常缩放下移动 1px，图标也移动 1px。
      const dx = (event[drag.xKey] - drag.pointerX) / drag.scale;
      const dy = (event[drag.yKey] - drag.pointerY) / drag.scale;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true;
      drag.left = drag.startLeft + dx;
      drag.top = drag.startTop + dy;
      fab.toggleAttribute('data-dragging', true);
      place();
    });
    const endDrag = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const view = geometry();
      position = { x: parseFloat(fab.style.left) / view.width, y: parseFloat(fab.style.top) / view.height };
      drag = undefined;
      fab.removeAttribute('data-dragging');
      if (dragged) {
        try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* 无存储权限。 */ }
      }
    };
    listen(fab, 'pointerup', endDrag);
    listen(fab, 'pointercancel', endDrag);
    listen(fab, 'lostpointercapture', endDrag);
    listen(fab, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (dragged && event.detail !== 0) { dragged = false; return; }
      dragged = false;
      if (media.matches && document.querySelector('[data-sidebar-collapsed]')) ctx.layout.toggleSidebar();
    });
    listen(scrim, 'click', () => {
      if (media.matches && !document.querySelector('[data-sidebar-collapsed]')) ctx.layout.toggleSidebar();
    });
    listen(document, 'keydown', event => {
      if (event.key === 'Escape' && document.body.classList.contains('dsh-mobile-expanded')) ctx.layout.toggleSidebar();
    });
    listen(document, 'pointerdown', event => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) {
        suppressUntil = 0; suppressHits = 0;
      }
    }, { capture: true });
    listen(document, 'click', event => {
      const target = event.target;
      if (!media.matches || !(target instanceof Element) || !target.closest('[data-row-key^="session:"]') || target.closest('button')) return;
      suppressUntil = performance.now() + 1500;
      suppressHits = 0;
      if (!document.querySelector('[data-sidebar-collapsed]')) ctx.layout.toggleSidebar();
    }, { capture: true });
    listen(document, 'focusin', event => {
      const target = event.target;
      if (!media.matches || performance.now() >= suppressUntil || !(target instanceof HTMLElement) || !target.matches('[data-composer-input]')) return;
      target.blur();
      if (++suppressHits >= 6) suppressUntil = 0;
    }, { capture: true });
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-collapsed'] });
    listen(media, 'change', schedule);
    listen(document, 'dsh-mobile-viewport', place);
    update();
    return () => {
      controller.abort(); observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      fab.remove(); scrim.remove();
      document.body.classList.remove('dsh-mobile-collapsed', 'dsh-mobile-expanded');
    };
  });
}
