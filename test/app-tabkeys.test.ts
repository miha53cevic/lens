import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { HINT_DELAY_MS, TabKeys, type KeyInput } from '../src/desktop/main/tabKeys.ts';

/** TabKeys on a platform, with a clock the test moves: what it told the window, in order. */
function keys(platform = 'darwin') {
  const told: string[] = [];
  let due: { run: () => void; ms: number } | null = null;
  const tabKeys = new TabKeys(
    platform,
    {
      hints: (on) => told.push(on ? 'hints on' : 'hints off'),
      select: (index) => told.push('select ' + index),
      released: () => told.push('released'),
    },
    (run, ms) => {
      due = { run, ms };
      return () => {
        due = null;
      };
    },
  );
  return {
    told,
    tabKeys,
    /** The modifier's delay passes */
    wait() {
      const pending = due;
      due = null;
      if (pending) {
        assert.equal(pending.ms, HINT_DELAY_MS);
        pending.run();
      }
    },
  };
}

const MOD = { meta: true, control: false, shift: false, alt: false };
function key(type: 'keyDown' | 'keyUp', key: string, held: Partial<KeyInput> = MOD, code = ''): KeyInput {
  return { type, key, code, isAutoRepeat: false, meta: false, control: false, shift: false, alt: false, ...held };
}
const down = (name: string, code = '', held: Partial<KeyInput> = MOD) => key('keyDown', name, held, code);
const up = (name: string, held: Partial<KeyInput> = {}) => key('keyUp', name, held);

test('tab keys: ⌘ held alone numbers the tabs after a moment, and let go hides them', () => {
  const { told, tabKeys, wait } = keys();
  assert.equal(tabKeys.input(down('Meta')), false, 'the modifier itself goes on to the page');
  assert.deepEqual(told, []);
  tabKeys.input({ ...down('Meta'), isAutoRepeat: true });
  wait();
  assert.deepEqual(told, ['hints on']);
  tabKeys.input(up('Meta'));
  assert.deepEqual(told, ['hints on', 'hints off', 'released']);
});

test('tab keys: a quick ⌘C never shows the numbers, and goes on to the page', () => {
  const { told, tabKeys, wait } = keys();
  tabKeys.input(down('Meta'));
  assert.equal(tabKeys.input(down('c', 'KeyC')), false);
  wait();
  tabKeys.input(up('Meta'));
  assert.deepEqual(told, ['released', 'released'], 'no numbers, only the modifier let go');
});

test('tab keys: ⌘1–⌘8 pick that tab, ⌘9 the last, and the numbers stay while ⌘ is held', () => {
  const { told, tabKeys, wait } = keys();
  tabKeys.input(down('Meta'));
  wait();
  assert.equal(tabKeys.input(down('2', 'Digit2')), true, "a tab's key: the page doesn't get it");
  assert.equal(tabKeys.input(up('2', MOD)), false);
  tabKeys.input(down('&', 'Digit1'));
  tabKeys.input(down('9', 'Digit9'));
  assert.deepEqual(told, ['hints on', 'select 1', 'select 0', 'select last']);
  assert.equal(tabKeys.input(down('0', 'Digit0')), false, '⌘0 is not a tab');
});

test('tab keys: with ⇧ or ⌥ too, a digit is the page’s, and the numbers go', () => {
  const { told, tabKeys, wait } = keys();
  tabKeys.input(down('Meta'));
  wait();
  assert.equal(tabKeys.input(down('Shift', 'ShiftLeft', { ...MOD, shift: true })), false);
  assert.equal(tabKeys.input(down('!', 'Digit1', { ...MOD, shift: true })), false);
  assert.equal(tabKeys.input(down('¡', 'Digit1', { ...MOD, alt: true })), false);
  assert.deepEqual(told, ['hints on', 'hints off', 'released', 'released', 'released']);
});

test('tab keys: Ctrl off macOS, where ⊞ (meta) is not the modifier', () => {
  const { told, tabKeys, wait } = keys('win32');
  const ctrl = { meta: false, control: true };
  tabKeys.input(down('Meta', '', { meta: true }));
  wait();
  assert.equal(tabKeys.input(down('3', 'Digit3', { meta: true })), false);
  tabKeys.input(down('Control', '', ctrl));
  wait();
  assert.equal(tabKeys.input(down('3', 'Digit3', ctrl)), true);
  // AltGr comes as Ctrl and Alt: not a tab's key
  assert.equal(tabKeys.input(down('{', 'Digit7', { ...ctrl, alt: true })), false);
  assert.deepEqual(told, ['released', 'released', 'hints on', 'select 2', 'hints off', 'released']);
});

test('tab keys: the window losing the keys hides the numbers and drops the wait', () => {
  const { told, tabKeys, wait } = keys();
  tabKeys.input(down('Meta'));
  tabKeys.reset();
  wait();
  assert.deepEqual(told, ['released']);
  tabKeys.input(down('Meta'));
  wait();
  tabKeys.reset();
  assert.deepEqual(told, ['released', 'hints on', 'hints off', 'released']);
});
