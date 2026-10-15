import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const state = {};
const mpegts = {
    Events: { ERROR: 'error' },
    getFeatureList: () => ({ mseH265Playback: state.supported }),
    supportWorkerForMSEH265Playback: () => state.worker(),
    createPlayer: (source) => {
        const player = { source, destroyed: 0, on: (_, handler) => { player.error = handler; },
            attachMediaElement: () => {}, load: () => {}, destroy: () => { player.destroyed++; } };
        state.players.push(player);
        return player;
    },
};
globalThis.__carMpegts = mpegts;
const source = (await readFile(new URL('../src/services/player/CarPlayer.ts', import.meta.url), 'utf8'))
    .replace("import mpegts from 'mpegts.js';", 'const mpegts = globalThis.__carMpegts;')
    .replace("import Utils from '@/utils';", "const Utils = { api_base_url: '/api' };");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { default: CarPlayer } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
function setup() {
    Object.assign(state, { supported: true, worker: async () => false, players: [] });
    const reports = [];
    const video = { paused: true, play: async () => { video.paused = false; }, pause: () => { video.paused = true; }, removeAttribute: () => {}, load: () => {} };
    return { video, reports, player: new CarPlayer(video, (...report) => reports.push(report)) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('unsupported HEVC stays explicit when a waiting event arrives', async () => {
    const { player, reports } = setup();
    state.supported = false;
    await player.start('gr011');
    player.waiting();
    assert.match(reports.at(-1)[0], /HEVC/);
    assert.equal(reports.at(-1)[1], false);
    assert.equal(state.players.length, 0);
});

test('a stale asynchronous capability check cannot connect the previous channel', async () => {
    const { player } = setup();
    let completeFirst;
    state.worker = () => new Promise(resolve => { completeFirst = resolve; });
    const first = player.start('gr011');
    state.worker = async () => false;
    await player.start('gr021');
    completeFirst(false);
    await first;
    assert.equal(state.players.length, 1);
    assert.equal(state.players[0].source.url, '/api/streams/live/gr021/480p-hevc/mpegts');
    player.stop();
});

test('switching and backgrounding release the previous stream', async () => {
    const { player, video } = setup();
    await player.start('gr011');
    await player.start('gr021');
    assert.equal(state.players[0].destroyed, 1);
    player.stop();
    assert.equal(state.players[1].destroyed, 1);
    assert.equal(video.paused, true);
});

test('commander press resumes blocked autoplay without reconnecting', async () => {
    const { player, video, reports } = setup();
    video.play = async () => { throw new Error('Autoplay blocked'); };
    await player.start('gr011');
    assert.match(reports.at(-1)[0], /押し込み/);
    video.play = async () => { video.paused = false; };
    player.resume();
    await flush();
    player.playing();
    assert.deepEqual(reports.at(-1), ['', false]);
    assert.equal(state.players.length, 1);
    player.stop();
});

test('commander press reconnects after a stream error', async () => {
    const { player, reports } = setup();
    await player.start('gr011');
    state.players[0].error('network', 'offline');
    assert.equal(state.players[0].destroyed, 1);
    assert.equal(reports.at(-1)[1], true);
    player.waiting();
    assert.match(reports.at(-1)[0], /再試行/);
    player.resume();
    await flush();
    assert.equal(state.players.length, 2);
    assert.equal(state.players[1].source.url, '/api/streams/live/gr011/480p-hevc/mpegts');
    player.stop();
});

test('press stops the live connection and the next press restarts the same channel', async () => {
    const { player, video, reports } = setup();
    await player.start('gr011');
    player.toggle();
    assert.equal(player.isUserStopped, true);
    assert.equal(state.players[0].destroyed, 1);
    assert.equal(video.paused, true);
    assert.match(reports.at(-1)[0], /停止中/);
    player.stop();
    assert.equal(player.isUserStopped, true);
    player.toggle();
    await flush();
    assert.equal(player.isUserStopped, false);
    assert.equal(state.players.length, 2);
    assert.equal(state.players[1].source.url, '/api/streams/live/gr011/480p-hevc/mpegts');
    player.stop();
});

test('press can cancel startup before codec capability resolution', async () => {
    const { player } = setup();
    let complete;
    state.worker = () => new Promise(resolve => { complete = resolve; });
    const starting = player.start('gr011');
    player.toggle();
    complete(false);
    await starting;
    assert.equal(player.isUserStopped, true);
    assert.equal(state.players.length, 0);
});

test('press resumes blocked autoplay instead of stopping the loaded stream', async () => {
    const { player, video } = setup();
    video.play = async () => { throw new Error('Autoplay blocked'); };
    await player.start('gr011');
    video.play = async () => { video.paused = false; };
    player.toggle();
    await flush();
    assert.equal(player.isUserStopped, false);
    assert.equal(state.players.length, 1);
    assert.equal(video.paused, false);
    player.stop();
});
