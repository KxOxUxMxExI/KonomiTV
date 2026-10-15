import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Use the repository's existing TypeScript compiler, without adding a test framework.
const source = await readFile(new URL('../src/utils/CarControls.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { CarControls, CHANNEL_SETTLE_MS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const channels = ['gr011', 'gr021', 'gr041'];

test('restores the last channel and falls back when it was removed', () => {
    assert.equal(new CarControls(channels, 'gr021', () => {}).selectedChannelId, 'gr021');
    assert.equal(new CarControls(channels, 'removed', () => {}).selectedChannelId, 'gr011');
    const empty = new CarControls([], 'gr011', () => {});
    empty.move(1);
    assert.equal(empty.selectedChannelId, null);
});

test('rapid rotation changes only the final channel after it settles', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr011', id => committed.push(id));
    control.move(1);
    t.mock.timers.tick(CHANNEL_SETTLE_MS - 1);
    assert.deepEqual(committed, []);
    control.move(1);
    t.mock.timers.tick(CHANNEL_SETTLE_MS - 1);
    assert.deepEqual(committed, []);
    t.mock.timers.tick(1);
    assert.deepEqual(committed, ['gr041']);
    assert.equal(control.activeChannelId, 'gr041');
    control.dispose();
});

test('rotation wraps and returning to the active channel avoids reconnecting', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr011', id => committed.push(id));
    control.move(-1);
    assert.equal(control.selectedChannelId, 'gr041');
    control.move(1);
    t.mock.timers.tick(CHANNEL_SETTLE_MS);
    assert.deepEqual(committed, []);
    control.dispose();
});

test('press expands video and back restores the menu without changing channel', () => {
    const control = new CarControls(channels, 'gr021', () => {});
    control.confirm();
    assert.equal(control.menuVisible, false);
    control.back();
    assert.equal(control.menuVisible, true);
    assert.equal(control.activeChannelId, 'gr021');
    control.dispose();
});

test('background cancellation and disposal prevent a stale channel switch', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr011', id => committed.push(id));
    control.move(1);
    control.cancel();
    assert.equal(control.selectedChannelId, 'gr011');
    t.mock.timers.tick(CHANNEL_SETTLE_MS);
    assert.deepEqual(committed, []);
    control.move(1);
    control.dispose();
    t.mock.timers.tick(CHANNEL_SETTLE_MS);
    assert.deepEqual(committed, []);
});
test('hides only the channel menu after five idle seconds without changing playback', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr011', id => committed.push(id));
    control.back();
    t.mock.timers.tick(4_999);
    assert.equal(control.menuAutoHidden, false);
    t.mock.timers.tick(1);
    assert.equal(control.menuAutoHidden, true);
    assert.equal(control.menuVisible, true);
    assert.equal(control.activeChannelId, 'gr011');
    assert.deepEqual(committed, []);
    control.dispose();
});

test('rotation, focus on the current channel and Back restart the idle timeout', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const control = new CarControls(channels, 'gr011', () => {});
    control.back();
    t.mock.timers.tick(5_000);
    control.move(1);
    assert.equal(control.menuAutoHidden, false);
    t.mock.timers.tick(4_000);
    control.select(control.selectedIndex);
    t.mock.timers.tick(4_999);
    assert.equal(control.menuAutoHidden, false);
    t.mock.timers.tick(1);
    assert.equal(control.menuAutoHidden, true);
    control.back();
    assert.equal(control.menuAutoHidden, false);
    t.mock.timers.tick(5_000);
    assert.equal(control.menuAutoHidden, true);
    control.dispose();
});

test('manual fullscreen stays fullscreen while selecting channels', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const control = new CarControls(channels, 'gr011', () => {});
    control.back();
    control.confirm();
    control.move(1);
    t.mock.timers.tick(10_000);
    assert.equal(control.menuVisible, false);
    assert.equal(control.menuAutoHidden, false);
    assert.equal(control.activeChannelId, 'gr021');
    control.back();
    assert.equal(control.menuVisible, true);
    control.dispose();
});

test('backgrounding and disposal cancel the idle timeout', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const control = new CarControls(channels, 'gr011', () => {});
    control.back();
    control.cancel();
    t.mock.timers.tick(5_000);
    assert.equal(control.menuAutoHidden, false);
    control.back();
    control.dispose();
    control.activity();
    t.mock.timers.tick(5_000);
    assert.equal(control.menuAutoHidden, false);
});
