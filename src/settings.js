// 原设置由多个插件提供；这里只调整手机上的外壳和排版，保留其表单实例。
export function applySettings(ctx) {
  ctx.effect(() => {
    const media = matchMedia('(max-width: 767.98px)');
    const panels = new Map();
    const attach = panel => {
      const nav = panel.querySelector('nav');
      const content = nav?.nextElementSibling;
      const header = content?.firstElementChild;
      const options = content?.lastElementChild;
      if (!nav || !header || header === options) return;
      const navTitle = nav.firstElementChild;
      const navList = nav.lastElementChild;
      const title = document.createElement('span');
      title.className = navTitle.className;
      title.dataset.dshSettingsTitle = '';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = navList.querySelector('button').className;
      // 复用导航按钮的常规外观，不能带上当前分类的选中态。
      back.classList.remove(...[...back.classList].filter(name => name.endsWith('_active')));
      back.dataset.dshSettingsBack = '';
      header.prepend(back, title);
      panel.dataset.dshMobileSettings = 'index';
      nav.dataset.dshSettingsNav = '';
      content.dataset.dshSettingsContent = '';
      header.dataset.dshSettingsHeader = '';
      options.dataset.dshSettingsOptions = '';
      const syncTitle = () => {
        const label = navTitle.textContent;
        const active = navList.querySelector('[aria-current="true"]');
        const detail = panel.dataset.dshMobileSettings === 'detail';
        const text = detail ? active?.textContent ?? label : label;
        if (title.textContent !== text) title.textContent = text;
        if (back.textContent !== '‹ ' + label) back.textContent = '‹ ' + label;
      };
      const select = event => {
        if (!(event.target instanceof Element) || !event.target.closest('button')) return;
        panel.dataset.dshMobileSettings = 'detail';
        syncTitle();
        back.focus({ preventScroll: true });
      };
      const showIndex = () => {
        panel.dataset.dshMobileSettings = 'index';
        syncTitle();
        navList.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
      };
      navList.addEventListener('click', select);
      back.addEventListener('click', showIndex);
      syncTitle();
      panels.set(panel, {
        syncTitle,
        dispose() {
          const focusedBack = document.activeElement === back;
          navList.removeEventListener('click', select);
          back.removeEventListener('click', showIndex);
          back.remove(); title.remove();
          delete panel.dataset.dshMobileSettings;
          delete nav.dataset.dshSettingsNav;
          delete content.dataset.dshSettingsContent;
          delete header.dataset.dshSettingsHeader;
          delete options.dataset.dshSettingsOptions;
          if (focusedBack) navList.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
        },
      });
    };
    const scan = () => {
      for (const [panel, state] of panels) {
        if (!panel.isConnected) { state.dispose(); panels.delete(panel); }
      }
      for (const panel of document.querySelectorAll('[data-shortcut-modal="settings"]')) {
        if (!panels.has(panel)) attach(panel);
        else panels.get(panel).syncTitle();
      }
    };
    const observer = new MutationObserver(scan);
    const clear = () => {
      observer.disconnect();
      for (const state of panels.values()) state.dispose();
      panels.clear();
    };
    const update = () => {
      clear();
      if (!media.matches) return;
      scan();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-current'] });
    };
    media.addEventListener('change', update);
    update();
    return () => { media.removeEventListener('change', update); clear(); };
  });
}

export const SETTINGS_CSS = `
@media (max-width: 767.98px) {
  [data-shortcut-modal="settings"][data-dsh-mobile-settings] {
    position: fixed;
    top: var(--dsh-mobile-top, 0px);
    left: var(--dsh-mobile-left, 0px);
    width: var(--dsh-mobile-width, 100vw);
    height: var(--dsh-mobile-height, 100dvh);
    max-width: none;
    border-radius: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    box-sizing: border-box;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  [data-dsh-mobile-settings] [data-dsh-settings-content] { display: contents; }
  [data-dsh-mobile-settings] [data-dsh-settings-header] {
    grid-area: 1 / 1;
    min-width: 0;
    height: auto;
    min-height: 56px;
    padding: 8px max(12px, env(safe-area-inset-right, 0px)) 8px max(12px, env(safe-area-inset-left, 0px));
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }
  [data-dsh-mobile-settings] [data-dsh-settings-title] { grid-area: 1 / 2; padding: 0; min-width: 0; overflow-wrap: anywhere; }
  [data-dsh-mobile-settings="index"] [data-dsh-settings-title] { grid-column: 1 / 3; }
  [data-dsh-mobile-settings] [data-dsh-settings-back] { grid-area: 1 / 1; padding: 8px 4px; }
  [data-dsh-mobile-settings] [data-dsh-settings-header] > button:last-child { grid-area: 1 / 3; }
  [data-dsh-mobile-settings] [data-dsh-settings-header] > [class$="_actions"] {
    grid-area: 2 / 1 / 3 / -1;
    flex-wrap: wrap;
    max-width: 100%;
  }
  [data-dsh-mobile-settings] [data-dsh-settings-header] > [class$="_actions"]:not(:has(button, a, [role="button"])) { display: none; }
  [data-dsh-mobile-settings="index"] [data-dsh-settings-back] { display: none; }
  [data-dsh-mobile-settings] [data-dsh-settings-nav] {
    grid-area: 2 / 1;
    width: auto;
    min-height: 0;
    padding: 8px max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px));
  }
  [data-dsh-mobile-settings] [data-dsh-settings-nav] > :first-child { display: none; }
  [data-dsh-mobile-settings] [data-dsh-settings-nav] button { min-height: 44px; }
  [data-dsh-mobile-settings] [data-dsh-settings-options] {
    grid-area: 2 / 1;
    min-width: 0;
    min-height: 0;
    padding: 0 max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px));
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
  }
  [data-dsh-mobile-settings="index"] [data-dsh-settings-options],
  [data-dsh-mobile-settings="detail"] [data-dsh-settings-nav] { display: none; }

  /* 各业务插件仍绘制自己的控件；只释放桌面行布局留下的宽度约束。 */
  [data-dsh-settings-options] [class$="_row"] { flex-wrap: wrap; row-gap: 12px; }
  [data-dsh-settings-options] [class$="_rowText"] { flex-basis: 180px; padding-right: 0; }
  [data-dsh-settings-options] [class$="_control"] { flex-wrap: wrap; max-width: 100%; }
  [data-dsh-settings-options] :is([class$="_rowHead"], [class$="_editorHeader"], [class$="_editorActions"], [class$="_groupTitleRow"]) { flex-wrap: wrap; }
  [data-dsh-settings-options] [class$="_modelRow"] { grid-template-columns: minmax(0, 1fr) auto auto; }
  [data-dsh-settings-options] [class$="_modelRow"] > :first-child { grid-column: 1 / -1; }
  [data-dsh-settings-options] [class$="_modelAdvanced"] { grid-template-columns: minmax(0, 1fr); }
  [data-dsh-settings-options] [class$="_modelReasoningRow"] { grid-template-columns: minmax(0, 1fr) auto; }
  [data-dsh-settings-options] [class$="_modelReasoningRow"] > :first-child { grid-column: 1 / -1; }
  [data-dsh-settings-options] [class$="_cards"] { grid-template-columns: minmax(0, 1fr); }
  [data-dsh-settings-options] [class$="_tabs"] { overflow-x: auto; flex-shrink: 0; }
  [data-dsh-settings-options] [class$="_tab"] { flex-shrink: 0; }
  /* 原预设图标的提示气泡向右越界；手机上仍沿用气泡外观，改为右侧对齐。 */
  [data-dsh-settings-options] [class$="_iconButton"][data-tip]::after { left: auto; right: 0; transform: none; }
}
`;
