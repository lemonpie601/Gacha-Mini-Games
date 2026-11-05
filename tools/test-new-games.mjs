import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// Jelly Survivors, Candy Bus and the hidden 솜사탕 질주: the models, with time passed in through step(ms).
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const games = runInNewContext(`${models}\n({ newSurviveGame, newBusGame, newDashGame })`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const LEVELS = ['easiest', 'easy', 'normal', 'hard', 'expert'];
const go = g => g.dirAt(g.n + 1) === g.face ? g.climb() : g.turn();
const run = (g, seconds) => { for (let i = 0; i < seconds * 20 && !g.ended && !g.choices; i++) g.step(50); };

const blob = (g, x, y, hp = 1, extra = {}) => { const e = { x, y, hp, max: hp, speed: 0, r: 10, kind: 0, hit: 0, push: 0, dmg: 1, ...extra }; g.enemies.push(e); return e; };
// A player of middling skill: steps away from close blobs, drifts to crystals, takes a random card.
const kite = (g, r, seconds) => {
  for (let i = 0; i < seconds * 30 && !g.ended; i++) {
    if (g.choices) { g.pick(Math.floor(r() * 3)); continue; }
    if (i % 4 === 0) {
      const h = g.hero; let fx = 0, fy = 0;
      for (const e of g.enemies) { const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < 110) { const w = (110 - d) / d / d * 60; fx += dx * w; fy += dy * w; } }
      let tg = null, bd = 170; for (const c of g.gems.concat(g.honey)) { const d = Math.hypot(c.x - h.x, c.y - h.y); if (d < bd) { bd = d; tg = c; } }
      if (tg) { fx += (tg.x - h.x) / bd * 0.5; fy += (tg.y - h.y) / bd * 0.5; }
      g.aim(fx + (180 - h.x) / 180 * 0.4, fy + (260 - h.y) / 260 * 0.4);
    }
    g.step(33); g.take();
  }
  return g;
};
test('Survive: nothing moves until the run starts; then enemies spawn at the edges and chase', () => {
  const g = games.newSurviveGame(rng(), 'normal');
  g.step(1000); assert.equal(g.enemies.length, 0);
  g.start(); run(g, 3);
  assert.ok(g.enemies.length > 0, 'spawned');
  const e = g.enemies[0], d0 = Math.hypot(e.x - g.hero.x, e.y - g.hero.y);
  g.hp = 99; g.maxHp = 99; g.cool = 99; g.fire = 99; run(g, 1);
  const again = g.enemies.find(o => o === e);
  assert.ok(!again || Math.hypot(e.x - g.hero.x, e.y - g.hero.y) < d0, 'closer to the hero');
});
test('Survive: the hero shoots the nearest blob and crystals fill the level bar', () => {
  const g = games.newSurviveGame(rng(), 'normal'); g.start();
  blob(g, 200, 260);
  g.step(50); g.step(50); g.step(50); g.step(50);
  assert.equal(g.kills, 1);
  assert.ok(g.gems.length === 1 || g.xp > 0, 'dropped a crystal');
});
test('Survive: the first blobs die to one shot, at every level', () => {
  for (const lv of LEVELS) { const g = games.newSurviveGame(rng(), lv); g.start(); run(g, 20); assert.ok(g.enemies.length > 0 && g.enemies.every(e => e.hp <= g.dmg), lv); }
});
test('Survive: a level-up pauses the run and offers 3 cards; picking one applies it, and picks stack', () => {
  const g = games.newSurviveGame(rng(), 'normal'); g.start();
  g.xp = g.need; g.step(50);
  assert.equal(g.level, 2);
  assert.equal(g.choices.length, 3);
  assert.equal(new Set(g.choices.map(c => c.id)).size, 3);
  for (const c of g.choices) assert.ok(c.icon && c.name && c.desc && c.lv === 1);
  const t = g.time; g.step(500); assert.equal(g.time, t, 'paused');
  const stats = () => JSON.stringify([g.dmg, g.cool, g.shots, g.orbit, g.speed, g.pickup, g.maxHp, g.pierce, g.boom, g.chain, g.crit, g.vac, g.regenEvery]), before = stats(), id = g.choices[0].id;
  assert.ok(g.pick(0)); assert.equal(g.choices, null);
  if (id !== 'heal') assert.notEqual(stats(), before, id);
  g.step(500); assert.ok(g.time > t, 'running again');
  // The same card again is a second level of it.
  const d = games.newSurviveGame(rng(), 'normal'); d.ups.dmg[3](d); d.ups.dmg[3](d); assert.ok(Math.abs(d.dmg - 1.4 * 2.25) < 1e-9);
  d.choices = [{ id: 'dmg', lv: 1 }]; d.pick(0); d.choices = [{ id: 'dmg', lv: 2 }]; d.pick(0); assert.equal(d.stacks.dmg, 2);
});
test('Survive: contact hurts once per second of invulnerability and the run ends at 0 HP', () => {
  const g = games.newSurviveGame(rng(), 'hard'); g.start();
  const hp = g.hp, touch = () => blob(g, g.hero.x, g.hero.y, 99);
  touch(); g.step(50); assert.equal(g.hp, hp - 1);
  g.step(50); assert.equal(g.hp, hp - 1, 'brief invulnerability');
  for (let i = 0; i < 400 && !g.ended; i++) { touch(); g.step(250); }
  assert.ok(g.ended && g.hp === 0);
  assert.equal(g.score, Math.floor(g.time) * 10 + g.kills);
});
test('Survive: the blobs come in growing numbers, stay soft, and a wave and a big blob arrive on time', () => {
  const g = games.newSurviveGame(rng(), 'normal');
  const grow0 = g.grow(), rate0 = g.rate();
  g.time = 120; assert.ok(g.rate() > rate0 * 2.5, 'number'); assert.ok(g.grow() > grow0 && g.grow() < 3, 'toughness stays mild');
  const h = games.newSurviveGame(rng(), 'normal'); h.start(); h.hp = h.maxHp = 9999; h.xp = -1e9; h.dmg = 50;
  run(h, 61); assert.ok(h.waveAt >= 25 && h.bigAt >= 60, 'wave at 25 s, big blob at 60 s');
  const hard = games.newSurviveGame(rng(), 'expert'), easy = games.newSurviveGame(rng(), 'easiest');
  assert.ok(hard.hp < easy.hp && hard.rate() > easy.rate() && hard.regenEvery > easy.regenEvery && (hard.time = easy.time = 100, hard.grow() > easy.grow()));
  const cap = games.newSurviveGame(rng(), 'expert'); cap.start(); cap.hp = cap.maxHp = 1e9; cap.cool = 99; cap.fire = 99; cap.rate = () => 100; run(cap, 6);
  assert.ok(cap.enemies.length <= 150 && cap.enemies.length > 100, String(cap.enemies.length));
});
test('Survive: levels come fast in the first minute, then slow down; HP comes back by itself', () => {
  const g = games.newSurviveGame(rng(3), 'normal'); g.start(); kite(g, rng(3), 60);
  const at60 = g.level; assert.ok(at60 >= 9, 'level at 60 s: ' + at60);
  kite(g, rng(4), 60); const second = g.level - at60; assert.ok(second < at60, 'slower after: ' + second + ' vs ' + at60);
  const r = games.newSurviveGame(rng(), 'normal'); r.start(); r.spawnAcc = 0; r.rate = () => 0; r.hp = r.maxHp - 2; r.step(250); run(r, r.regenEvery + 1); assert.equal(r.hp, r.maxHp - 1);
  run(r, r.regenEvery); assert.equal(r.hp, r.maxHp);
  const hn = games.newSurviveGame(rng(), 'normal'); hn.start(); hn.hp = 1; hn.honey.push({ x: hn.hero.x, y: hn.hero.y, sp: 0 }); hn.spawnAcc = 0; hn.rate = () => 0; hn.step(50); assert.equal(hn.hp, 2, 'honey heals');
});
test('Survive: a casual player lives 3+ minutes at 보통, 달인 is harder but not instant', () => {
  const alive = lv => [1, 2, 3].map(s => { const g = games.newSurviveGame(rng(s * 31), lv); g.start(); kite(g, rng(s), 200); return g.time; });
  const normal = alive('normal'); assert.ok(normal.every(t => t >= 180), normal.join());
  const easiest = alive('easiest'); assert.ok(easiest.every(t => t >= 180), easiest.join());
  const expert = alive('expert').sort((a, b) => a - b); assert.ok(expert[1] >= 120, expert.join());
});
test('Survive: spread, piercing, explosion, lightning, vacuum, orbit, regen and crit upgrades each do their thing', () => {
  const up = (id, g) => g.ups[id][3](g);
  // Spread: 1 → 3 → 5 shots, fanned out.
  const s = games.newSurviveGame(rng(), 'normal'); s.start(); s.spawnAcc = 0; s.rate = () => 0; up('multi', s); up('multi', s); assert.equal(s.shots, 5);
  blob(s, 300, 260, 99); s.step(20); assert.equal(s.bullets.length, 5); assert.equal(new Set(s.bullets.map(b => b.vy.toFixed(2))).size, 5);
  // Piercing: one shot hurts both blobs in a line.
  const p = games.newSurviveGame(rng(), 'normal'); p.start(); p.spawnAcc = 0; p.rate = () => 0; up('pierce', p);
  const a = blob(p, 215, 260, 5), b = blob(p, 250, 260, 5); p.step(250); assert.ok(a.hp < 5 && b.hp < 5, 'both hit');
  const n = games.newSurviveGame(rng(), 'normal'); n.start(); n.spawnAcc = 0; n.rate = () => 0; const c = blob(n, 215, 260, 5), d = blob(n, 250, 260, 5); n.step(250); assert.ok(c.hp < 5 && d.hp === 5, 'without it the first blob stops the shot');
  // Explosion on kill: the neighbour is hurt too, and a ring is announced.
  const x = games.newSurviveGame(rng(), 'normal'); x.start(); x.spawnAcc = 0; x.rate = () => 0; up('boom', x);
  blob(x, 215, 260, 1); const near = blob(x, 215, 290, 1), far = blob(x, 215, 480, 1.2); x.step(250);
  assert.equal(x.kills, 2, 'the blast killed the neighbour'); assert.ok(far.hp === 1.2 && x.take().some(e => e.t === 'boom'));
  // Lightning: a hit jumps to blobs nearby (a draw of 0 always passes the chance).
  const l = games.newSurviveGame(() => 0, 'normal'); l.start(); l.spawnAcc = 0; l.rate = () => 0; up('chain', l);
  const first = blob(l, 215, 260, 5), second = blob(l, 215, 320, 5); l.step(250); assert.ok(second.hp < 5, 'zapped'); assert.ok(first.hp < 5);
  // Vacuum: a far crystal flies to the hero.
  const v = games.newSurviveGame(rng(), 'normal'); v.start(); v.spawnAcc = 0; v.rate = () => 0; up('vac', v); v.gems.push({ x: 20, y: 20, v: 1, sp: 0 }); for (let i = 0; i < 6; i++) v.step(250); assert.equal(v.gems.length, 0); assert.ok(v.xp > 0 || v.level > 1);
  // Bigger and faster orbit with more candies.
  const o2 = games.newSurviveGame(rng(), 'normal'), o4 = games.newSurviveGame(rng(), 'normal'); o2.start(); o4.start(); o2.spawnAcc = o4.spawnAcc = 0; o2.rate = o4.rate = () => 0;
  up('orbit', o2); up('orbit', o4); up('orbit', o4); assert.equal(o4.orbit, 4); o2.step(250); o4.step(250); assert.ok(o4.spin > o2.spin);
  // Crit: a draw of 0 always crits, for two and a half times the damage, flagged for the big number.
  const k = games.newSurviveGame(() => 0, 'normal'); k.start(); k.spawnAcc = 0; k.rate = () => 0; up('crit', k); assert.ok(k.crit > 0.19);
  const t = blob(k, 215, 260, 99); k.step(250); const ev = k.take().find(e => e.t === 'hit'); assert.ok(ev && ev.crit && Math.abs(ev.v - k.dmg * 2.5) < 1e-9); assert.ok(t.hp < 99);
});
test('Survive: kills build a combo that resets after a pause, and the events stay capped', () => {
  const g = games.newSurviveGame(rng(), 'normal'); g.start(); g.spawnAcc = 0; g.rate = () => 0;
  g.cool = 0.1; for (let i = 0; i < 5; i++) blob(g, g.hero.x + 60 + i * 12, g.hero.y, 1); for (let i = 0; i < 6; i++) { if (g.choices) g.pick(0); g.step(250); }
  assert.ok(g.combo >= 3 && g.comboMax === g.combo, 'combo ' + g.combo);
  assert.ok(g.take().some(e => e.t === 'kill' && e.combo >= 2));
  g.cool = 99; g.fire = 99; for (let i = 0; i < 14; i++) { if (g.choices) g.pick(0); g.step(250); } assert.equal(g.combo, 0, 'reset after 2.2 s');
  const busy = games.newSurviveGame(rng(), 'normal'); busy.start(); busy.dmg = 99; busy.cool = 0.01; busy.hp = busy.maxHp = 1e9; busy.rate = () => 100; for (let i = 0; i < 400; i++) { if (busy.choices) busy.pick(0); busy.step(50); } assert.ok(busy.events.length > 0 && busy.events.length <= 300);
});
test('both games build at every level', () => {
  for (const lv of LEVELS) { assert.ok(games.newSurviveGame(rng(), lv)); assert.ok(games.newBusGame(rng(), lv)); }
});

// 사탕 버스. A small solver that knows only the rules: take any bus with a clear way out into a free bay; the front passenger
// boards the fullest bay bus of their colour; a full bus leaves. It searches every order of taps.
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const wayClear = (g, mask, id) => {
  const b = g.buses[id], cells = new Set();
  for (const o of g.buses) if (mask.has(o.id) && o.id !== id) { cells.add(o.x + ',' + o.y); cells.add((o.x - DX[o.dir]) + ',' + (o.y - DY[o.dir])); }
  for (let x = b.x + DX[b.dir], y = b.y + DY[b.dir]; x >= 0 && y >= 0 && x < g.cols && y < g.rows; x += DX[b.dir], y += DY[b.dir]) if (cells.has(x + ',' + y)) return false;
  return true;
};
const solvable = g => {
  const q = g.queue, seen = new Set(), nbays = g.bays.length;
  const dfs = (mask, bays, qi) => {
    bays = bays.map(b => ({ ...b }));
    for (; qi < q.length;) {
      let t = -1; bays.forEach((b, j) => { if (b.c === q[qi] && b.n < g.cap && (t < 0 || b.n > bays[t].n)) t = j; });
      if (t < 0) break;
      if (++bays[t].n >= g.cap) bays.splice(t, 1);
      qi++;
    }
    if (qi === q.length) return true;
    if (bays.length >= nbays) return false;
    const key = [[...mask].sort((a, b) => a - b), bays.map(b => b.c + ':' + b.n).sort(), qi].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    const ids = [...mask].filter(id => wayClear(g, mask, id)).sort((a, b) => (g.buses[b].colour === q[qi]) - (g.buses[a].colour === q[qi]));
    for (const id of ids) { const m = new Set(mask); m.delete(id); if (dfs(m, [...bays, { c: g.buses[id].colour, n: 0 }], qi)) return true; }
    return false;
  };
  return dfs(new Set(g.buses.map(b => b.id)), [], 0);
};
// A hand-made lot: buses as [x, y, dir, colour] on a 4×4 lot.
const lot = (list, queue, nbays = 5, cap = 3) => {
  const g = games.newBusGame(rng(), 'easiest', 1);
  g.cols = g.rows = 4; g.cap = cap; g.bays = Array(nbays).fill(null); g.queue = queue; g.total = queue.length; g.boarded = 0;
  g.buses = list.map(([x, y, dir, colour], id) => ({ id, x, y, dir, colour, state: 'lot', bay: -1, bump: 0 })); g.take();
  return g;
};
test('Bus: every generated lot is solvable, at each level and for levels 1 to 8', () => {
  for (const lv of LEVELS) for (let level = 1; level <= 8; level++) for (const seed of [1, 2, 3]) {
    const g = games.newBusGame(rng(seed * 97 + level), lv, level), tag = lv + ' L' + level + ' #' + seed;
    assert.ok(solvable(g), tag);
    // And the plan it was built from plays out in the model itself: take buses in that order, only when the front passenger needs one.
    let next = 0;
    while (!g.ended) { g.settle(); if (g.ended) break; assert.ok(next < g.plan.length && g.tap(g.plan[next++]), tag + ' plan'); }
    assert.ok(g.won, tag + ' won'); assert.equal(g.left(), 0);
  }
});
test('Bus: every colour and seat is used once, and levels grow harder', () => {
  const g = games.newBusGame(rng(), 'normal', 3);
  assert.equal(g.queue.length, g.buses.length * g.cap);
  for (const c of new Set(g.buses.map(b => b.colour))) assert.equal(g.queue.filter(x => x === c).length, g.cap * g.buses.filter(b => b.colour === c).length);
  const at = (lv, level) => games.newBusGame(rng(), lv, level);
  const colours = LEVELS.map(lv => new Set(at(lv, 1).buses.map(b => b.colour)).size); assert.deepEqual(colours, [3, 4, 5, 6, 7]);
  const bays = LEVELS.map(lv => at(lv, 1).bays.length); assert.deepEqual([...bays].sort((a, b) => b - a), bays); assert.ok(bays[0] === 5 && bays[4] === 4);
  const size = LEVELS.map(lv => at(lv, 1).buses.length); assert.deepEqual([...size].sort((a, b) => a - b), size);
  assert.ok(at('normal', 6).buses.length > at('normal', 1).buses.length && at('normal', 6).total > at('normal', 1).total && at('normal', 6).cap === 4);
  assert.ok(at('easiest', 5).bays.length === 4, 'sometimes fewer bays');
  for (const lv of LEVELS) for (let level = 1; level <= 12; level++) { const x = at(lv, level); assert.ok(x.buses.length <= 16 && x.cols <= 7 && x.rows <= 7); }
});
test('Bus: a blocked bus bumps and does not move; once the blocker is gone it drives to a bay', () => {
  // Bus 0 faces right with bus 1 (heading down) standing in its way.
  const g = lot([[1, 1, 1, 0], [2, 2, 2, 1]], [1, 1, 1, 0, 0, 0]);
  assert.equal(g.blocker(0).id, 1);
  assert.equal(g.tap(0), false); assert.equal(g.buses[0].state, 'lot'); assert.ok(g.buses[0].bump > 0); assert.equal(g.take().join(), 'nope');
  assert.ok(g.bays.every(b => b === null));
  assert.equal(g.tap(1), true); assert.equal(g.buses[1].state, 'drive'); assert.equal(g.bays[0].bus, 1);
  assert.equal(g.blocker(0), null); assert.equal(g.tap(0), true); assert.equal(g.bays[1].bus, 0, 'the next free bay');
  assert.equal(g.tap(0), false, 'already out');
});
test('Bus: the drive and the boarding take time through step(ms)', () => {
  const g = lot([[1, 1, 3, 0]], [0, 0, 0]);
  g.tap(0); g.step(g.DRIVE - 40); assert.equal(g.bays[0].arrived, false); assert.equal(g.boarded, 0);
  g.step(60); assert.equal(g.bays[0].arrived, true);
  g.step(g.BOARD + 20); assert.equal(g.boarded, 1); assert.equal(g.bays[0].n, 1); assert.equal(g.queue.join(), '0,0');
  g.settle(); assert.ok(g.won && g.ended && g.queue.length === 0);
});
test('Bus: passengers board only buses of their colour, one by one, the front first', () => {
  const g = lot([[0, 0, 0, 0], [3, 3, 2, 1]], [1, 1, 1, 0, 0, 0]);
  g.tap(0); g.settle();
  assert.equal(g.boarded, 0, 'a red bus waits while the front passenger is blue'); assert.equal(g.bays[0].n, 0);
  g.tap(1); g.settle();
  assert.equal(g.buses[1].state, 'gone', 'the blue bus filled and left'); assert.equal(g.boarded, 6);
  assert.ok(g.won && g.bays.every(b => b === null));
  // Two buses of one colour in the bays: the fuller one is boarded first.
  const h = lot([[0, 0, 0, 0], [3, 3, 2, 0]], [0, 1, 0, 0, 0, 0, 0]);
  h.tap(0); h.settle(); assert.equal(h.bays[0].n, 1); h.tap(1); h.settle();
  assert.equal(h.boarded, 1, 'the blue passenger waits'); h.queue = [0, 0, 1, 0, 0]; h.settle();
  assert.equal(h.buses[0].state, 'gone', 'the first red bus filled first'); assert.equal(h.bays[1].n, 0);
});
test('Bus: a full bus leaves its bay and frees it', () => {
  const g = lot([[0, 0, 0, 0], [3, 3, 2, 1]], [0, 0, 0, 1, 1, 1]);
  g.tap(0); g.step(g.DRIVE); g.step(g.BOARD * 3 + 140); assert.equal(g.bays[0].n, 3); assert.ok(g.bays[0].cheer >= 0, 'cheering');
  assert.equal(g.take().includes('full'), true);
  g.step(g.CHEER + 40); assert.equal(g.bays[0], null); assert.equal(g.buses[0].state, 'gone'); assert.equal(g.leaving.length, 1);
  g.step(g.LEAVE + 40); assert.equal(g.leaving.length, 0);
  assert.equal(g.tap(1), true); assert.equal(g.bays[0].bus, 1, 'the freed bay is first again');
});
test('Bus: all bays taken and the front passenger fitting none of them ends the run', () => {
  const g = lot([[0, 0, 0, 0], [3, 0, 0, 1], [0, 3, 2, 2]], [2, 2, 2, 0, 0, 0, 1, 1, 1], 2);
  g.tap(0); g.tap(1); g.settle();
  assert.ok(g.ended && g.lost && !g.won); assert.ok(g.take().includes('lose'));
  assert.equal(g.tap(2), false, 'nothing moves after the end');
  // With a bay to spare it is not over yet.
  const h = lot([[0, 0, 0, 0], [3, 0, 0, 1], [0, 3, 2, 2]], [2, 2, 2, 0, 0, 0, 1, 1, 1], 3);
  h.tap(0); h.tap(1); h.settle(); assert.ok(!h.ended); assert.ok(h.tap(2)); h.settle(); assert.ok(h.won, 'the whole queue boards');
  // A bus with no free bay to go to bumps.
  const f = lot([[0, 0, 0, 0], [3, 0, 0, 1]], [2, 2, 2], 1); f.tap(0); assert.equal(f.tap(1), false); assert.ok(f.buses[1].bump > 0);
});

// 솜사탕 질주: a run with the road cleared, one obstacle put in front of the bunny.
const dash = (lv = 'normal') => { const g = games.newDashGame(rng(), lv); g.started = true; g.gap = 1e9; return g; };
const lane = (g, o, ms = 1200) => { g.obstacles = [o]; for (let t = 0; t < ms && !g.ended; t += 10) g.step(10); };
const low = { kind: 'low', x: 300, w: 30, h: 40 }, bar = { kind: 'bar', x: 300, w: 46, h: 0 };
test('Dash: jumping clears a low block that would hurt on the ground, and a second jump works once in the air', () => {
  const ground = dash(); lane(ground, { ...low });
  assert.equal(ground.hits, 1); assert.ok(ground.energy < 1 - 0.19);
  const g = dash(); g.jump(); lane(g, { ...low }, 40); // a few steps in, then the block is passed in the air
  g.obstacles = [{ ...low, x: 150 }]; for (let t = 0; t < 400; t += 10) g.step(10);
  assert.equal(g.hits, 0, 'cleared');
  const air = dash(); air.jump(); air.step(100); const vy = air.vy; assert.equal(air.jump(), true); assert.ok(air.vy > vy); assert.equal(air.jump(), false, 'only two jumps');
});
test('Dash: sliding clears a high bar, standing or jumping does not', () => {
  const slide = dash(); slide.slide(true); lane(slide, { ...bar });
  assert.equal(slide.hits, 0);
  const stand = dash(); lane(stand, { ...bar }); assert.equal(stand.hits, 1);
  const jump = dash(); jump.jump(); lane(jump, { ...bar }); assert.equal(jump.hits, 1);
  assert.ok(stand.hurt > 0, 'blinks after a bump');
});
test('Dash: energy drains, a bump costs a chunk, a bottle refills, and no energy ends the run', () => {
  const g = dash(); g.step(1000); assert.ok(g.energy < 1 && g.energy > 0.9, String(g.energy));
  g.energy = 0.5; g.items = [{ kind: 'milk', x: g.x, y: 20 }]; g.step(20); assert.ok(g.energy > 0.65, 'bottle'); assert.equal(g.items.length, 0);
  g.items = [{ kind: 'candy', x: g.x, y: 20 }]; g.step(20); assert.equal(g.candies, 1); assert.equal(g.score, g.candies * 10 + g.metres);
  const bump = dash(); lane(bump, { ...low }, 800); assert.ok(bump.energy < 0.85, String(bump.energy));
  const dead = dash(); dead.energy = 0.001; dead.step(100); assert.ok(dead.ended && dead.fail.why === 'tired' && dead.energy === 0);
});
test('Dash: a pit ends the run unless it is jumped', () => {
  const pit = { kind: 'pit', x: 200, w: 90, h: 0 };
  const fall = dash(); lane(fall, { ...pit }); assert.ok(fall.ended && fall.fail.why === 'pit');
  const g = dash(); g.obstacles = [{ ...pit }]; for (let t = 0; t < 1500 && !g.ended; t += 10) { if (g.obstacles[0] && g.obstacles[0].x - g.x < 20 && g.y === 0 && !g.jumps) g.jump(); g.step(10); }
  assert.equal(g.ended, false); assert.equal(g.obstacles.length, 0, 'the pit is behind');
});
test('Dash: speed and obstacles ramp up with the distance, harder levels start faster', () => {
  const g = dash(); g.step(16); const s0 = g.speed; g.distance = 12000; g.step(16); const s1 = g.speed; g.distance = 1e6; g.step(16);
  assert.ok(s1 > s0 && g.speed > s1, [s0, s1, g.speed].join(' '));
  const start = LEVELS.map(lv => { const d = dash(lv); d.step(16); return d.speed; }); assert.deepEqual([...start].sort((a, b) => a - b), start);
  // Obstacles come closer together later in the run.
  const gaps = distance => { let sum = 0; for (let i = 0; i < 60; i++) { const d = games.newDashGame(rng(i + 1), 'normal'); d.started = true; d.distance = distance; d.gap = 0; d.step(1); sum += d.gap / d.speed; } return sum / 60; };
  assert.ok(gaps(24000) < gaps(1000), gaps(1000) + ' → ' + gaps(24000));
  const play = games.newDashGame(rng(5), 'normal'); play.started = true; for (let i = 0; i < 400; i++) play.step(50);
  assert.ok(play.obstacles.length > 0 || play.ended);
});
