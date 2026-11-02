import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const writing = source.slice(source.indexOf('  function writingLoad('), source.indexOf('  /* Sound:'));
const detection = source.slice(source.indexOf('  function generating(h)'), source.indexOf('  function sync()'));
const { writingLoad, generating } = runInNewContext(`${writing}\n${detection}\n({ writingLoad, generating })`);

function host(state, fields = {}, { text = 'Reading the scenario…', hidden = false, error = false, paused = false } = {}) {
  const center = {
    textContent: text,
    closest: selector => selector === '[hidden]' ? (hidden ? {} : null) : (error || paused ? {} : null),
    getClientRects: () => hidden ? [] : [{}],
  };
  return { _boot: 'ready', _state: () => state, shadowRoot: { querySelector: () => center }, ...fields };
}

test('first world founding cast is generation even without generation words', () => {
  assert.equal(generating(host('banner', { _bannerState: 'loading' })), true);
});
test('first world art continues through portrait and banner stages', () => {
  for (const text of ['Painting Alice… 1/6', 'The banner splash', 'Founding cast']) {
    assert.equal(generating(host('art', { _artState: 'painting' }, { text })), true);
  }
});
test('world creation never shows games while paused, failed, finished or cancelled', () => {
  for (const state of ['idle', 'error', 'cancelled', 'ready']) {
    assert.equal(generating(host('banner', { _bannerState: state }, { text: 'Generating world…' })), false);
  }
  for (const state of ['idle', 'blocked', 'cancelled', 'ready']) {
    assert.equal(generating(host('art', { _artState: state }, { text: 'Rendering portraits…' })), false);
  }
});
test('hidden and error panels never offer games', () => {
  for (const options of [{ hidden: true }, { error: true }, { paused: true }]) {
    assert.equal(writingLoad(host('banner', { _bannerState: 'loading' }, { ...options, text: 'Generating world…' })), false);
  }
  assert.equal(generating(host('banner', { _bannerState: 'loading', _forgeCancelling: true })), false);
});
test('boot and written chapter fetches remain excluded', () => {
  for (const _boot of ['idle', 'loading']) {
    assert.equal(generating(host('forge', { _boot }, { text: 'Generating story…' })), false);
  }
  assert.equal(generating(host('forge', { _hudView: 'forge', _chapterWritten: () => true }, { text: 'Generating story…' })), false);
});
test('chapter generation still works and stops on failure or completion', () => {
  assert.equal(generating(host('forge', {}, { text: 'Generating story…' })), true);
  for (const text of ['Completed', 'Generation failed', 'Cancelled']) {
    assert.equal(generating(host('forge', {}, { text })), false);
  }
  assert.equal(writingLoad(null), false);
  assert.equal(generating(host('forge', { _state: undefined }, { text: 'Generating story…' })), true);
});
