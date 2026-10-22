/**
 * 手机辅助键：默认收起，展开后提供 Ctrl 与 Tab。
 * Ctrl 用于下一次辅助 Tab 或聊天回车；收起时取消锁定。
 * Tab 优先交给补全菜单、终端和编辑器，普通输入面在光标处插入制表符。
 * 按键在 pointerdown 捕获阶段处理，保留编辑焦点和候选菜单。
 * 按键能力改编自 better-er/dsh-mobile-drawer (MIT)，见 LICENSE。
 */

import { useEffect, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** 挂当前实例监听用的名字：热更新时旧实例未必被完整卸载，留着会两份叠着处理同一次按键。 */
const MOUNT_SLOT = '__dshMobileKeysAbort'

/** 插件包名，注入样式时用作归属标记，理由见 applyKeys 里的说明。 */
const PACKAGE_NAME = 'dsh-mobile-kb'

/** 键位组容器类名，样式一次注入。 */
const ROW_CLASS = 'dsh-mobile-keys'

/** 收起态仅显示入口；键位面板向左展开，不占据标题区域。 */
const STYLE = `
.dsh-mobile-keys {
  position: absolute;
  top: min(calc(env(safe-area-inset-top, 0px) + 96px), calc(100% - 52px));
  right: max(8px, env(safe-area-inset-right, 0px));
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-mobile-keys-panel { display: flex; gap: 6px; }
.dsh-mobile-keys-panel[hidden] { display: none; }
.dsh-mobile-keys button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-panel);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.dsh-mobile-keys button[data-keys-toggle] { padding: 0; font-size: 20px; }
.dsh-mobile-keys button:active,
.dsh-mobile-keys button.is-active,
.dsh-mobile-keys button[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-label-primary);
}
.dsh-mobile-keys button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
@media (min-width: 1024px) { .dsh-mobile-keys { display: none; } }
`

/** 粘滞修饰键的种类。 */
type Modifier = 'ctrl'

/**
 * 一个键位。
 *
 * 普通键带要落进输入框的字符；修饰键带自己的种类，按下只切换锁定状态，不落字。
 */
type KeySpec = { readonly id: string; readonly label: string } & (
  | { readonly text: string; readonly yieldToMenu?: boolean; readonly modifier?: undefined }
  | { readonly modifier: Modifier; readonly text?: undefined; readonly yieldToMenu?: undefined }
)

/** 键位表，也是唯一的扩展点。加键只在这里加一项，修饰键排在普通键前面。 */
const KEYS: readonly KeySpec[] = [
  { id: 'ctrl', label: 'Ctrl', modifier: 'ctrl' },
  { id: 'tab', label: 'Tab', text: '\t', yieldToMenu: true },
]

/** 当前锁住的修饰键。 */
const activeModifiers = new Set<Modifier>()

/** 键位条根节点，用来把锁定状态刷到键面上。 */
let keyRow: Element | undefined

/** 输入区按键条的 props，session 作用域下带标准输入操作面。 */
type InputDockProps = PropsRuntime<'conversation.input.dock'>

/** 当前会话的输入操作面，由 slot 组件挂载后持续更新。 */
let activeActions: InputDockProps['inputActions'] | undefined

/** 客户端上下文里本模块用得到的一小片。 */
export interface KeysContext {
  effect(callback: () => (() => void) | void, label?: string): void
  slots: {
    inject(key: 'conversation.input.dock', callback: () => (() => void) | void): void
    register(
      spec: { name: 'conversation.input.dock'; id: string; order?: number },
      component: (props: InputDockProps) => ReactNode,
    ): () => void
  }
}

/**
 * 造一份键盘事件选项。
 *
 * keyCode 在类型里但已废弃，which 不在，两条都补上只为照顾真去读它们的处理逻辑。
 */
function keyEventOptions(key: string, code: string, keyCode: number): KeyboardEventInit & { keyCode: number; which: number } {
  return { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true }
}

/** 补全与缩进用的 Tab。 */
const TAB_EVENT = keyEventOptions('Tab', 'Tab', 9)

/** 回车的键盘事件选项，也用来把软键盘的普通回车改写成带修饰键的回车。 */
const ENTER_EVENT = keyEventOptions('Enter', 'Enter', 13)

/** 一次派发要带上的修饰键状态。 */
interface ModifierState {
  readonly ctrlKey: boolean
}

/**
 * 往焦点元素派发一次合成的 Tab 按键，返回页面是否还有默认行为没被接管。
 *
 * 这个判断只能问页面：被 preventDefault 的就是触发菜单接管了，没接管才轮到我们插制表符。
 */
function dispatchTab(target: HTMLElement, modifiers: ModifierState): boolean {
  const init = { ...TAB_EVENT, ...modifiers }
  const unhandled = target.dispatchEvent(new KeyboardEvent('keydown', init))
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  return unhandled
}

/** 把锁定状态刷到键面上，锁住的修饰键高亮。 */
function syncModifierState(): void {
  const row = keyRow
  if (row === undefined) {
    return
  }
  for (const button of row.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
    const key = KEYS.find((item) => item.id === button.getAttribute('data-key'))
    if (key === undefined || key.modifier === undefined) {
      continue
    }
    const locked = activeModifiers.has(key.modifier)
    button.classList.toggle('is-active', locked)
    button.setAttribute('aria-pressed', locked ? 'true' : 'false')
  }
}

/**
 * 按下一个键。
 *
 * 修饰键只切换锁定状态，不落字；普通键取上当前锁定状态再派发，派发完就把锁定放开，
 * 免得下一次按键莫名带上修饰符。
 */
function press(key: KeySpec, target: Element | null = document.activeElement): void {
  if (key.modifier !== undefined) {
    if (activeModifiers.has(key.modifier)) {
      activeModifiers.delete(key.modifier)
    } else {
      activeModifiers.add(key.modifier)
    }
    syncModifierState()
    return
  }

  const modifiers: ModifierState = {
    ctrlKey: activeModifiers.has('ctrl'),
  }
  activeModifiers.clear()
  syncModifierState()
  insert(key, modifiers, target)
}

/**
 * 把按键送到当前焦点所在的输入面。
 *
 * 对话输入框是 contenteditable 的 Lexical 编辑器，写入只能走会话作用域的 inputActions：
 * 先让触发菜单接手一次 Tab，没人接手再用 captureInsertion 与 insertText 在光标处落字。
 * 终端、编辑器与普通输入框各有自己的键盘处理，把合成的 Tab 原样交给它们即可；
 * 合成的按键不触发浏览器默认行为，所以普通输入框那一支自己把字符补上。
 */
function insert(key: KeySpec, modifiers: ModifierState, active: Element | null): void {
  const text = key.text
  if (text === undefined) {
    console.warn('[dsh-mobile-kb] 键位既不是修饰键也没有字符，按键未生效：' + key.id)
    return
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    if (key.yieldToMenu === true && !dispatchTab(active, modifiers)) {
      return
    }
    const inputActions = activeActions
    if (inputActions === undefined) {
      console.warn('[dsh-mobile-kb] 对话输入框有焦点但拿不到 inputActions，按键未生效：' + key.id)
      return
    }
    const span = inputActions.captureInsertion()
    if (!inputActions.insertText(text, span)) {
      console.warn('[dsh-mobile-kb] 输入框判定选区已过期而拒绝插入，按键未生效：' + key.id)
    }
    return
  }

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (!dispatchTab(active, modifiers)) {
      return
    }
    const start = active.selectionStart
    const end = active.selectionEnd
    if (start === null || end === null) {
      console.warn('[dsh-mobile-kb] 当前输入框取不到选区，按键未生效：' + key.id)
      return
    }
    active.setRangeText(text, start, end, 'end')
    active.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }

  if (active instanceof HTMLElement) {
    dispatchTab(active, modifiers)
    return
  }

  console.warn('[dsh-mobile-kb] 当前没有能接收按键的元素，按键未生效：' + key.id)
}

/**
 * 只做一件事的空组件：把会话作用域的输入操作面留下来给按键条用。
 *
 * 按键条本身不渲染在这里。它挂在全局外壳右侧，终端与文件编辑器这些不在会话输入区的页面也该看得见，
 * 所以由 applyKeys 直接建 DOM，这个登记点只负责拿到 inputActions。
 */
function ActionsBridge({ inputActions }: InputDockProps) {
  useEffect(() => {
    activeActions = inputActions
    return () => {
      if (activeActions === inputActions) {
        activeActions = undefined
      }
    }
  }, [inputActions])

  return null
}

/**
 * 挂载手机输入按键。
 *
 * @param ctx - 客户端根上下文，slots 已就绪。
 */
export function applyKeys(ctx: KeysContext): void {
  // 热更新或重复加载时，上一份实例未必被完整卸载。先掐掉它的监听、清掉它的界面，
  // 否则两份模块状态各管一半，点击写的锁定拦截那侧读不到。
  const host = window as unknown as Record<string, AbortController | undefined>
  host[MOUNT_SLOT]?.abort()
  const controller = new AbortController()
  host[MOUNT_SLOT] = controller
  ctx.effect(() => () => {
    controller.abort()
    if (host[MOUNT_SLOT] === controller) delete host[MOUNT_SLOT]
  }, 'dsh-mobile-kb：释放输入监听')
  for (const stale of document.querySelectorAll('.' + ROW_CLASS)) {
    stale.remove()
  }
  document.getElementById('dsh-mobile-keys-style')?.remove()

  ctx.effect(() => {
    const style = document.createElement('style')
    style.id = 'dsh-mobile-keys-style'
    // 与 index.ts 同理：不带 data-plugin 的样式会被任何插件实例化时认领走，随后被删。
    style.dataset.plugin = PACKAGE_NAME
    style.dataset.pluginCss = PACKAGE_NAME + '/client-keys.css'
    style.textContent = STYLE
    document.head.append(style)
    return () => {
      style.remove()
    }
  }, 'dsh-mobile-kb：手机按键样式')

  ctx.effect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      // 先认准自家的容器，页面别处若有同样带 data-key 的按钮，不归这里管
      const row = target.closest('.' + ROW_CLASS)
      if (row === null) {
        return
      }
      if (target.closest('button[data-keys-toggle]')) {
        // 展开入口也不能夺走输入焦点，否则会收起软键盘。
        event.preventDefault()
        event.stopImmediatePropagation()
        const toggle = row.querySelector<HTMLButtonElement>('[data-keys-toggle]')
        toggle?.click()
        return
      }
      const button = target.closest('button[data-key]')
      if (button === null || !row.contains(button)) {
        return
      }
      const key = KEYS.find((item) => item.id === button.getAttribute('data-key'))
      if (key === undefined) {
        console.warn('[dsh-mobile-kb] 按键条上的按钮没有对应键位：' + String(button.getAttribute('data-key')))
        return
      }
      // 抢在触发菜单的关闭监听之前：这时候菜单还开着，事件一旦继续传播就被关掉，补全也就没了
      event.preventDefault()
      event.stopImmediatePropagation()
      press(key)
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true, signal: controller.signal })
  }, 'dsh-mobile-kb：手机按键')

  ctx.effect(() => {
    const media = matchMedia('(max-width: 1023.98px)')
    let composing = false
    let composingUntil = 0
    let insertingLineBreak = false
    const holderOf = (target: EventTarget | null): HTMLElement | null => {
      const holder = target instanceof Element ? target.closest('[data-composer-input]') : null
      return holder instanceof HTMLElement && holder.isContentEditable ? holder : null
    }
    const inComposition = (event: KeyboardEvent | InputEvent, holder: HTMLElement) =>
      composing || performance.now() < composingUntil || event.isComposing ||
      ('keyCode' in event && event.keyCode === 229) || holder.hasAttribute('data-composer-composing')
    const newline = (event: Event, holder: HTMLElement) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      // 走 Lexical 的标准编辑事件，生成 LineBreakNode 并移动光标。
      // 异步文本插入接口插入裸换行时，Safari 可能把后续文字留在换行前。
      insertingLineBreak = true
      try {
        holder.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertLineBreak', bubbles: true, cancelable: true, composed: true,
        }))
      } finally { insertingLineBreak = false }
    }
    const onCompositionStart = (event: CompositionEvent) => {
      if (holderOf(event.target)) composing = true
    }
    const onCompositionEnd = (event: CompositionEvent) => {
      if (!holderOf(event.target)) return
      composing = false
      // Safari 的 compositionend 可能先于用来选词的 Enter。
      composingUntil = performance.now() + 10
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const holder = holderOf(event.target)
      const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.keyCode === 13
      if (!media.matches || !holder || !isEnter || inComposition(event, holder)) return
      // 外接键盘的提交与特殊组合键仍交给宿主；只改普通 Enter / Shift+Enter。
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const shift = event.shiftKey
      const ctrl = activeModifiers.has('ctrl')
      // 补全菜单打开时，普通 Enter 仍用于选中候选项。
      if (!shift && !ctrl && holder.closest('[data-composer-seat]')?.querySelector('[data-trigger-menu]')) return
      if (!shift && ctrl) {
        event.preventDefault()
        event.stopImmediatePropagation()
        activeModifiers.delete('ctrl')
        syncModifierState()
        holder.dispatchEvent(new KeyboardEvent('keydown', { ...ENTER_EVENT, ctrlKey: true }))
        holder.dispatchEvent(new KeyboardEvent('keyup', { ...ENTER_EVENT, ctrlKey: true }))
        return
      }
      syncModifierState()
      newline(event, holder)
    }
    const onBeforeInput = (event: InputEvent) => {
      const holder = holderOf(event.target)
      if (insertingLineBreak || !media.matches || !holder || !event.cancelable || inComposition(event, holder)) return
      // iOS 软键盘可能不发 keydown，直接发 insertParagraph。
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') newline(event, holder)
    }
    const signal = controller.signal
    document.addEventListener('compositionstart', onCompositionStart, { capture: true, signal })
    document.addEventListener('compositionend', onCompositionEnd, { capture: true, signal })
    document.addEventListener('keydown', onKeyDown, { capture: true, signal })
    document.addEventListener('beforeinput', onBeforeInput, { capture: true, signal })
    const hints = new Map<Element, string | null>()
    const syncHints = () => {
      for (const holder of document.querySelectorAll('[data-composer-input]')) {
        if (!hints.has(holder)) hints.set(holder, holder.getAttribute('enterkeyhint'))
        const value = media.matches ? 'enter' : hints.get(holder)
        if (value === null) holder.removeAttribute('enterkeyhint')
        else if (value !== undefined) holder.setAttribute('enterkeyhint', value)
      }
    }
    const observer = new MutationObserver(syncHints)
    observer.observe(document.body, { childList: true, subtree: true })
    media.addEventListener('change', syncHints, { signal })
    syncHints()
    return () => {
      observer.disconnect()
      for (const [holder, value] of hints) {
        if (value === null) holder.removeAttribute('enterkeyhint')
        else holder.setAttribute('enterkeyhint', value)
      }
    }
  }, 'dsh-mobile-kb：手机 Enter 换行与输入法保护')

  ctx.effect(() => {
    const row = document.createElement('div')
    row.className = ROW_CLASS
    const panel = document.createElement('div')
    panel.id = 'dsh-mobile-keys-panel'
    panel.className = 'dsh-mobile-keys-panel'
    panel.hidden = true
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', '辅助按键')
    let previousTarget: Element | null = null
    row.addEventListener('focusin', event => {
      if (event.relatedTarget instanceof Element && !row.contains(event.relatedTarget)) previousTarget = event.relatedTarget
    }, { signal: controller.signal })
    for (const key of KEYS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-key', key.id)
      button.setAttribute('aria-label', key.label)
      if (key.modifier !== undefined) {
        button.setAttribute('aria-pressed', 'false')
      }
      button.textContent = key.label
      button.addEventListener('click', event => {
        if (event.detail !== 0) return
        event.preventDefault()
        // 键盘或辅助技术激活时，焦点在按键自身；仍把 Tab 送回之前的输入面。
        press(key, previousTarget)
      }, { signal: controller.signal })
      panel.append(button)
    }
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.dataset.keysToggle = ''
    toggle.textContent = '⌨'
    toggle.setAttribute('aria-controls', panel.id)
    const setExpanded = (expanded: boolean) => {
      panel.hidden = !expanded
      toggle.setAttribute('aria-expanded', String(expanded))
      toggle.setAttribute('aria-label', expanded ? '收起辅助键' : '展开辅助键')
      toggle.title = expanded ? '收起辅助键' : '展开辅助键'
      if (!expanded) {
        activeModifiers.clear()
        syncModifierState()
      }
    }
    const signal = controller.signal
    // 鼠标/触摸已由 pointerdown 处理；detail=0 对应键盘或辅助技术激活。
    toggle.addEventListener('click', event => {
      event.preventDefault()
      if (event.detail === 0) setExpanded(panel.hidden)
    }, { signal })
    row.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        setExpanded(false)
        toggle.focus({ preventScroll: true })
      }
    }, { signal })
    const media = matchMedia('(max-width: 1023.98px)')
    media.addEventListener('change', () => { if (!media.matches) setExpanded(false) }, { signal })
    row.append(panel, toggle)
    document.getElementById('root')?.append(row)
    keyRow = row
    setExpanded(false)
    return () => {
      row.remove()
      keyRow = undefined
      activeModifiers.clear()
    }
  }, 'dsh-mobile-kb：手机按键条')

  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'dsh-mobile-keys',
        order: 100,
      },
      ActionsBridge,
    ),
  )
}
