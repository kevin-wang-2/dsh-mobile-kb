export function applyViewport(ctx, media) {
  ctx.effect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const properties = ['top', 'left', 'width', 'height'];
    const clippedAncestors = new Set();
    let frame = 0;
    const clipConversationShell = target => {
      if (!media.matches || !(target instanceof Element)) return;
      const scrollport = target.closest('[data-conversation-scroll]');
      if (!scrollport) return;
      // Lexical 会尝试滚动每一层祖先。hidden 仍是可程序滚动的容器；
      // 聊天滚动区外的纯裁剪层改用 clip，避免它们把整块聊天与输入区卷走。
      for (let node = scrollport.parentElement; node && node.id !== 'root'; node = node.parentElement) {
        if (clippedAncestors.has(node)) continue;
        const style = getComputedStyle(node);
        if (style.overflowY !== 'hidden' || !['hidden', 'visible', 'clip'].includes(style.overflowX)) continue;
        node.setAttribute('data-dsh-mobile-shell-clip', '');
        clippedAncestors.add(node);
      }
    };
    const clear = () => {
      root.removeAttribute('data-dsh-mobile');
      for (const property of properties) root.style.removeProperty('--dsh-mobile-' + property);
      for (const node of clippedAncestors) node.removeAttribute('data-dsh-mobile-shell-clip');
      clippedAncestors.clear();
    };
    const write = () => {
      frame = 0;
      if (!media.matches) { clear(); return; }
      // 缩放时保留布局尺寸，允许浏览器正常平移放大的内容。
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      if (width <= 0 || height <= 0) return;
      const values = [viewport?.offsetTop ?? 0, viewport?.offsetLeft ?? 0, width, height];
      properties.forEach((property, index) => {
        root.style.setProperty('--dsh-mobile-' + property, values[index] + 'px');
      });
      // 从聚焦前就固定外壳，避免键盘动画中突然切换定位模式。
      root.setAttribute('data-dsh-mobile', '');
      clipConversationShell(document.activeElement);
      document.dispatchEvent(new Event('dsh-mobile-viewport'));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(write); };
    const events = [[viewport, 'resize'], [viewport, 'scroll'], [window, 'resize'],
      [window, 'pageshow'], [window, 'orientationchange'], [document, 'visibilitychange'], [media, 'change']];
    events.forEach(([target, event]) => target?.addEventListener(event, schedule));
    const onFocusIn = event => clipConversationShell(event.target);
    document.addEventListener('focusin', onFocusIn, true);
    write();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      events.forEach(([target, event]) => target?.removeEventListener(event, schedule));
      document.removeEventListener('focusin', onFocusIn, true);
      clear();
    };
  });
}
