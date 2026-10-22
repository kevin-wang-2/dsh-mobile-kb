window.__ModuleLoader__.load({ id: "dsh-mobile-kb", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// src/viewport.js
function applyViewport(ctx, media) {
  ctx.effect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const properties = ["top", "left", "width", "height"];
    const clippedAncestors = /* @__PURE__ */ new Set();
    let frame = 0;
    const clipConversationShell = (target) => {
      if (!media.matches || !(target instanceof Element)) return;
      const scrollport = target.closest("[data-conversation-scroll]");
      if (!scrollport) return;
      for (let node = scrollport.parentElement; node && node.id !== "root"; node = node.parentElement) {
        if (clippedAncestors.has(node)) continue;
        const style = getComputedStyle(node);
        if (style.overflowY !== "hidden" || !["hidden", "visible", "clip"].includes(style.overflowX)) continue;
        node.setAttribute("data-dsh-mobile-shell-clip", "");
        clippedAncestors.add(node);
      }
    };
    const clear = () => {
      root.removeAttribute("data-dsh-mobile");
      for (const property of properties) root.style.removeProperty("--dsh-mobile-" + property);
      for (const node of clippedAncestors) node.removeAttribute("data-dsh-mobile-shell-clip");
      clippedAncestors.clear();
    };
    const write = () => {
      frame = 0;
      if (!media.matches) {
        clear();
        return;
      }
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      if (width <= 0 || height <= 0) return;
      const values = [viewport?.offsetTop ?? 0, viewport?.offsetLeft ?? 0, width, height];
      properties.forEach((property, index) => {
        root.style.setProperty("--dsh-mobile-" + property, values[index] + "px");
      });
      root.setAttribute("data-dsh-mobile", "");
      clipConversationShell(document.activeElement);
      document.dispatchEvent(new Event("dsh-mobile-viewport"));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const events = [
      [viewport, "resize"],
      [viewport, "scroll"],
      [window, "resize"],
      [window, "pageshow"],
      [window, "orientationchange"],
      [document, "visibilitychange"],
      [media, "change"]
    ];
    events.forEach(([target, event]) => target?.addEventListener(event, schedule));
    const onFocusIn = (event) => clipConversationShell(event.target);
    document.addEventListener("focusin", onFocusIn, true);
    write();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      events.forEach(([target, event]) => target?.removeEventListener(event, schedule));
      document.removeEventListener("focusin", onFocusIn, true);
      clear();
    };
  });
}

// src/drawer.js
var POSITION_KEY = "dsh-mobile-drawer-position";
function applyDrawer(ctx, media) {
  ctx.effect(() => {
    const controller = new AbortController();
    const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: controller.signal });
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "dsh-mobile-fab";
    fab.setAttribute("aria-label", "\u5C55\u5F00\u4FA7\u680F\uFF08\u53EF\u62D6\u52A8\uFF09");
    fab.title = "\u70B9\u51FB\u5C55\u5F00\u4FA7\u680F\uFF0C\u62D6\u52A8\u8C03\u6574\u4F4D\u7F6E";
    const scrim = document.createElement("div");
    scrim.className = "dsh-mobile-scrim";
    const shell = document.getElementById("root");
    shell.append(scrim, fab);
    let icon;
    let position;
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
    } catch {
    }
    let drag;
    let dragged = false;
    let suppressUntil = 0;
    let suppressHits = 0;
    let frame = 0;
    const geometry = () => {
      return { width: shell.clientWidth, height: shell.clientHeight };
    };
    const place = () => {
      const view = geometry();
      const x = Math.max(8, Math.min(view.width - 52, drag?.left ?? (position?.x ?? 0) * view.width));
      const y = Math.max(8, Math.min(view.height - 52, drag?.top ?? (position?.y ?? 0.45) * view.height));
      fab.style.left = x + "px";
      fab.style.top = y + "px";
    };
    const update = () => {
      frame = 0;
      const collapsed = document.querySelector("[data-sidebar-collapsed]") !== null;
      const canOverlay = media.matches && document.querySelector("[data-rightbar-collapsed]") !== null;
      if (!icon && canOverlay && collapsed) {
        const svg = document.querySelector("[data-sidebar-collapsed] > div:first-child button svg");
        if (svg) {
          icon = svg.cloneNode(true);
          fab.append(icon);
        }
      }
      document.body.classList.toggle("dsh-mobile-collapsed", canOverlay && collapsed && !!icon);
      document.body.classList.toggle("dsh-mobile-expanded", canOverlay && !collapsed);
      fab.setAttribute("aria-expanded", "false");
      if (!media.matches) {
        suppressUntil = 0;
        suppressHits = 0;
      }
      place();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    listen(fab, "pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      const left = parseFloat(fab.style.left), top = parseFloat(fab.style.top);
      const xKey = event.pointerType === "touch" ? "screenX" : "clientX";
      const yKey = event.pointerType === "touch" ? "screenY" : "clientY";
      drag = {
        id: event.pointerId,
        xKey,
        yKey,
        pointerX: event[xKey],
        pointerY: event[yKey],
        startLeft: left,
        startTop: top,
        left,
        top,
        scale: window.visualViewport?.scale ?? 1
      };
      dragged = false;
      fab.setPointerCapture(event.pointerId);
    });
    listen(fab, "pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = (event[drag.xKey] - drag.pointerX) / drag.scale;
      const dy = (event[drag.yKey] - drag.pointerY) / drag.scale;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true;
      drag.left = drag.startLeft + dx;
      drag.top = drag.startTop + dy;
      fab.toggleAttribute("data-dragging", true);
      place();
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const view = geometry();
      position = { x: parseFloat(fab.style.left) / view.width, y: parseFloat(fab.style.top) / view.height };
      drag = void 0;
      fab.removeAttribute("data-dragging");
      if (dragged) {
        try {
          localStorage.setItem(POSITION_KEY, JSON.stringify(position));
        } catch {
        }
      }
    };
    listen(fab, "pointerup", endDrag);
    listen(fab, "pointercancel", endDrag);
    listen(fab, "lostpointercapture", endDrag);
    listen(fab, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dragged && event.detail !== 0) {
        dragged = false;
        return;
      }
      dragged = false;
      if (media.matches && document.querySelector("[data-sidebar-collapsed]")) ctx.layout.toggleSidebar();
    });
    listen(scrim, "click", () => {
      if (media.matches && !document.querySelector("[data-sidebar-collapsed]")) ctx.layout.toggleSidebar();
    });
    listen(document, "keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("dsh-mobile-expanded")) ctx.layout.toggleSidebar();
    });
    listen(document, "pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) {
        suppressUntil = 0;
        suppressHits = 0;
      }
    }, { capture: true });
    listen(document, "click", (event) => {
      const target = event.target;
      if (!media.matches || !(target instanceof Element) || !target.closest('[data-row-key^="session:"]') || target.closest("button")) return;
      suppressUntil = performance.now() + 1500;
      suppressHits = 0;
      if (!document.querySelector("[data-sidebar-collapsed]")) ctx.layout.toggleSidebar();
    }, { capture: true });
    listen(document, "focusin", (event) => {
      const target = event.target;
      if (!media.matches || performance.now() >= suppressUntil || !(target instanceof HTMLElement) || !target.matches("[data-composer-input]")) return;
      target.blur();
      if (++suppressHits >= 6) suppressUntil = 0;
    }, { capture: true });
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-sidebar-collapsed", "data-rightbar-collapsed"]
    });
    listen(media, "change", schedule);
    listen(document, "dsh-mobile-viewport", place);
    update();
    return () => {
      controller.abort();
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      fab.remove();
      scrim.remove();
      document.body.classList.remove("dsh-mobile-collapsed", "dsh-mobile-expanded");
    };
  });
}

// src/keys.tsx
var import_react = require("react");
var MOUNT_SLOT = "__dshMobileKeysAbort";
var PACKAGE_NAME = "dsh-mobile-kb";
var ROW_CLASS = "dsh-mobile-keys";
var STYLE = [
  ".dsh-mobile-keys {",
  "  position: fixed;",
  "  top: calc(var(--dsh-mobile-top, 0px) + env(safe-area-inset-top, 0px) + 96px);",
  "  left: calc(var(--dsh-mobile-left, 0px) + var(--dsh-mobile-width, 100vw) - 170px - env(safe-area-inset-right, 0px));",
  "  z-index: 1000;",
  "  display: flex;",
  "  align-items: center;",
  "  gap: 7px;",
  "}",
  ".dsh-mobile-keys > button {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  min-width: 34px;",
  "  height: 34px;",
  "  padding: 0 10px;",
  "  border: 0.5px solid var(--dsw-alias-border-l3);",
  "  border-radius: var(--dsw-radius-sm, 8px);",
  "  background: var(--dsw-alias-button-elevated-fill);",
  "  color: var(--dsw-alias-label-primary);",
  "  box-shadow: var(--dsw-elevation-panel);",
  "  font: inherit;",
  "  font-size: 14px;",
  "  line-height: 1;",
  "  cursor: pointer;",
  "  -webkit-tap-highlight-color: transparent;",
  "}",
  ".dsh-mobile-keys > button:active,",
  ".dsh-mobile-keys > button.is-active {",
  "  background: var(--dsw-alias-interactive-bg-hover);",
  "  border-color: var(--dsw-alias-label-primary);",
  "}",
  ".dsh-mobile-keys > button:focus-visible {",
  "  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));",
  "  outline-offset: 2px;",
  "}",
  "@media (min-width: 1024px) {",
  "  .dsh-mobile-keys {",
  "    display: none;",
  "  }",
  "}",
  ""
].join("\n");
var KEYS = [
  { id: "shift", label: "Shift", modifier: "shift" },
  { id: "ctrl", label: "Ctrl", modifier: "ctrl" },
  { id: "tab", label: "Tab", text: "	", yieldToMenu: true }
];
var activeModifiers = /* @__PURE__ */ new Set();
var keyRow;
var activeActions;
function keyEventOptions(key, code, keyCode) {
  return { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
}
var TAB_EVENT = keyEventOptions("Tab", "Tab", 9);
var ENTER_EVENT = keyEventOptions("Enter", "Enter", 13);
function dispatchTab(target, modifiers) {
  const init = { ...TAB_EVENT, ...modifiers };
  const unhandled = target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
  return unhandled;
}
function syncModifierState() {
  const row = keyRow;
  if (row === void 0) {
    return;
  }
  for (const button of row.querySelectorAll("button[data-key]")) {
    const key = KEYS.find((item) => item.id === button.getAttribute("data-key"));
    if (key === void 0 || key.modifier === void 0) {
      continue;
    }
    const locked = activeModifiers.has(key.modifier);
    button.classList.toggle("is-active", locked);
    button.setAttribute("aria-pressed", locked ? "true" : "false");
  }
}
function press(key) {
  if (key.modifier !== void 0) {
    if (activeModifiers.has(key.modifier)) {
      activeModifiers.delete(key.modifier);
    } else {
      activeModifiers.add(key.modifier);
    }
    syncModifierState();
    return;
  }
  const modifiers = {
    ctrlKey: activeModifiers.has("ctrl"),
    shiftKey: activeModifiers.has("shift")
  };
  activeModifiers.clear();
  syncModifierState();
  insert(key, modifiers);
}
function insert(key, modifiers) {
  const text = key.text;
  if (text === void 0) {
    console.warn("[dsh-mobile-drawer] \u952E\u4F4D\u65E2\u4E0D\u662F\u4FEE\u9970\u952E\u4E5F\u6CA1\u6709\u5B57\u7B26\uFF0C\u6309\u952E\u672A\u751F\u6548\uFF1A" + key.id);
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) {
    if (key.yieldToMenu === true && !dispatchTab(active, modifiers)) {
      return;
    }
    const inputActions = activeActions;
    if (inputActions === void 0) {
      console.warn("[dsh-mobile-drawer] \u5BF9\u8BDD\u8F93\u5165\u6846\u6709\u7126\u70B9\u4F46\u62FF\u4E0D\u5230 inputActions\uFF0C\u6309\u952E\u672A\u751F\u6548\uFF1A" + key.id);
      return;
    }
    const span = inputActions.captureInsertion();
    if (!inputActions.insertText(text, span)) {
      console.warn("[dsh-mobile-drawer] \u8F93\u5165\u6846\u5224\u5B9A\u9009\u533A\u5DF2\u8FC7\u671F\u800C\u62D2\u7EDD\u63D2\u5165\uFF0C\u6309\u952E\u672A\u751F\u6548\uFF1A" + key.id);
    }
    return;
  }
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (!dispatchTab(active, modifiers)) {
      return;
    }
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (start === null || end === null) {
      console.warn("[dsh-mobile-drawer] \u5F53\u524D\u8F93\u5165\u6846\u53D6\u4E0D\u5230\u9009\u533A\uFF0C\u6309\u952E\u672A\u751F\u6548\uFF1A" + key.id);
      return;
    }
    active.setRangeText(text, start, end, "end");
    active.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (active instanceof HTMLElement) {
    dispatchTab(active, modifiers);
    return;
  }
  console.warn("[dsh-mobile-drawer] \u5F53\u524D\u6CA1\u6709\u80FD\u63A5\u6536\u6309\u952E\u7684\u5143\u7D20\uFF0C\u6309\u952E\u672A\u751F\u6548\uFF1A" + key.id);
}
function ActionsBridge({ inputActions }) {
  (0, import_react.useEffect)(() => {
    activeActions = inputActions;
    return () => {
      if (activeActions === inputActions) {
        activeActions = void 0;
      }
    };
  }, [inputActions]);
  return null;
}
function applyKeys(ctx) {
  const host = window;
  host[MOUNT_SLOT]?.abort();
  const controller = new AbortController();
  host[MOUNT_SLOT] = controller;
  ctx.effect(() => () => {
    controller.abort();
    if (host[MOUNT_SLOT] === controller) delete host[MOUNT_SLOT];
  }, "dsh-mobile-kb\uFF1A\u91CA\u653E\u8F93\u5165\u76D1\u542C");
  for (const stale of document.querySelectorAll("." + ROW_CLASS)) {
    stale.remove();
  }
  document.getElementById("dsh-mobile-keys-style")?.remove();
  ctx.effect(() => {
    const style = document.createElement("style");
    style.id = "dsh-mobile-keys-style";
    style.dataset.plugin = PACKAGE_NAME;
    style.dataset.pluginCss = PACKAGE_NAME + "/client-keys.css";
    style.textContent = STYLE;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "dsh-mobile-drawer\uFF1A\u624B\u673A\u6309\u952E\u6837\u5F0F");
  ctx.effect(() => {
    const onPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest("." + ROW_CLASS);
      if (row === null) {
        return;
      }
      const button = target.closest("button[data-key]");
      if (button === null || !row.contains(button)) {
        return;
      }
      const key = KEYS.find((item) => item.id === button.getAttribute("data-key"));
      if (key === void 0) {
        console.warn("[dsh-mobile-drawer] \u6309\u952E\u6761\u4E0A\u7684\u6309\u94AE\u6CA1\u6709\u5BF9\u5E94\u952E\u4F4D\uFF1A" + String(button.getAttribute("data-key")));
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      press(key);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true, signal: controller.signal });
  }, "dsh-mobile-drawer\uFF1A\u624B\u673A\u6309\u952E");
  ctx.effect(() => {
    const media = matchMedia("(max-width: 1023.98px)");
    let composing = false;
    let composingUntil = 0;
    let insertingLineBreak = false;
    const holderOf = (target) => {
      const holder = target instanceof Element ? target.closest("[data-composer-input]") : null;
      return holder instanceof HTMLElement && holder.isContentEditable ? holder : null;
    };
    const inComposition = (event, holder) => composing || performance.now() < composingUntil || event.isComposing || "keyCode" in event && event.keyCode === 229 || holder.hasAttribute("data-composer-composing");
    const newline = (event, holder) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      insertingLineBreak = true;
      try {
        holder.dispatchEvent(new InputEvent("beforeinput", {
          inputType: "insertLineBreak",
          bubbles: true,
          cancelable: true,
          composed: true
        }));
      } finally {
        insertingLineBreak = false;
      }
    };
    const onCompositionStart = (event) => {
      if (holderOf(event.target)) composing = true;
    };
    const onCompositionEnd = (event) => {
      if (!holderOf(event.target)) return;
      composing = false;
      composingUntil = performance.now() + 10;
    };
    const onKeyDown = (event) => {
      const holder = holderOf(event.target);
      const isEnter = event.key === "Enter" || event.code === "Enter" || event.keyCode === 13;
      if (!media.matches || !holder || !isEnter || inComposition(event, holder)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const shift = event.shiftKey || activeModifiers.has("shift");
      const ctrl = activeModifiers.has("ctrl");
      if (!shift && !ctrl && holder.closest("[data-composer-seat]")?.querySelector("[data-trigger-menu]")) return;
      if (!shift && ctrl) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activeModifiers.delete("ctrl");
        syncModifierState();
        holder.dispatchEvent(new KeyboardEvent("keydown", { ...ENTER_EVENT, ctrlKey: true }));
        holder.dispatchEvent(new KeyboardEvent("keyup", { ...ENTER_EVENT, ctrlKey: true }));
        return;
      }
      activeModifiers.delete("shift");
      syncModifierState();
      newline(event, holder);
    };
    const onBeforeInput = (event) => {
      const holder = holderOf(event.target);
      if (insertingLineBreak || !media.matches || !holder || !event.cancelable || inComposition(event, holder)) return;
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") newline(event, holder);
    };
    const signal = controller.signal;
    document.addEventListener("compositionstart", onCompositionStart, { capture: true, signal });
    document.addEventListener("compositionend", onCompositionEnd, { capture: true, signal });
    document.addEventListener("keydown", onKeyDown, { capture: true, signal });
    document.addEventListener("beforeinput", onBeforeInput, { capture: true, signal });
    const hints = /* @__PURE__ */ new Map();
    const syncHints = () => {
      for (const holder of document.querySelectorAll("[data-composer-input]")) {
        if (!hints.has(holder)) hints.set(holder, holder.getAttribute("enterkeyhint"));
        const value = media.matches ? "enter" : hints.get(holder);
        if (value === null) holder.removeAttribute("enterkeyhint");
        else if (value !== void 0) holder.setAttribute("enterkeyhint", value);
      }
    };
    const observer = new MutationObserver(syncHints);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", syncHints, { signal });
    syncHints();
    return () => {
      observer.disconnect();
      for (const [holder, value] of hints) {
        if (value === null) holder.removeAttribute("enterkeyhint");
        else holder.setAttribute("enterkeyhint", value);
      }
    };
  }, "dsh-mobile-kb\uFF1A\u624B\u673A Enter \u6362\u884C\u4E0E\u8F93\u5165\u6CD5\u4FDD\u62A4");
  ctx.effect(() => {
    const row = document.createElement("div");
    row.className = ROW_CLASS;
    for (const key of KEYS) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-key", key.id);
      button.setAttribute("aria-label", key.label);
      if (key.modifier !== void 0) {
        button.setAttribute("aria-pressed", "false");
      }
      button.textContent = key.label;
      row.append(button);
    }
    document.body.append(row);
    keyRow = row;
    return () => {
      row.remove();
      keyRow = void 0;
      activeModifiers.clear();
    };
  }, "dsh-mobile-drawer\uFF1A\u624B\u673A\u6309\u952E\u6761");
  ctx.slots.inject(
    "conversation.input.dock",
    () => ctx.slots.register(
      {
        name: "conversation.input.dock",
        id: "dsh-mobile-keys",
        order: 100
      },
      ActionsBridge
    )
  );
}

// src/style.js
var CSS = `
html[data-dsh-mobile] { overflow: hidden; overscroll-behavior: none; }
html[data-dsh-mobile] body { overflow: clip; overscroll-behavior: none; }
/* hidden \u539F\u6765\u540C\u65F6\u63D0\u4F9B flex/grid \u7684\u6700\u5C0F\u5C3A\u5BF8\u6536\u7F29\uFF1B\u6539 clip \u540E\u663E\u5F0F\u4FDD\u7559\u3002 */
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

// src/client.js
var name = "dsh-mobile-kb";
var inject = ["layout", "slots"];
function apply(ctx) {
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
  const scoped = {
    layout: ctx.layout,
    slots: {
      inject: (key, callback) => ctx.slots.inject(key, callback),
      register: (...args) => {
        const unregister = ctx.slots.register(...args);
        cleanups.push(unregister);
        return unregister;
      }
    },
    effect: (effect) => {
      cleanups.push(effect());
    }
  };
  scoped.effect(() => {
    const style = document.createElement("style");
    style.id = "dsh-mobile-style";
    style.dataset.plugin = name;
    style.dataset.pluginCss = name + "/mobile.css";
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  });
  const media = matchMedia("(max-width: 1023.98px)");
  applyViewport(scoped, media);
  applyDrawer(scoped, media);
  applyKeys(scoped);
  ctx.effect(() => dispose, "DSH \u624B\u673A\u5E03\u5C40\u3001\u62BD\u5C49\u4E0E\u8F93\u5165");
}
return module.exports; } });
