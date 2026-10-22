// 抽屉布局基于 better-er/dsh-mobile-drawer，保留其 MIT 许可，见 LICENSE。
export const CSS = `
html[data-dsh-mobile] { overflow: hidden; overscroll-behavior: none; }
html[data-dsh-mobile] body { overflow: clip; overscroll-behavior: none; }
/* hidden 原来同时提供 flex/grid 的最小尺寸收缩；改 clip 后显式保留。 */
html[data-dsh-mobile] [data-dsh-mobile-shell-clip] {
  overflow: clip !important;
  min-width: 0 !important;
  min-height: 0 !important;
}
html[data-dsh-mobile] #root {
  position: fixed !important;
  top: var(--dsh-mobile-top) !important;
  left: var(--dsh-mobile-left) !important;
  width: var(--dsh-mobile-width) !important;
  height: var(--dsh-mobile-height) !important;
  min-height: 0 !important;
  overflow: clip;
}
html[data-dsh-mobile] #root > :first-child { height: 100% !important; min-height: 0 !important; }
html[data-dsh-mobile] [data-conversation-scroll] { overscroll-behavior-y: contain; }
html[data-dsh-mobile] [data-composer-seat] {
  --dsh-composer-text-max-height: min(336px, calc(var(--dsh-mobile-height) * .4));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
html[data-dsh-mobile] :is(textarea, input, [contenteditable="true"], [contenteditable=""]) {
  font-size: 16px !important;
}
html[data-dsh-mobile] { -webkit-text-size-adjust: 100%; }
@media (max-width: 1023.98px) {
  body:is(.dsh-mobile-collapsed, .dsh-mobile-expanded) [data-rightbar-collapsed] {
    grid-template-columns: 0px minmax(0px, 1fr) 0px !important;
  }
  body.dsh-mobile-collapsed [data-sidebar-collapsed] > div:first-child { visibility: hidden; }
  body.dsh-mobile-expanded [data-rightbar-collapsed]:not([data-sidebar-collapsed]) > div:first-child {
    position: relative; overflow: visible;
  }
  body.dsh-mobile-expanded [data-rightbar-collapsed]:not([data-sidebar-collapsed]) [data-slot="sidebar"] > div {
    position: absolute; inset: 0 auto 0 0;
    width: min(280px, calc(var(--dsh-mobile-width) - 48px));
    z-index: 25; box-shadow: var(--dsw-elevation-prominent);
  }
}
.dsh-mobile-fab, .dsh-mobile-scrim {
  position: absolute;
  display: none;
}
.dsh-mobile-scrim {
  inset: 0;
  z-index: 24; background: rgb(0 0 0 / .35);
}
body.dsh-mobile-expanded .dsh-mobile-scrim { display: block; }
.dsh-mobile-fab {
  z-index: 30; width: 44px; height: 44px; box-sizing: border-box;
  padding: 0; align-items: center; justify-content: center;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-button-elevated-fill, white);
  color: var(--dsw-alias-label-primary, black);
  box-shadow: var(--dsw-elevation-panel);
  touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; cursor: grab;
}
body.dsh-mobile-collapsed .dsh-mobile-fab { display: inline-flex; }
.dsh-mobile-fab[data-dragging] { cursor: grabbing; }
.dsh-mobile-fab > svg { width: 20px; height: 20px; pointer-events: none; }
.dsh-mobile-fab:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`;
