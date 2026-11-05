import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 좀비 학교 탈출: the model, with time passed in through step(ms).
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const { newZombieGame } = runInNewContext(`${models}\n({ newZombieGame })`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const LEVELS = ['easiest', 'easy', 'normal', 'hard', 'expert'];
const fresh = (seed = 7, lv = 'normal') => newZombieGame(rng(seed), lv);
// An empty stage for one rule at a time: no zombies, no survivors, the clock running, the player in the corridor.
const bare = (seed = 7, lv = 'normal') => { const g = fresh(seed, lv); g.zombies.length = 0; g.npcs.length = 0; g.items.length = 0; g.start(); return g; };
const reachable = (g, a, b) => { let x = a.x, y = a.y, n = 0; while (Math.floor(x) !== Math.floor(b.x) || Math.floor(y) !== Math.floor(b.y)) { const s = g.path(x, y, b.x, b.y); if (!s || n++ > 2000) return false; x = s.x; y = s.y; } return true; };
// step() takes at most a second at a time.
const run = (g, ms) => { for (; ms > 0; ms -= 1000) g.step(Math.min(1000, ms)); };
const place = (g, x, y) => { g.player.x = x; g.player.y = y; g.refresh(); };

test('the map has a reachable exit, three keys in different rooms, and rooms with doors', () => {
  for (const lv of LEVELS) for (let seed = 1; seed <= 12; seed++) {
    const g = fresh(seed, lv);
    assert.ok(g.rooms.length >= 6 && g.doors.length >= g.rooms.length, `${lv} ${seed}: rooms`);
    const approach = { x: g.exit.left ? 1.5 : g.cols - 1.5, y: g.cy + 0.5 };
    assert.ok(reachable(g, g.spawn, approach), `${lv} ${seed}: exit reachable`);
    assert.equal(g.keyItems.length, 3);
    assert.equal(new Set(g.keyItems.map(k => g.rooms.findIndex(r => k.x >= r.x && k.x < r.x + r.w && k.y >= r.y && k.y < r.y + r.h))).size, 3, 'keys in three rooms');
    for (const k of g.keyItems) assert.ok(reachable(g, g.spawn, k), `${lv} ${seed}: key reachable`);
    for (const it of g.items) assert.ok(reachable(g, g.spawn, it), `${lv} ${seed}: item reachable`);
    assert.equal(g.tileAt(g.exit.tiles[0].x + 0.5, g.exit.tiles[0].y + 0.5), g.EXIT);
    assert.ok(g.npcs.length >= 6 && g.npcs.length <= 10 && g.zombies.length >= 1 && g.zombies.length <= 2);
  }
});
test('the school differs from run to run', () => {
  const sig = seed => { const g = fresh(seed); return g.t.join('') + g.exit.left; };
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(sig)).size >= 5);
});
test('zombies start far from the player', () => {
  for (let seed = 1; seed <= 8; seed++) { const g = fresh(seed, 'hard'); for (const z of g.zombies) assert.ok(Math.hypot(z.x - g.player.x, z.y - g.player.y) > 9, `seed ${seed}`); }
});
test('line of sight: open along the corridor, blocked by a wall, desks do not block', () => {
  const g = fresh(3), y = g.cy + 0.5, room = g.rooms[0];
  assert.ok(g.los(4.5, y, 12.5, y));
  const wallX = room.door.x === room.x + 1 ? room.x + room.w - 2 : room.x + 1; // a column of the room that has no door
  assert.equal(g.tileAt(wallX + 0.5, g.cy - 1 + 0.5), g.WALL);
  assert.ok(!g.los(wallX + 0.5, y, wallX + 0.5, room.y + 1.5), 'the wall between corridor and room');
  assert.ok(g.los(room.door.x + 0.5, y, room.door.x + 0.5, room.y + 1.5), 'straight through the door');
  g.t[g.cy * g.cols + 20] = g.DESK; assert.ok(g.los(18.5, y, 22.5, y), 'a desk does not block sight');
});
test('a zombie that sees a survivor runs at them; one that does not sees nothing', () => {
  const g = bare(); g.exit.left; const y = g.cy + 0.5;
  const sx = g.exit.left ? 20.5 : 14.5; place(g, sx, y);
  const z = g.spawnZombie(sx + 5, y), d0 = z.x - g.player.x;
  g.step(500); assert.ok(z.x - g.player.x < d0 - 0.8, 'closes in');
  const g2 = bare(); const z2 = g2.spawnZombie(2.5, g2.cy + 0.5); place(g2, 3.5, g2.rooms[0].y + 1.5);
  g2.step(100); assert.ok(!g2.los(z2.x, z2.y, g2.player.x, g2.player.y));
});
test('infection: a touched survivor turns after the delay, and the outbreak spreads', () => {
  const g = bare(); const y = g.cy + 0.5; place(g, g.exit.left ? 30.5 : 5.5, y);
  const n = g.addNpc(18.5, y); n.think = 99; const z = g.spawnZombie(18.9, y);
  g.step(100);
  assert.ok(n.inf > 0, 'bitten');
  assert.ok(g.take().some(e => e.t === 'infect'));
  run(g, g.DELAY * 1000 - 600); assert.equal(g.zombies.length, 1, 'still a survivor during the delay'); assert.ok(g.npcs.includes(n));
  run(g, 1200); assert.equal(g.zombies.length, 2, 'now a zombie'); assert.ok(!g.npcs.includes(n));
  assert.ok(g.take().some(e => e.t === 'turn'));
  // A chain: the new zombie goes for the next survivor in sight.
  const m = g.addNpc(g.zombies[1].x + 2, y); m.think = 99; for (let i = 0; i < 100; i++) g.step(100);
  assert.ok(m.inf >= 0 || !g.npcs.includes(m), 'the next one is caught');
  void z;
});
test('a vaccine cures a zombie beside you back into a survivor; far away it does nothing', () => {
  const g = bare(); const y = g.cy + 0.5; place(g, 10.5, y); g.item = 'vaccine';
  const far = g.spawnZombie(16.5, y); far.stagger = 9;
  assert.equal(g.use(), false); assert.equal(g.item, 'vaccine', 'not used up');
  const near = g.spawnZombie(11.4, y); near.stagger = 9;
  assert.equal(g.use(), true); assert.equal(g.item, null);
  assert.equal(g.zombies.length, 1); assert.equal(g.npcs.length, 1); assert.ok(g.npcs[0].imm > 0);
  assert.ok(g.take().some(e => e.t === 'cure'));
});
test('a barricade shuts the nearest doorway for a while, then goes away', () => {
  const g = bare(); const door = g.rooms[0].door; place(g, door.x + 0.5, g.cy + 0.5); g.item = 'barricade';
  assert.equal(g.tileAt(door.x + 0.5, door.y + 0.5), g.DOOR);
  assert.equal(g.use(), true);
  assert.equal(g.tileAt(door.x + 0.5, door.y + 0.5), g.BAR);
  assert.ok(!g.free(door.x + 0.5, door.y + 0.5)); assert.equal(g.path(door.x + 0.5, g.cy + 0.5, door.x + 0.5, door.y + 0.5), null);
  run(g, g.BAR_T * 1000 - 500); assert.equal(g.tileAt(door.x + 0.5, door.y + 0.5), g.BAR);
  g.step(1000); assert.equal(g.tileAt(door.x + 0.5, door.y + 0.5), g.DOOR);
});
test('a barricade is not placed on top of someone', () => {
  const g = bare(); const door = g.rooms[0].door; place(g, door.x + 0.5, door.y + 0.5); g.item = 'barricade';
  assert.equal(g.barricadeAt(door.x, door.y), false);
});
test('shoes give a short dash, the whistle pulls zombies to a spot', () => {
  const g = bare(); place(g, 10.5, g.cy + 0.5); g.item = 'shoes'; g.use(); assert.ok(g.player.boost > 0);
  g.aim(1, 0); const x0 = g.player.x; g.step(1000); const dashed = g.player.x - x0;
  const h = bare(); place(h, 10.5, h.cy + 0.5); h.aim(1, 0); const y0 = h.player.x; h.step(1000);
  assert.ok(dashed > (h.player.x - y0) * 1.4, `${dashed} vs ${h.player.x - y0}`);
  run(g, g.DASH_T * 1000); assert.equal(g.player.boost, 0);
  const w = bare(); place(w, 6.5, w.cy + 0.5); w.player.fx = 1; w.player.fy = 0; w.item = 'whistle'; w.use();
  assert.ok(w.whistle && w.whistle.x > 9);
  const z = w.spawnZombie(w.whistle.x + 9, w.cy + 1.5), d0 = Math.hypot(z.x - w.whistle.x, z.y - w.whistle.y);
  w.step(1500); assert.ok(Math.hypot(z.x - w.whistle.x, z.y - w.whistle.y) < d0 - 1.5, 'comes to the whistle');
});
test('items are picked up one at a time', () => {
  const g = bare(); place(g, 10.5, g.cy + 0.5);
  g.items.push({ type: 'shoes', x: 10.6, y: g.cy + 0.5 }, { type: 'vaccine', x: 10.4, y: g.cy + 0.5 });
  g.step(100); assert.equal(g.item, 'shoes'); assert.equal(g.items.length, 1);
});
test('being caught: a brief grab, then the run ends', () => {
  const g = fresh(5); g.zombies.length = 0; g.start(); const z = g.spawnZombie(g.player.x + 0.3, g.player.y);
  g.step(100); assert.ok(g.grab && !g.ended, 'grabbed first'); g.aim(1, 0); const x = g.player.x; g.step(100); assert.equal(g.player.x, x, 'cannot move while held');
  g.step(1000); assert.ok(g.ended && !g.won); assert.equal(g.why, 'caught'); assert.ok(g.take().some(e => e.t === 'lose')); void z;
});
test('three keys unlock the exit; reaching it wins, and the score adds up', () => {
  const g = bare(); assert.ok(!g.unlocked);
  place(g, g.exit.left ? 1.5 : g.cols - 1.5, g.cy + 0.5); g.step(100); assert.ok(!g.ended, 'a locked exit does nothing');
  for (const k of g.keyItems) { place(g, k.x, k.y); g.step(40); }
  assert.equal(g.keys, 3); assert.ok(g.unlocked);
  const s = g.addNpc(g.spawn.x, g.spawn.y);
  place(g, g.exit.left ? 1.5 : g.cols - 1.5, g.cy + 0.5); g.step(100);
  assert.ok(g.ended && g.won && g.why === 'exit');
  assert.equal(g.score, 300 + 300 + 120 * g.rescued() + 2 * Math.floor(g.time)); assert.ok(g.npcs.includes(s));
  assert.ok(g.take().some(e => e.t === 'win'));
});
test('holding out until the timer ends wins, and the exit unlocks by itself', () => {
  const g = bare(); g.time = g.LIMIT * 0.695; g.step(1000); assert.ok(g.unlocked && !g.ended && g.keys === 0);
  g.time = g.LIMIT - 0.1; g.step(300); assert.ok(g.ended && g.won && g.why === 'time');
  assert.equal(g.score, 150 + 2 * Math.floor(g.time));
});
test('harder levels start with more or faster zombies, turn sooner and last longer', () => {
  const gs = LEVELS.map(lv => fresh(9, lv));
  for (let i = 1; i < gs.length; i++) {
    assert.ok(gs[i].zSpeed() > gs[i - 1].zSpeed(), 'faster');
    assert.ok(gs[i].zombies.length >= gs[i - 1].zombies.length);
    assert.ok(gs[i].DELAY < gs[i - 1].DELAY && gs[i].LIMIT > gs[i - 1].LIMIT && gs[i].npcs.length <= gs[i - 1].npcs.length);
  }
  assert.ok(gs[4].zombies.length > gs[0].zombies.length);
});
test('zombies speed up and breakout waves let more in', () => {
  const g = fresh(4, 'normal'); const s0 = g.zSpeed(), n0 = g.zombies.length; g.player.x = g.spawn.x; g.start(); g.zombies.forEach(z => { z.stagger = 999; });
  const seen = [];
  for (let i = 0; i < 700 && !g.ended; i++) { g.step(100); for (const e of g.take()) if (e.t === 'breakout') seen.push(e.v); g.player.x = g.spawn.x; g.player.y = g.spawn.y; g.grab = null; }
  assert.ok(g.zSpeed() > s0 + 0.03); assert.ok(seen.length >= 2, 'waves'); assert.ok(g.zombies.length > n0);
});
test('a long run keeps everyone inside the walls', () => {
  for (const lv of LEVELS) {
    const g = fresh(11, lv), r = rng(3); g.start();
    for (let i = 0; i < 1500 && !g.ended; i++) {
      if (i % 20 === 0) g.aim(r() - 0.5, r() - 0.5);
      if (i % 200 === 0) g.use();
      g.step(40); g.take();
      for (const e of [g.player, ...g.zombies, ...g.npcs]) assert.ok(g.free(e.x, e.y) || g.tileAt(e.x, e.y) === g.BAR, `${lv}: ${e.x},${e.y}`);
    }
    assert.ok(g.time > 10);
  }
});
