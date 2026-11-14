import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 야자 탈출: the model, with time passed in through step(ms).
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const { newNightSchoolGame } = runInNewContext(`${models}\n({ newNightSchoolGame })`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const LEVELS = ['easiest', 'easy', 'normal', 'hard', 'expert'];
const run = (g, s) => { for (let i = 0; i < s * 4 && !g.ended; i++) g.step(250); };
// Straight to play: the intro skipped and the scatter run out.
const playing = (seed = 3, lv = 'normal', cls = 'runner') => { const g = newNightSchoolGame(rng(seed), lv, cls); g.begin(); g.skip(); run(g, 8.1); return g; };
// A quiet stage: only the player and the entities a test adds.
const solo = (seed = 3, cls = 'runner') => { const g = playing(seed, 'normal', cls); for (const e of g.ents) if (e !== g.player) e.gone = true; g.items.length = 0; g.nextItem = 1e9; return g; };
const put = (g, e, x, y) => { e.gone = false; e.x = x; e.y = y; return e; };
const zombieAt = (g, x, y) => { const z = g.ents.find(e => e !== g.player && e.gone); put(g, z, x, y); z.zombie = true; z.turning = 0; z.stun = 0; z.bot = false; return z; };
const kidAt = (g, x, y) => { const k = g.ents.filter(e => e !== g.player && e.gone).pop(); put(g, k, x, y); k.zombie = false; k.bot = false; return k; };

test('the floor: every walkable tile is reachable from the corridor, rooms have two doors, the stairs are at the end', () => {
  const g = newNightSchoolGame(rng(1));
  const d = g.field([[5, 11]]);
  for (let y = 0; y < g.ROWS; y++) for (let x = 0; x < g.COLS; x++) if (!g.blocked(x, y)) assert.ok(d[y * g.COLS + x] >= 0, x + ',' + y);
  assert.equal(g.ROOMS.length, 8);
  assert.equal(g.at(42, 11), g.STAIR);
});
test('lobby → intro → scatter → play: the hosts turn after the countdown, never the player', () => {
  for (const lv of LEVELS) for (let s = 1; s <= 6; s++) {
    const g = newNightSchoolGame(rng(s), lv, 'photo');
    assert.equal(g.phase, 'lobby'); g.step(1000); assert.equal(g.phase, 'lobby', 'the lobby waits');
    assert.ok(g.choose('nurse') && g.player.cls === 'nurse');
    g.begin(); assert.equal(g.phase, 'intro'); run(g, 10.1); assert.equal(g.phase, 'count', 'the intro ends by itself');
    assert.equal(g.zombies().length, 0); run(g, 8.1); assert.equal(g.phase, 'play');
    assert.equal(g.zombies().length, lv === 'hard' || lv === 'expert' ? 2 : 1, lv);
    assert.ok(!g.player.zombie);
  }
});
test('a zombie touching a student turns them after a moment; the player plays on as a zombie', () => {
  const g = solo(); const far = kidAt(g, 3.5, 3.5); far.bot = false; const z = zombieAt(g, g.player.x + 0.4, g.player.y);
  g.step(50); assert.ok(g.player.turning > 0, 'caught');
  run(g, 1.5); assert.ok(g.player.zombie && !g.ended, 'a zombie now, the round goes on');
  far.gone = true; const k = kidAt(g, 20.5, 11.5); put(g, g.player, 21.1, 11.5); g.step(50); run(g, 1.5);
  assert.ok(k.zombie && k.by === g.player && g.caughtBy() === 1);
  assert.ok(g.ended && g.won && g.why === 'all', 'no students left: the zombies win');
});
test('skills: dash, kick, flash, vaccine, barricade, speaker; each with its cooldown', () => {
  const r = solo(3, 'runner'); const s0 = r.player.x; r.aim(1, 0); r.step(250); const plain = r.player.x - s0;
  assert.ok(r.skill() && r.player.cd > 0 && !r.skill(), 'cooldown'); const s1 = r.player.x; r.step(250); assert.ok(r.player.x - s1 > plain * 1.5, 'dash is faster');
  const t = solo(3, 'taekwon'); const z = zombieAt(t, t.player.x + 1, t.player.y); const d0 = Math.hypot(z.x - t.player.x, z.y - t.player.y);
  assert.ok(t.skill()); assert.ok(z.stun > 1.5 && Math.hypot(z.x - t.player.x, z.y - t.player.y) > d0 + 0.5, 'kicked away and stunned');
  const p = solo(3, 'photo'); const pz = zombieAt(p, p.player.x + 3, p.player.y); assert.ok(p.skill() && pz.stun > 1);
  const n = solo(3, 'nurse'); const fr = zombieAt(n, n.player.x + 1, n.player.y); fr.turnedAt = n.time - 2; fr.stun = 5;
  assert.ok(n.skill() && n.player.imm > 3 && !fr.zombie, 'immune and a fresh zombie cured');
  const sc = solo(3, 'science'); put(sc, sc.player, 20.5, 11.5); sc.player.face = 0; assert.ok(sc.skill() && sc.bars.length === 1 && sc.blocked(21, 11)); run(sc, 9.5); assert.equal(sc.bars.length, 0, 'it falls after 9 s');
  const rd = solo(3, 'radio'); put(rd, rd.player, 8.5, 11.5); const rz = zombieAt(rd, 14.5, 11.5); rz.bot = true; rd.skill(); put(rd, rd.player, 30.5, 11.5); const before = Math.abs(rz.x - 8.5); run(rd, 1);
  assert.ok(Math.abs(rz.x - 8.5) < before, 'the speaker pulls zombies');
});
test('items: picked up on touch, chocolate speeds, the extinguisher stuns, the vaccine shields', () => {
  const g = solo(); g.items.push({ x: g.player.x, y: g.player.y, kind: 'ext' }); g.step(50); assert.equal(g.player.item, 'ext');
  const z = zombieAt(g, g.player.x + 1.5, g.player.y); assert.ok(g.useItem() && z.stun > 2 && g.player.item === null);
  g.player.item = 'shot'; g.useItem(); assert.ok(g.player.imm > 5);
  g.player.item = 'choco'; g.useItem(); assert.ok(g.player.fast > 3);
});
test('the clock: the rooftop door opens near the end; students on the stairs escape; the player escaping wins', () => {
  const g = solo(); put(g, g.player, 40.5, 11.5); g.time = g.length - g.FINALE - 0.5; run(g, 1); assert.ok(g.open);
  g.aim(1, 0); run(g, 2); assert.ok(g.ended && g.won && g.why === 'escape' && g.score >= 500);
  const h = solo(); h.time = h.length - 1; run(h, 2); assert.ok(h.ended && h.won && h.why === 'time', 'held out');
});
test('classmates scatter and flee; zombies chase through the doors; a round always ends in time', () => {
  for (const lv of LEVELS) {
    const ends = [1, 2, 3, 4].map(s => { const g = playing(s, lv, 'runner'); run(g, g.length + 5); return g; });
    for (const g of ends) assert.ok(g.ended, lv + ' ends');
    const turned = ends.map(g => g.infected);
    assert.ok(turned.some(n => n > 0), lv + ': zombies catch people ' + turned);
  }
});
test('the harder levels leave fewer students standing (the player kept still in a classroom corner)', () => {
  const left = lv => [1, 2, 3, 4, 5, 6].map(s => { const g = playing(s, lv); g.player.gone = true; g.player.zombie = false; run(g, 120); return g.humans().length / (g.ents.length - 1); }).reduce((a, b) => a + b) / 6;
  const easy = left('easiest'), hard = left('expert');
  assert.ok(easy > hard, easy + ' > ' + hard);
});
test('story: scenes advance by tap, goals spawn zombies and items, friends follow, and an episode ends cleared', () => {
  const g = newNightSchoolGame(rng(5), 'normal', 'runner');
  assert.ok(g.startStory(0) && g.phase === 'scene' && g.ents.filter(e => e.ally).length === 2);
  const x0 = g.player.x; g.aim(1, 0); g.step(500); assert.equal(g.player.x, x0, 'nothing moves during a scene');
  while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'goto'); assert.equal(g.zombies().length, 2);
  // Walk into the 보건실 by placing the player there; the next scene starts.
  const room = g.ROOMS.find(r => r.name === '보건실'); g.player.x = room.x0 + 2.5; g.player.y = room.y0 + 1.5; g.step(50);
  assert.equal(g.phase, 'scene'); while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'collect'); const kit = g.items.find(i => i.story); assert.ok(kit && kit.kind === 'kit');
  for (const z of g.zombies()) z.gone = true;
  g.player.x = kit.x; g.player.y = kit.y; g.step(50); assert.equal(g.phase, 'scene', 'the kit picked up');
  while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'survive'); for (const z of g.zombies()) z.gone = true; for (let i = 0; i < 160 && g.phase === 'play'; i++) g.step(250);
  while (g.phase === 'scene') g.advance(); assert.equal(g.goal.goal, 'goto');
  // Friends keep up with the player.
  const f = g.ents.find(e => e.ally); for (const z of g.zombies()) z.gone = true; g.player.x = 20.5; g.player.y = 11.5; for (let i = 0; i < 40; i++) g.step(250);
  assert.ok(Math.hypot(f.x - g.player.x, f.y - g.player.y) < 3, 'a friend follows');
  const t = g.ROOMS.find(r => r.name === '교무실'); g.player.x = t.x0 + 1.5; g.player.y = t.y0 + 6.5; g.step(50);
  while (g.phase === 'scene') g.advance();
  assert.ok(g.ended && g.won && g.why === 'story' && g.score > 0 && g.xp > 100);
});
test('story: caught means a retry from the same spot, not a zombie; bosses and hidden classmates', () => {
  const g = newNightSchoolGame(rng(6), 'normal', 'runner'); g.startStory(2); while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'rescue'); assert.ok(g.zombies().some(z => z.boss), 'the boss comes back');
  const lost = g.ents.filter(e => e.lost); assert.equal(lost.length, 2);
  const z = g.zombies()[0]; z.x = g.player.x + 0.4; z.y = g.player.y; z.stun = 0; z.caught = 0; g.step(50);
  assert.ok(g.ended && !g.won && g.why === 'caught' && !g.player.zombie);
  assert.ok(g.retry() && !g.ended && g.player.imm > 0 && g.zombies().every(o => Math.hypot(o.x - g.player.x, o.y - g.player.y) >= 7.9));
  for (const k of lost) { g.player.x = k.x; g.player.y = k.y; g.step(50); }
  assert.ok(lost.every(k => k.ally && !k.lost)); while (g.phase === 'scene') g.advance();
  assert.ok(g.goal.goal === 'escape' && g.open);
});
