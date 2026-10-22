import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}html,body,#root{margin:0;height:100%;font-family:sans-serif}
[data-frame]{display:grid;grid-template-columns:56px minmax(0,1fr) 0;height:100%;overflow:hidden}
[data-slot=sidebar]{height:100%;background:#ddd}main{display:flex;flex-direction:column;min-width:0;overflow:hidden}
header{height:64px;flex:none}[data-conversation-scroll]{overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column}
article{height:1600px;flex:1 0 auto}[data-composer-seat]{position:sticky;bottom:0;flex:none;background:white}
[data-composer-input]{min-height:48px;max-height:160px;overflow:auto;padding:10px;border:1px solid #888}
[data-composer-toolbar]{display:flex;justify-content:flex-end;align-items:center;gap:8px;min-height:36px}
</style></head><body><div id="root"><div data-frame data-sidebar-collapsed data-rightbar-collapsed>
<div><div data-slot="sidebar"><div><button aria-label="内置侧栏"><svg viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg></button>
<div data-row-key="session:fixture"><span>会话</span></div></div></div></div>
<main><header>标题不应被入口覆盖</header><div data-conversation-scroll><article>对话</article>
<div data-composer-seat><div data-composer-input contenteditable="true" role="textbox"></div><div data-composer-toolbar><span data-slot="conversation.input.right"></span><button id="send">发送</button></div></div>
</div></main><aside></aside></div></div></body></html>`;

async function boot(page) {
  await page.route('http://dsh.test/**', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
  await page.goto('http://dsh.test/');
  await page.evaluate(() => {
    const vp = new EventTarget();
    Object.assign(vp, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });
    const effects = [];
    const editor = document.querySelector('[data-composer-input]');
    window.testState = { sends: 0, inserts: 0, menuSelections: 0, unmounts: [] };
    const inputActions = {
      captureInsertion: () => window.getSelection().getRangeAt(0).cloneRange(),
      insertText: (text, range) => {
        testState.inserts++;
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        return true;
      },
    };
    const ctx = {
      effect: effect => { effects.push(effect()); },
      layout: { toggleSidebar: () => document.querySelector('[data-frame]').toggleAttribute('data-sidebar-collapsed') },
      slots: {
        inject: (_name, callback) => { testState.unmounts.push(callback()); },
        register: (_spec, Component) => {
          const node = Component({ inputActions });
          return () => node?.unmount?.();
        },
      },
    };
    const react = {
      useEffect: effect => { testState.unmounts.push(effect()); },
      createElement: (tag, props) => {
        const node = document.createElement(tag);
        node.className = props.className;
        document.querySelector('[data-slot="conversation.input.right"]').append(node);
        props.ref(node);
        node.unmount = () => { props.ref(null); node.remove(); };
        return node;
      },
    };
    window.__ModuleLoader__ = { load: spec => {
      window.plugin = spec.factory(() => react);
    } };
    window.mount = () => plugin.apply(ctx);
    window.unmount = () => {
      effects.splice(0).reverse().forEach(effect => effect?.());
      testState.unmounts.splice(0).reverse().forEach(effect => effect?.());
    };
    editor.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (document.querySelector('[data-trigger-menu]')) testState.menuSelections++;
      else testState.sends++;
    });
    // 宿主编辑器对标准编辑事件的处理；插件不直接修改 DOM。
    editor.addEventListener('beforeinput', event => {
      if (!['insertLineBreak', 'insertParagraph'].includes(event.inputType) || event.isComposing) return;
      event.preventDefault();
      inputActions.insertText('\n', inputActions.captureInsertion());
    });
    document.querySelector('#send').onclick = () => testState.sends++;
    window.viewportTo = values => { Object.assign(vp, values); vp.dispatchEvent(new Event('resize')); };
  });
  await page.addScriptTag({ path: new URL('../client.js', import.meta.url).pathname });
  await page.evaluate(() => mount());
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: 手机布局、键盘偏移、拖动与输入回归`, async t => {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await boot(page);
      const editor = page.locator('[data-composer-input]');
      const fab = page.locator('.dsh-mobile-fab');
      await t.test('默认入口避开标题，拖动不打开抽屉，刷新保留位置', async () => {
        const title = await page.locator('header').boundingBox();
        const before = await fab.boundingBox();
        assert.ok(before.y > title.y + title.height);
        await page.mouse.move(before.x + 20, before.y + 20);
        await page.mouse.down();
        await page.mouse.move(220, 250, { steps: 8 });
        await page.mouse.up();
        assert.equal(await page.locator('[data-sidebar-collapsed]').count(), 1);
        const after = await fab.boundingBox();
        assert.ok(after.x > before.x + 100);
        await page.evaluate(() => { unmount(); mount(); });
        const restored = await fab.boundingBox();
        assert.ok(Math.abs(restored.x - after.x) < 1);
        await fab.click();
        await page.waitForFunction(() => document.body.classList.contains('dsh-mobile-expanded'));
        await page.locator('[data-row-key] span').click();
        await page.waitForFunction(() => document.body.classList.contains('dsh-mobile-collapsed'));
      });
      await t.test('键盘高度和偏移连续变化，外壳与 composer 始终在可见区域内', async () => {
        await editor.click();
        for (const [height, offsetTop] of [[600, 30], [420, 160], [300, 210], [220, 250], [844, 0]]) {
          await page.evaluate(values => viewportTo(values), { height, offsetTop });
          await page.waitForFunction(h => document.querySelector('#root').getBoundingClientRect().height === h, height);
          const root = await page.locator('#root').boundingBox();
          const composer = await page.locator('[data-composer-seat]').boundingBox();
          assert.ok(Math.abs(root.y - offsetTop) < 1);
          assert.equal(root.height, height);
          assert.ok(composer.y >= offsetTop, JSON.stringify(composer));
          assert.ok(composer.y + composer.height <= height + offsetTop + 1, JSON.stringify(composer));
          const button = await fab.boundingBox();
          assert.ok(button.y >= offsetTop && button.y + button.height <= offsetTop + height);
        }
        await page.evaluate(() => viewportTo({ scale: 2, height: 180, offsetTop: 200 }));
        await page.waitForTimeout(50);
        assert.equal((await page.locator('#root').boundingBox()).height, 844);
        await page.evaluate(() => viewportTo({ scale: 1, height: 844, offsetTop: 0 }));
      });
      await t.test('聚焦期间布局暂时溢出，外壳不可被程序卷走，聊天仍可滚动', async () => {
        await editor.click();
        const result = await page.evaluate(() => {
          const outer = [document.querySelector('main'), document.querySelector('[data-frame]'), document.querySelector('#root')];
          const saved = outer.map(el => el.getAttribute('style'));
          const extras = outer.map(el => {
            if (el.id !== 'root') el.style.position = 'relative';
            const extra = document.createElement('div');
            extra.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1600px;pointer-events:none';
            el.append(extra);
            return extra;
          });
          try {
            const overflow = outer.map(el => el.scrollHeight > el.clientHeight);
            outer.forEach(el => { el.scrollTop = 180; });
            const shellScroll = outer.map(el => el.scrollTop);
            const transcript = document.querySelector('[data-conversation-scroll]');
            transcript.scrollTop = 120;
            return { overflow, shellScroll, chatScroll: transcript.scrollTop };
          } finally {
            extras.forEach(el => el.remove());
            outer.forEach((el, i) => {
              el.scrollTop = 0;
              if (saved[i] === null) el.removeAttribute('style'); else el.setAttribute('style', saved[i]);
            });
          }
        });
        assert.ok(result.overflow.every(Boolean));
        assert.deepEqual(result.shellScroll, [0, 0, 0]);
        assert.ok(result.chatScroll > 0);
      });
      await t.test('键盘打开时拖动保留输入焦点，视口变化时保持抓取点', async () => {
        await page.evaluate(() => viewportTo({ height: 420, offsetTop: 160 }));
        await page.waitForFunction(() => document.querySelector('#root').getBoundingClientRect().height === 420);
        await editor.click();
        const start = await fab.boundingBox();
        await page.mouse.move(start.x + 20, start.y + 20);
        await page.mouse.down();
        assert.equal(await editor.evaluate(el => document.activeElement === el), true);
        await page.mouse.move(150, 380, { steps: 5 });
        let box = await fab.boundingBox();
        assert.ok(Math.abs(box.x - 130) < 1);
        assert.ok(Math.abs(box.y - 360) < 1, JSON.stringify({ start, box }));
        await page.evaluate(() => viewportTo({ height: 350, offsetTop: 200 }));
        await page.waitForFunction(() => document.querySelector('#root').getBoundingClientRect().height === 350);
        box = await fab.boundingBox();
        // 视口原点移动 40px，按钮保持原来的视觉落点，不能按新高度缩放漂移。
        assert.ok(Math.abs(box.y - 400) < 1, JSON.stringify(box));
        await page.mouse.move(200, 420, { steps: 5 });
        box = await fab.boundingBox();
        assert.ok(Math.abs(box.x - 180) < 1);
        assert.ok(Math.abs(box.y - 440) < 1);
        await page.mouse.up();
        assert.equal(await editor.evaluate(el => document.activeElement === el), true);
        assert.equal(await page.locator('[data-sidebar-collapsed]').count(), 1);
        await page.evaluate(() => viewportTo({ height: 844, offsetTop: 0 }));
      });
      await t.test('键盘压缩页面坐标时，拖动仍按屏幕像素移动，到键盘边界才截停', async () => {
        await page.evaluate(() => viewportTo({ height: 350, offsetTop: 160 }));
        await page.waitForFunction(() => document.querySelector('#root').getBoundingClientRect().height === 350);
        await editor.click();
        const start = await fab.boundingBox();
        await fab.evaluate(el => el.addEventListener('pointerdown', event => {
          // 构造触摸坐标契约，避免把自动化鼠标的屏幕坐标当成 iOS 手指坐标。
          Object.defineProperty(event, 'pointerType', { value: 'touch' });
          window.dragStart = { id: event.pointerId, screenX: event.screenX, screenY: event.screenY,
            clientX: event.clientX, clientY: event.clientY };
        }, { once: true, capture: true }));
        await page.mouse.move(start.x + 20, start.y + 20);
        await page.mouse.down();
        for (const dy of [-40, -80, -120]) {
          await fab.evaluate((el, dy) => {
            const p = window.dragStart;
            el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: p.id, isPrimary: true,
              screenX: p.screenX, screenY: p.screenY + dy,
              clientX: p.clientX, clientY: p.clientY + dy * (350 / 844) }));
          }, dy);
          const box = await fab.boundingBox();
          assert.ok(Math.abs(box.y - (start.y + dy)) < 1, JSON.stringify({ dy, start, box }));
        }
        await fab.evaluate(el => {
          const p = window.dragStart;
          el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: p.id, isPrimary: true,
            screenX: p.screenX, screenY: p.screenY + 500, clientX: p.clientX, clientY: 844 }));
        });
        const bottom = await fab.boundingBox();
        assert.ok(Math.abs(bottom.y + bottom.height - (160 + 350 - 8)) < 1);
        await page.mouse.up();
        assert.equal(await editor.evaluate(el => document.activeElement === el), true);
        await page.evaluate(() => viewportTo({ height: 844, offsetTop: 0 }));
      });
      await t.test('普通 Enter 与 Shift+Enter 换行；Ctrl+Enter 和发送按钮可发送', async () => {
        await editor.fill('第一行');
        await editor.press('End');
        await editor.press('Enter');
        assert.equal(await editor.textContent(), '第一行\n');
        await editor.press('Shift+Enter');
        assert.equal(await editor.textContent(), '第一行\n\n');
        assert.equal(await page.evaluate(() => testState.sends), 0);
        await editor.press('Control+Enter');
        await page.locator('#send').click();
        assert.equal(await page.evaluate(() => testState.sends), 2);
        assert.equal(await editor.getAttribute('enterkeyhint'), 'enter');
      });
      await t.test('仅 beforeinput 的 iOS 换行、选词 Enter、补全菜单不误发送', async () => {
        await editor.click();
        const before = await page.evaluate(() => testState.inserts);
        await editor.evaluate(el => el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })));
        assert.equal(await page.evaluate(() => testState.inserts), before + 1);
        await editor.dispatchEvent('compositionstart');
        await editor.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
        await editor.evaluate(el => el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true })));
        assert.equal(await page.evaluate(() => testState.inserts), before + 1);
        await editor.dispatchEvent('compositionend');
        await page.waitForTimeout(20);
        await page.evaluate(() => {
          const menu = document.createElement('div'); menu.dataset.triggerMenu = '';
          document.querySelector('[data-composer-seat]').append(menu);
        });
        await editor.press('Enter');
        assert.equal(await page.evaluate(() => testState.menuSelections), 1);
        assert.equal(await page.evaluate(() => testState.sends), 2);
        await page.locator('[data-trigger-menu]').evaluate(el => el.remove());
      });
      await t.test('辅助键默认收起，无 Shift，展开不丢焦点，Ctrl 与 Tab 可用', async () => {
        const toggle = page.locator('[data-keys-toggle]');
        const ctrl = page.locator('[data-key="ctrl"]');
        const tab = page.locator('[data-key="tab"]');
        assert.equal(await page.locator('[data-key="shift"]').count(), 0);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await ctrl.isVisible(), false);
        assert.equal(await tab.isVisible(), false);
        assert.equal(await toggle.evaluate(el => !!el.closest('[data-slot="conversation.input.right"]')), true);
        const entry = await toggle.boundingBox();
        const toolbar = await page.locator('[data-composer-toolbar]').boundingBox();
        const send = await page.locator('#send').boundingBox();
        assert.ok(entry.y >= toolbar.y && entry.y + entry.height <= toolbar.y + toolbar.height);
        assert.ok(entry.x + entry.width <= send.x);
        await editor.evaluate(el => el.replaceChildren());
        await editor.fill('AB');
        await editor.press('ArrowLeft');
        const closed = await toggle.boundingBox();
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await editor.evaluate(el => document.activeElement === el), true);
        assert.deepEqual(await toggle.boundingBox(), closed);
        assert.deepEqual(await page.locator('#send').boundingBox(), send);
        await tab.click();
        assert.equal(await editor.textContent(), 'A\tB');
        assert.equal(await editor.evaluate(el => document.activeElement === el), true);
        await ctrl.click();
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'true');
        const sends = await page.evaluate(() => testState.sends);
        await editor.press('Enter');
        assert.equal(await page.evaluate(() => testState.sends), sends + 1);
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'false');
        await ctrl.click();
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'false');
        await toggle.click();
      });
      await t.test('辅助 Tab 保留补全菜单，并能发给终端或编辑器', async () => {
        const toggle = page.locator('[data-keys-toggle]');
        const ctrl = page.locator('[data-key="ctrl"]');
        const tab = page.locator('[data-key="tab"]');
        await editor.evaluate(el => el.replaceChildren());
        await editor.fill('补全');
        await toggle.click();
        await page.evaluate(() => {
          const menu = document.createElement('div'); menu.dataset.triggerMenu = '';
          document.querySelector('[data-composer-seat]').append(menu);
          window.closeTestMenu = () => menu.remove();
          document.addEventListener('pointerdown', closeTestMenu, true);
          document.querySelector('[data-composer-input]').addEventListener('keydown', event => {
            if (event.key === 'Tab') { event.preventDefault(); testState.menuTab = true; }
          }, { once: true });
        });
        await tab.click();
        assert.equal(await page.evaluate(() => testState.menuTab), true);
        assert.equal(await page.locator('[data-trigger-menu]').count(), 1);
        assert.equal(await editor.textContent(), '补全');
        await page.evaluate(() => {
          document.removeEventListener('pointerdown', closeTestMenu, true);
          closeTestMenu();
          const terminal = document.createElement('textarea');
          terminal.id = 'terminal-fixture';
          terminal.style.cssText = 'flex:1;min-height:0;width:100%';
          terminal.value = 'terminal';
          terminal.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            testState.terminalTab = { key: event.key, ctrl: event.ctrlKey };
          });
          const surface = document.createElement('section');
          surface.dataset.sidebarTerminal = '';
          surface.style.cssText = 'position:absolute;top:140px;left:8px;width:240px;height:180px;display:flex;flex-direction:column';
          surface.append(terminal);
          document.getElementById('root').append(surface);
        });
        const terminal = page.locator('#terminal-fixture');
        await terminal.focus();
        assert.equal(await toggle.evaluate(el => !!el.closest('[data-sidebar-terminal]')), true);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        await ctrl.click();
        await tab.click();
        assert.deepEqual(await page.evaluate(() => testState.terminalTab), { key: 'Tab', ctrl: true });
        assert.equal(await terminal.inputValue(), 'terminal');
        assert.equal(await terminal.evaluate(el => document.activeElement === el), true);
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'false');
        await ctrl.focus();
        await ctrl.press('Enter');
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'true');
        await tab.focus();
        await tab.press('Enter');
        assert.deepEqual(await page.evaluate(() => testState.terminalTab), { key: 'Tab', ctrl: true });
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'false');
        await terminal.evaluate(el => el.closest('[data-sidebar-terminal]').remove());
        await page.waitForFunction(() => !!document.querySelector('[data-keys-toggle]')?.closest('[data-composer-seat]'));
        await toggle.click();
        await toggle.focus();
        await toggle.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await ctrl.click();
        await page.setViewportSize({ width: 1200, height: 900 });
        await page.waitForFunction(() => document.querySelector('[data-keys-toggle]').getAttribute('aria-expanded') === 'false');
        assert.equal(await ctrl.getAttribute('aria-pressed'), 'false');
        await page.setViewportSize({ width: 390, height: 844 });
        await editor.click();
      });
      await t.test('编辑器使用自己的局部辅助键，不向聊天草稿插入字符', async () => {
        const draft = await editor.textContent();
        for (const className of ['cm-editor', 'monaco-editor']) {
          await page.evaluate(className => {
            const surface = document.createElement('section');
            surface.id = 'code-fixture';
            surface.className = className;
            surface.style.cssText = 'position:absolute;top:140px;left:8px;width:300px;height:180px;display:flex;flex-direction:column';
            const input = document.createElement('div');
            input.contentEditable = 'true';
            input.setAttribute('role', 'textbox');
            input.textContent = 'code';
            input.style.cssText = 'flex:1;min-height:0;overflow:auto';
            input.addEventListener('keydown', event => {
              if (event.key !== 'Tab') return;
              event.preventDefault();
              testState.codeTab = { key: event.key, ctrl: event.ctrlKey };
            });
            surface.append(input);
            document.getElementById('root').append(surface);
          }, className);
          const code = page.locator('#code-fixture [role="textbox"]');
          await code.focus();
          const toggle = page.locator('[data-keys-toggle]');
          assert.equal(await toggle.evaluate(el => el.closest('#code-fixture') !== null), true);
          await toggle.click();
          await page.locator('[data-key="ctrl"]').click();
          await page.locator('[data-key="tab"]').click();
          assert.deepEqual(await page.evaluate(() => testState.codeTab), { key: 'Tab', ctrl: true });
          assert.equal(await code.textContent(), 'code');
          assert.equal(await editor.textContent(), draft);
          await page.locator('#code-fixture').evaluate(el => el.remove());
          await page.waitForFunction(() => !!document.querySelector('[data-keys-toggle]')?.closest('[data-composer-seat]'));
        }
        await editor.click();
      });
      await t.test('重复加载不重复插入，切宽屏恢复宿主行为，卸载清理', async () => {
        await page.evaluate(() => mount());
        const before = await page.evaluate(() => testState.inserts);
        await editor.press('Enter');
        assert.equal(await page.evaluate(() => testState.inserts), before + 1);
        assert.equal(await page.locator('.dsh-mobile-fab').count(), 1);
        await page.setViewportSize({ width: 1200, height: 900 });
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-dsh-mobile'));
        const sends = await page.evaluate(() => testState.sends);
        await editor.press('Enter');
        assert.equal(await page.evaluate(() => testState.sends), sends + 1);
        await page.evaluate(() => unmount());
        assert.equal(await page.locator('.dsh-mobile-fab, .dsh-mobile-scrim, .dsh-mobile-keys').count(), 0);
        assert.equal(await page.locator('style[data-plugin="dsh-mobile-kb"]').count(), 0);
        assert.equal(await editor.getAttribute('enterkeyhint'), null);
      });
    } finally { await browser.close(); }
  });
}
