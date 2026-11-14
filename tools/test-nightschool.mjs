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
const solo = (seed = 3, cls = 'runner') => { const g = playing(seed, 'normal', cls); for (const e of g.ents) if (e !== g.player) e.gone = true; g.items.length = 0; g.nextItem = 1e9; g.player.x = 6.5; g.player.y = 12.5; return g; };
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
  const r = solo(3, 'runner'); put(r, r.player, 6.5, 12.5); const s0 = r.player.x; r.aim(1, 0); r.step(250); const plain = r.player.x - s0;
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
test('story maps: each episode has its own floor, every walkable tile reachable from the start, goals on open tiles', () => {
  for (let ep = 0; ep < 3; ep++) {
    const g = newNightSchoolGame(rng(ep + 1), 'normal'); g.startStory(ep);
    const m = g.STORY[ep].map; assert.equal(g.COLS, m.cols); assert.equal(g.ROWS, m.rows);
    const d = g.field([[Math.floor(m.start[0]), Math.floor(m.start[1])]], false);
    for (let y = 0; y < g.ROWS; y++) for (let x = 0; x < g.COLS; x++) if (!g.blocked(x, y)) assert.ok(d[y * g.COLS + x] >= 0, ep + ': ' + x + ',' + y);
    for (const st of g.STORY[ep].steps) {
      for (const [x, y] of (st.spawn || []).concat(st.boss ? [st.boss] : [])) assert.ok(!g.blocked(x, y), ep + ' spawn ' + x + ',' + y);
      for (const [x, y] of st.at || []) assert.ok(!g.blocked(Math.floor(x), Math.floor(y)), ep + ' item ' + x + ',' + y);
      for (const w of st.who || []) assert.ok(!g.blocked(Math.floor(w[1]), Math.floor(w[2])), ep + ' who ' + w[0]);
      if (st.room) assert.ok(g.ROOMS.some(r => r.name === st.room), st.room);
    }
    assert.ok(!g.blocked(Math.floor(g.player.x), Math.floor(g.player.y)));
  }
});
// Play an episode by teleporting to each goal (zombies kept off the player).
const playEpisode = (g, ep) => {
  g.startStory(ep); let guard = 0;
  while (!g.ended && guard++ < 60) {
    while (g.phase === 'scene') g.advance();
    if (g.ended) break;
    const gl = g.goal, p = g.player; p.imm = 1e9;
    if (gl.goal === 'goto') { const r = g.ROOMS.find(r2 => r2.name === gl.room); for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!g.blocked(x, y)) { p.x = x + 0.5; p.y = y + 0.5; y = 1e9; break; } g.step(50); }
    else if (gl.goal === 'collect') { for (const it of g.items.filter(i => i.story)) { p.x = it.x; p.y = it.y; g.step(50); } }
    else if (gl.goal === 'rescue') { for (const k of g.ents.filter(e => e.lost)) { p.x = k.x; p.y = k.y; g.step(50); } }
    else if (gl.goal === 'kill') { for (const z of g.zombies()) { p.x = z.x - 0.8; p.y = z.y; p.face = 0; z.stun = 9; for (let h = 0; h < 6 && !z.gone; h++) { p.atk = 0; p.x = z.x - 0.8; p.y = z.y; g.attack(); } } g.step(50); }
    else if (gl.goal === 'survive') { for (let i = 0; i < 200 && g.phase === 'play'; i++) g.step(250); }
    else if (gl.goal === 'escape') { const m = g.STORY[ep].map; const [sx, sy] = m.stairs[0]; p.x = sx + 0.5; p.y = sy + 0.5; g.step(50); }
  }
  return g;
};
test('story: all three episodes play through goal by goal to a clear', () => {
  for (let ep = 0; ep < 3; ep++) { const g = playEpisode(newNightSchoolGame(rng(ep + 9), 'normal'), ep); assert.ok(g.ended && g.won && g.why === 'story', 'episode ' + ep + ' ' + g.why); }
});
test('story: nothing moves in a scene; friends follow; the mop knocks back, three hits down a zombie, kills count', () => {
  const g = newNightSchoolGame(rng(5), 'normal', 'runner'); g.startStory(0);
  const x0 = g.player.x; g.aim(1, 0); g.step(500); assert.equal(g.player.x, x0, 'nothing moves during a scene'); g.aim(0, 0);
  while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'goto'); assert.equal(g.zombies().length, 2); assert.ok(g.zombies().every(z => z.hp === 3));
  for (const z of g.zombies()) z.gone = true;
  const p = g.player; p.x = 20.5; p.y = 6.5; p.face = 0; const z = g.ents.find(e => e.zombie); z.gone = false; z.x = 21.4; z.y = 6.5; z.stun = 0;
  const d0 = z.x - p.x; assert.ok(g.attack()); assert.ok(z.x - p.x > d0 + 0.3 && z.hp === 2, 'knocked back, one hit');
  assert.ok(!g.attack(), 'the swing has a cooldown');
  for (let k = 0; k < 2; k++) { p.atk = 0; z.x = p.x + 0.9; z.y = p.y; g.attack(); }
  assert.ok(z.gone && g.kills === 1);
  const f = g.ents.find(e => e.ally); p.x = 25.5; p.y = 7.5; for (let i = 0; i < 40; i++) g.step(250);
  assert.ok(Math.hypot(f.x - p.x, f.y - p.y) < 3, 'a friend follows');
});
test('story: caught means a retry, not a zombie; the boss and hidden classmates', () => {
  const g = newNightSchoolGame(rng(6), 'normal', 'runner'); g.startStory(2); while (g.phase === 'scene') g.advance();
  assert.equal(g.goal.goal, 'rescue'); assert.ok(g.zombies().some(z => z.boss && z.hp === 24), 'the boss');
  assert.equal(g.ents.filter(e => e.lost).length, 2);
  for (const f of g.ents) if (f.ally) f.gone = true; // friends would knock it away
  const z = g.zombies()[0]; z.x = g.player.x + 0.4; z.y = g.player.y; z.stun = 0; z.caught = 0; g.step(50);
  assert.ok(g.ended && !g.won && g.why === 'caught' && !g.player.zombie);
  assert.ok(g.retry() && !g.ended && g.player.imm > 0);
});
test('free play: a zombie player keeps a vaccine, picks one up, and using it turns them back', () => {
  const g = solo(); const far = kidAt(g, 3.5, 3.5); far.bot = false; g.player.item = 'shot';
  const z = zombieAt(g, g.player.x + 0.4, g.player.y); g.step(50); run(g, 1.5);
  assert.ok(g.player.zombie && g.player.item === 'shot', 'turned, the vaccine kept');
  z.gone = true; assert.ok(g.useItem() && !g.player.zombie && g.player.imm > 4 && !g.ended, 'cured');
  g.player.zombie = true; g.player.item = null; g.items.push({ x: g.player.x, y: g.player.y, kind: 'shot' }); g.step(50);
  assert.equal(g.player.item, 'shot', 'a zombie player picks a vaccine up');
});
