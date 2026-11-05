import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// Five levels per game, the stages of the board games, and the ramps inside a run.
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const names = ['newMineGame', 'newFruitGame', 'new2048Game', 'newMemoryGame', 'newShopGame', 'newPinballGame', 'newBrickGame', 'newBlockGame', 'newSnakeGame',
  'newRecipeGame', 'newPopGame', 'newSlideGame', 'newLightsGame', 'newDropGame', 'newDinoGame', 'newWaterSortGame', 'newKnifeGame', 'newCountMastersGame', 'newCandyGame', 'newSurviveGame', 'newBusGame', 'newZombieGame', 'newJumpGame', 'newDigGame'];
const games = runInNewContext(`${models}\nObject.fromEntries(${JSON.stringify(names)}.map(name => [name, eval(name)]))`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const LEVELS = ['easiest', 'easy', 'normal', 'hard', 'expert'];

test('every game builds at all five levels', () => {
  for (const name of names) for (const lv of LEVELS) assert.ok(games[name](rng(), lv), `${name} ${lv}`);
});
test('the game table offers the same five levels for every game', () => {
  const table = source.slice(source.indexOf('    const GAMES = {'), source.indexOf('    const fresh = (which'));
  const rows = table.split('\n').filter((l) => l.includes('levels: ['));
  assert.equal(rows.length, 25);
  for (const row of rows) assert.deepEqual([...row.matchAll(/\['(\w+)', '[^']+', '[^']*'\]/g)].map((m) => m[1]), LEVELS, row.slice(0, 40));
});
test('levels get harder from 입문 to 달인', () => {
  const mines = LEVELS.map((lv) => games.newMineGame(rng(), lv).mines);
  assert.deepEqual([...mines].sort((a, b) => a - b), mines);
  const snake = LEVELS.map((lv) => games.newSnakeGame(rng(), lv).speed);
  assert.deepEqual([...snake].sort((a, b) => b - a), snake);
  const fruit = LEVELS.map((lv) => games.newFruitGame(rng(), lv).time);
  assert.deepEqual([...fruit].sort((a, b) => b - a), fruit);
  assert.ok(games.newShopGame(rng(), 'expert').goal > games.newShopGame(rng(), 'hard').goal);
});
test('stages: each one is harder than the last at the same level', () => {
  const m1 = games.newMineGame(rng(), 'normal', 1), m3 = games.newMineGame(rng(), 'normal', 3);
  assert.ok(m3.mines / (m3.cols * m3.cols) > m1.mines / (m1.cols * m1.cols), 'denser mines');
  assert.ok(games.newMemoryGame(rng(), 'easy', [], 2).pairs > games.newMemoryGame(rng(), 'easy', [], 1).pairs);
  assert.equal(games.newSlideGame(rng(), 'easiest', 2).cols, 5);
  assert.ok(games.newShopGame(rng(), 'normal', 2).goal > games.newShopGame(rng(), 'normal', 1).goal);
  assert.ok(games.newPopGame(rng(), 'easy', 3).colours > games.newPopGame(rng(), 'easy', 1).colours);
  // A fixed draw keeps both courses on the same gates, so only the enemy crowds differ.
  const enemy = (s) => games.newCountMastersGame(() => 0.99, 'normal', s).events.find((e) => e.type === 'enemy').value;
  assert.ok(enemy(4) > enemy(1), `${enemy(1)} → ${enemy(4)}`);
});
test('memory cards always lay out in full rows, no taller than wide', () => {
  for (const lv of LEVELS) for (let s = 1; s <= 8; s++) {
    const g = games.newMemoryGame(rng(), lv, [], s);
    assert.equal(g.cells.length % g.cols, 0, `${lv} ${s}`);
    assert.ok(g.rows <= g.cols && g.pairs <= 18, `${lv} ${s}: ${g.cols}×${g.rows}`);
  }
});
test('snake speeds up as it eats, to 55% of its start (never under 50 ms)', () => {
  const g = games.newSnakeGame(rng(), 'easiest'), start = g.speed;
  for (let k = 0; k < 40; k++) { const head = g.body[0]; g.food = head + 1; g.step(); if (g.ended) break; g.body.length = 3; g.body[0] = head; }
  assert.ok(g.speed < start && g.speed >= Math.max(50, Math.round(start * 0.55)), `${start} → ${g.speed}`);
});
test('recipe plays back faster every round', () => {
  const g = games.newRecipeGame(rng(), 'normal'), start = g.speed;
  for (let r = 0; r < 5; r++) for (const p of g.sequence.slice()) g.press(p);
  assert.equal(g.round, 5);
  assert.ok(g.speed < start);
});
test('cookie shop: guests come sooner and wait less as the day fills up', () => {
  const g = games.newShopGame(rng(), 'normal');
  g.open(0); const first = g.queue[0].patience;
  g.queue.length = 0; g.money = g.goal * 0.9; g.next = 0; g.update(100);
  assert.ok(g.queue[0].patience < first, `${first} → ${g.queue[0].patience}`);
});
test('jelly block deals bigger pieces later on', () => {
  // Placing the last piece of a tray deals the next three; count their cells at a low and a high score.
  const dealt = (score) => {
    let total = 0;
    for (let k = 0; k < 40; k++) {
      const g = games.newBlockGame(rng(k + 1), 'easiest'), p = g.tray[0];
      g.score = score; g.tray = [p, null, null];
      g.place(0, 0, 0);
      total += g.tray.reduce((n, x) => n + (x ? x.cells.length : 0), 0);
    }
    return total;
  };
  assert.ok(dealt(1500) > dealt(0), `${dealt(0)} vs ${dealt(1500)}`);
});
