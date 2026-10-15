import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/CarControls.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { CarControls } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const channels = ['gr011', 'gr021', 'gr041'];

test('restores the last channel with the menu hidden and falls back if removed', () => {
    assert.equal(new CarControls(channels, 'gr021', () => {}).activeChannelId, 'gr021');
    const fallback = new CarControls(channels, 'removed', () => {});
    assert.equal(fallback.activeChannelId, 'gr011');
    assert.equal(fallback.menuVisible, false);
    const empty = new CarControls([], null, () => {});
    empty.move(1);
    assert.equal(empty.selectedChannelId, null);
    assert.equal(empty.confirm(), false);
});

test('rotation is reversed, wraps, and changes only the candidate until pressed', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr021', id => committed.push(id));
    control.move(1);
    assert.equal(control.menuVisible, true);
    assert.equal(control.selectedChannelId, 'gr011');
    control.move(1);
    assert.equal(control.selectedChannelId, 'gr041');
    t.mock.timers.tick(1_000);
    assert.equal(control.activeChannelId, 'gr021');
    assert.deepEqual(committed, []);
    control.move(-1);
    assert.equal(control.selectedChannelId, 'gr011');
    control.dispose();
});

test('press commits the selected channel once and hides the menu', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr021', id => committed.push(id));
    control.move(1);
    assert.equal(control.confirm(), true);
    assert.deepEqual(committed, ['gr011']);
    assert.equal(control.activeChannelId, 'gr011');
    assert.equal(control.menuVisible, false);
    assert.equal(control.confirm(), false);
    assert.deepEqual(committed, ['gr011']);
    control.dispose();
});

test('five seconds after the last rotation hide the menu and discard an unconfirmed choice', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr021', id => committed.push(id));
    control.move(1);
    t.mock.timers.tick(4_000);
    control.move(-1);
    t.mock.timers.tick(4_999);
    assert.equal(control.menuVisible, true);
    t.mock.timers.tick(1);
    assert.equal(control.menuVisible, false);
    assert.equal(control.selectedChannelId, 'gr021');
    assert.deepEqual(committed, []);
    control.dispose();
});

test('hidden focus/click selection cannot open a menu or change the station', () => {
    const control = new CarControls(channels, 'gr021', () => { throw new Error('Unexpected channel switch'); });
    control.select(0);
    assert.equal(control.menuVisible, false);
    assert.equal(control.selectedChannelId, 'gr021');
    assert.equal(control.confirm(), false);
    control.dispose();
});

test('background cancellation and disposal discard candidates and ignore further rotation', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const committed = [];
    const control = new CarControls(channels, 'gr021', id => committed.push(id));
    control.move(1);
    control.cancel();
    assert.equal(control.menuVisible, false);
    assert.equal(control.selectedChannelId, 'gr021');
    control.move(1);
    control.dispose();
    control.move(-1);
    assert.equal(control.confirm(), false);
    t.mock.timers.tick(10_000);
    assert.equal(control.menuVisible, false);
    assert.deepEqual(committed, []);
});
