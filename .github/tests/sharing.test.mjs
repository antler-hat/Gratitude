import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const handlers = html.slice(html.indexOf('    async function shareCompletion()'), html.indexOf('    function restart()'));

function setup(navigator, value = 'I did my daily gratitude today ✅') {
  const shareMessage = {
    value,
    focused: false,
    selected: false,
    focus() { this.focused = true; },
    select() { this.selected = true; },
  };
  const context = vm.createContext({ navigator, shareMessage, shareStatus: { textContent: '' } });
  vm.runInContext(handlers, context);
  return context;
}

test('shares only the editable completion message', async () => {
  let shared;
  const context = setup({ share: async data => { shared = data; } }, '  Done today! ✅  ');
  await context.shareCompletion();
  assert.equal(shared.text, 'Done today! ✅');
  assert.deepEqual(Object.keys(shared), ['text']);
  assert.equal(context.shareStatus.textContent, '');
});

test('cancel is quiet and sharing errors offer copying', async () => {
  const navigator = { share: async () => { throw { name: 'AbortError' }; } };
  const context = setup(navigator);
  await context.shareCompletion();
  assert.equal(context.shareStatus.textContent, '');
  navigator.share = async () => { throw { name: 'NotAllowedError' }; };
  await context.shareCompletion();
  assert.match(context.shareStatus.textContent, /Try Copy message/);
});

test('copies edited text and supports manual copying when clipboard is unavailable or denied', async () => {
  let copied;
  const navigator = { clipboard: { writeText: async text => { copied = text; } } };
  const context = setup(navigator, 'Finished!');
  await context.copyCompletion();
  assert.equal(copied, 'Finished!');
  assert.match(context.shareStatus.textContent, /Message copied/);
  navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  await context.copyCompletion();
  assert.equal(context.shareMessage.selected, true);
  assert.match(context.shareStatus.textContent, /Copy the selected message/);
  delete navigator.clipboard;
  await context.copyCompletion();
  assert.match(context.shareStatus.textContent, /Copy the selected message/);
});

test('empty messages are not shared or copied', async () => {
  const context = setup({
    share: async () => assert.fail('Must not share'),
    clipboard: { writeText: async () => assert.fail('Must not copy') },
  }, '  \n ');
  for (const action of ['shareCompletion', 'copyCompletion']) {
    await context[action]();
    assert.equal(context.shareStatus.textContent, 'Write a message first.');
    assert.equal(context.shareMessage.focused, true);
  }
});
