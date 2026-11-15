import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 핀 뽑기, 눈보라 난로 and 탑 공략: the models, with time passed in through step(ms).
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const games = runInNewContext(`${models}\n({ newPinGame, newFrostGame, newTowerGame, PIN_MAPS })`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);

// ---- 핀 뽑기 ----
const pinLevel = (level, diff = 'expert', seed = 7) => { const g = games.newPinGame(rng(seed), diff); g.closeStory(); for (let k = 1; k < level; k++) { g.phase = 'won'; g.story = null; g.next(); g.story = null; } return g; };
const play = (g, order) => { for (const id of order) { if (g.phase !== 'play') break; g.pull(id); g.settle(); } return g; };
const solve = g => { play(g, g.solution()); if (g.phase === 'play') g.finish(); return g; };
// Orders that must fail, per map.
const WRONG = { 2: [[1]], 3: [[2], [3, 1]], 4: [[2], [3, 1, 4, 2]], 5: [[2], [3], [4, 1]], 6: [[2], [4]], 7: [[2, 1]], 8: [[1, 2]], 9: [[2]], 10: [[2, 1, 3]], 11: [[2]], 12: [[3]], 13: [[3]], 14: [[2]], 15: [[2]] };

test('Pins: 15 maps of 18×24 cells, each with a hero and an answer', () => {
  assert.equal(games.PIN_MAPS.length, 15);
  games.PIN_MAPS.forEach((m, i) => { assert.equal(m.rows.length, 24, 'map ' + (i + 1)); m.rows.forEach(r => assert.equal(r.length, 18)); assert.ok(m.rows.some(r => r.includes('H'))); assert.ok(m.sol.length > 0); });
});
test('Pins: every map is won by its answer, on 입문 and 달인, several seeds, mirrored too', () => {
  for (let level = 1; level <= 30; level++) for (const d of ['easiest', 'expert']) for (const seed of [1, 2, 3]) {
    const g = solve(pinLevel(level, d, seed));
    assert.equal(g.phase, 'won', `level ${level} ${d} seed ${seed}: ${g.why} ${g.collected}/${g.need}`);
  }
});
test('Pins: the wrong order loses a heart', () => {
  for (const [level, wrongs] of Object.entries(WRONG)) for (const order of wrongs) {
    const g = play(pinLevel(+level), order);
    if (g.phase === 'play') { for (const p of g.pins) if (!p.pulled) { g.pull(p.id); g.settle(); } if (g.phase === 'play') g.finish(); }
    assert.equal(g.phase, 'lost', `level ${level} order ${order}`); assert.equal(g.hearts, 2);
  }
});
test('Pins: lava burns a monster and water hardens the whole lava pool', () => {
  const g = pinLevel(4); g.pull(1); g.settle();
  assert.equal(g.monsters[0].alive, false);
  const lava = () => Array.from(g.cell).filter(c => c === g.LAVA).length;
  assert.ok(lava() > 0); g.pull(3); g.settle(); assert.equal(lava(), 0);
  assert.ok(Array.from(g.cell).some(c => c === g.STONE));
});
test('Pins: lava sets off a bomb, which breaks cracked walls; a bomb next to the hero loses', () => {
  const g = pinLevel(11); const cracks = () => Array.from(g.cell).filter(c => c === g.CRACK).length;
  const before = cracks(); g.pull(1); g.settle(); g.finish();
  assert.equal(g.bombs[0].alive, false); assert.ok(cracks() < before); assert.equal(g.phase, 'won');
  const near = play(pinLevel(11), [2]); assert.equal(near.phase, 'lost'); assert.equal(near.why, 'bomb');
});
test('Pins: with enough gold and more to free, the player finishes; stars drop after a lost try and with a hint', () => {
  const g = pinLevel(6, 'easiest'); play(g, [1, 3]);
  assert.equal(g.phase, 'play'); assert.equal(g.enough, true); assert.equal(g.finish(), true); assert.equal(g.phase, 'won');
  const full = solve(pinLevel(1)); assert.equal(full.star, 3); assert.equal(full.coins, full.collected);
  const twice = pinLevel(2); play(twice, [1]); twice.retry(); solve(twice); assert.equal(twice.star, 2);
  const hinted = pinLevel(1); hinted.hints = 1; assert.equal(hinted.useHint(), true); assert.equal(hinted.hintPin(), 1); solve(hinted); assert.equal(hinted.star, 2);
});
test('Pins: the shop sells hints, magnets, hearts and hats with collected gold, only between tries', () => {
  const g = pinLevel(1); g.coins = 200;
  assert.equal(g.buy('hint'), 'buy'); assert.equal(g.hints, 1); assert.equal(g.buy('heart'), 'buy'); assert.equal(g.maxHearts, 4); assert.equal(g.hearts, 4);
  assert.equal(g.buy('magnet'), 'buy'); assert.equal(g.magnet, true);
  assert.equal(g.buy('pirate'), 'buy'); assert.equal(g.wear, 'pirate'); assert.equal(g.buy('pirate'), 'wear'); assert.equal(g.wear, '');
  g.pull(1); assert.equal(g.buy('hint'), false);
  const poor = pinLevel(1); poor.coins = 0; assert.equal(poor.buy('hint'), false);
});
test('Pins: chapters open and close with story cards; nothing moves while one is up', () => {
  const g = games.newPinGame(rng(), 'normal'); assert.equal(g.story.kind, 'intro'); assert.equal(g.pull(1), false);
  g.closeStory(); for (let k = 1; k < 5; k++) { g.phase = 'won'; g.next(); }
  solve(g); assert.equal(g.phase, 'won'); assert.equal(g.story.kind, 'outro'); assert.equal(g.next(), false);
  g.closeStory(); assert.equal(g.next(), true); assert.equal(g.chapterOf(), 1); assert.equal(g.story.kind, 'intro');
});
test('Pins: three lost tries end the run; a later lap needs more gold; nothing moves before the first pin', () => {
  const g = pinLevel(2);
  for (let k = 0; k < 3; k++) { play(g, [1]); assert.equal(g.phase, 'lost'); if (k < 2) assert.equal(g.retry(), true); }
  assert.equal(g.ended, true); assert.equal(g.retry(), false);
  assert.ok(pinLevel(16).need > pinLevel(1).need);
  const q = pinLevel(1); const before = Array.from(q.cell); q.step(2000); assert.deepEqual(Array.from(q.cell), before); assert.equal(q.phase, 'play');
});

// ---- 눈보라 난로 ----
const frost = (d = 'normal', seed = 12345) => { const g = games.newFrostGame(rng(seed), d); g.closeStory(); return g; };
const frostBot = (diff, ms, build = true, seed = 1) => {
  const g = frost(diff, seed); g.start();
  for (let t = 0; t < ms && !g.ended; t += 50) {
    const c = g.chief; let tx, ty;
    const cost = g.upgradeCost(), padNeeds = cost && (g.pad.logs < cost[0] || (g.pad.coal < cost[1] && c.coal > 0));
    const plot = build && g.plots.find(p => p.cost[p.level] != null);
    if (g.load() >= g.cap() || (g.fuel < 3 && g.load() > 0)) {
      if (g.fuel > 7 && build && padNeeds && g.furnace < 3) { tx = g.pad.x; ty = g.pad.y; }
      else if (plot && g.fuel > 7 && c.carry > 0) { tx = plot.x; ty = plot.y; } else { tx = g.CX; ty = g.CY; }
    }
    else if (g.crates.length && !g.crates[0].h && Math.hypot(g.crates[0].x - c.x, g.crates[0].y - c.y) < 250) { tx = g.crates[0].x; ty = g.crates[0].y; }
    else if (c.warmth < 0.4 && g.fuel > 1.5) { tx = g.CX; ty = g.CY + 30; }
    else { const tr = g.trees.filter(t => t.logs > 0).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; tx = tr ? tr.x : g.CX; ty = tr ? tr.y + 6 : g.CY; }
    const dx = tx - c.x, dy = ty - c.y, m = Math.hypot(dx, dy); g.steer(m > 14 ? dx / m : 0, m > 14 ? dy / m : 0); g.step(50);
  }
  return g;
};
test('Frost: the story card comes first; nothing burns until the first move', () => {
  const g = games.newFrostGame(rng(), 'normal'); assert.ok(g.story); g.steer(1, 0); assert.equal(g.started, false);
  g.closeStory(); const f = g.fuel; for (let i = 0; i < 40; i++) g.step(50); assert.equal(g.fuel, f); assert.equal(g.ended, false);
});
test('Frost: the field is wide; the chief walks all of it and the landmarks lie far out', () => {
  const g = frost(); g.start();
  assert.ok(g.WW >= 1200 && g.WH >= 1200 && g.WW > g.W * 3);
  g.steer(1, 0); for (let i = 0; i < 200; i++) g.step(50); assert.ok(g.chief.x > g.WW - 60, 'walked to ' + g.chief.x);
  assert.equal(g.springs.length, 3); assert.equal(g.cabins.length, 3); assert.equal(g.coal.length, 4); assert.equal(g.dens.length, 2);
  for (const m of [...g.springs, ...g.cabins, ...g.coal, ...g.dens]) { const d = Math.hypot(m.x - g.CX, m.y - g.CY); assert.ok(d > 250 && m.x > 0 && m.x < g.WW && m.y > 0 && m.y < g.WH, 'landmark at ' + Math.round(d)); }
  assert.ok(g.trees.length > 40, g.trees.length + ' trees'); assert.ok(g.trees.some(t => t.big));
  assert.equal(g.cabins.map(b => b.loot).sort().join(), 'fuel,gear,survivor');
});
test('Frost: chopping fills the load; the furnace takes it; the upgrade pad levels the furnace up', () => {
  const g = frost(); g.start();
  const tr = g.trees.filter(t => !t.big).sort((a, b) => Math.hypot(a.x - g.CX, a.y - g.CY) - Math.hypot(b.x - g.CX, b.y - g.CY))[0];
  g.chief.x = tr.x + 26; g.chief.y = tr.y + 6; for (let i = 0; i < 80; i++) g.step(50);
  assert.equal(g.chief.carry, tr.max);
  g.chief.carry = 4; g.fuel = 1; g.chief.x = g.CX; g.chief.y = g.CY + 40; g.step(20); assert.equal(g.chief.carry, 0); assert.ok(g.fuel > 4.9);
  // Level 2 takes 8 logs on the pad; level 3 takes logs and coal.
  assert.equal(g.upgradeCost().join(), '8,0');
  g.chief.carry = 8; g.chief.x = g.pad.x; g.chief.y = g.pad.y; for (let i = 0; i < 30; i++) g.step(50);
  assert.equal(g.furnace, 2); assert.equal(g.chief.carry, 0);
  assert.equal(g.upgradeCost().join(), '12,2');
  g.chief.carry = 12; g.chief.coal = 1; for (let i = 0; i < 40; i++) g.step(50);
  assert.equal(g.furnace, 2, 'waits for the coal'); assert.equal(g.pad.logs, 12); assert.equal(g.pad.coal, 1);
  g.chief.coal = 1; for (let i = 0; i < 5; i++) g.step(50); assert.equal(g.furnace, 3);
  assert.ok(g.radius() > 92 + 16 * 2);
});
test('Frost: a full furnace spills onto the pad; coal is dug far out and burns for three', () => {
  const g = frost(); g.start();
  g.fuel = g.maxFuel(); g.chief.carry = 5; g.chief.x = g.CX; g.chief.y = g.CY + 40; g.step(20);
  assert.equal(g.pad.logs, 5, 'the spare logs went onto the pad');
  const s = g.coal[0]; g.chief.x = s.x + 30; g.chief.y = s.y; g.fuel = 99; for (let i = 0; i < 80; i++) g.step(50);
  assert.equal(g.chief.coal, g.cap()); assert.equal(s.left, s.max - g.cap());
  g.fuel = 1; g.chief.x = g.CX; g.chief.y = g.CY + 40; g.step(20); assert.ok(g.fuel >= 9.9, 'fuel ' + g.fuel);
});
test('Frost: logs laid on a plot raise the building, level by level; the hut and the mine hire helpers', () => {
  const g = frost(); g.start(); const hut = g.plots.find(p => p.id === 'hut');
  g.chief.carry = 12; g.chief.x = hut.x; g.chief.y = hut.y; for (let i = 0; i < 60; i++) g.step(50);
  assert.equal(hut.level, 1); assert.equal(g.workers.length, 1); assert.equal(g.mission.id, 'feed');
  g.chief.carry = 16; for (let i = 0; i < 60; i++) g.step(50); assert.equal(hut.level, 2); assert.equal(g.workers.filter(w => w.kind === 'wood').length, 2);
  g.chief.x = 300; g.chief.y = 300; const fed = g.fed; g.fuel = 2; for (let i = 0; i < 600; i++) { g.chief.warmth = 1; g.step(50); }
  assert.ok(g.fed > fed, 'the helpers fed ' + (g.fed - fed));
  const mine = g.plots.find(p => p.id === 'mine'); g.chief.carry = 16; g.chief.x = mine.x; g.chief.y = mine.y; for (let i = 0; i < 60; i++) g.step(50);
  assert.equal(mine.level, 1); assert.equal(g.workers.filter(w => w.kind === 'coal').length, 1);
  const coal = g.coalFed; g.chief.x = 300; g.chief.y = 300; for (let i = 0; i < 1200; i++) { g.chief.warmth = 1; g.fuel = 1; g.step(50); }
  assert.ok(g.coalFed > coal, 'the miner brought ' + (g.coalFed - coal));
  const store = g.plots.find(p => p.id === 'store'), cap = g.cap(), fuel = g.maxFuel(); store.level = 1; assert.equal(g.cap(), cap + 3); assert.equal(g.maxFuel(), fuel + 4);
  store.level = 2; assert.equal(g.cap(), cap + 5); assert.equal(g.maxFuel(), fuel + 8);
});
test('Frost: hot springs warm the chief far from camp; cabins are searched once', () => {
  const g = frost(); g.start(); const sp = g.springs[0];
  g.chief.x = sp.x; g.chief.y = sp.y; g.chief.warmth = 0.3; for (let i = 0; i < 20; i++) g.step(50); assert.ok(g.chief.warmth > 0.6, 'warmth ' + g.chief.warmth);
  g.chief.x = 300; g.chief.y = 300; g.chief.warmth = 1; for (let i = 0; i < 20; i++) g.step(50); assert.ok(g.chief.warmth < 1);
  for (const b of g.cabins) { g.chief.x = b.x; g.chief.y = b.y + 10; g.chief.warmth = 1; g.step(20); assert.equal(b.open, true); }
  assert.equal(g.looted, 3); assert.ok(Object.values(g.gear).some(Boolean)); assert.ok(g.strangers.some(s => s.follow));
  const load = g.load(); g.chief.x = g.cabins[0].x; g.chief.y = g.cabins[0].y + 10; g.step(20); assert.equal(g.load(), load); assert.equal(g.looted, 3);
});
test('Frost: missions follow the days and give gear; the campaign is longer on harder levels', () => {
  const g = frost(); g.start(); assert.equal(g.mission.id, 'feed');
  g.chief.carry = 12; g.chief.x = g.CX; g.chief.y = g.CY + 40; g.fuel = 0.5; g.step(20);
  assert.equal(g.mission.done, true); assert.equal(g.missionsDone, 1);
  g.time = g.DAY + 1; g.step(20); assert.equal(g.mission.id, 'build'); assert.equal(g.gear.boots, false);
  const tent = g.plots.find(p => p.id === 'tent'); g.chief.carry = 8; g.chief.x = tent.x; g.chief.y = tent.y; for (let i = 0; i < 40; i++) g.step(50);
  assert.equal(g.gear.boots, true); assert.ok(g.speed() > 124);
  g.furnace = 3; g.time = 2 * g.DAY + 1; g.step(20); assert.equal(g.mission.id, 'upgrade'); assert.equal(g.mission.done, true, 'a furnace already at level 3 counts'); assert.equal(g.gear.coat, true);
  assert.equal(['easiest', 'easy', 'normal', 'hard', 'expert'].map(d => frost(d).DAYS).join(), '3,4,5,6,7');
  assert.equal(frost('expert').missions[frost('expert').missions.length - 1].id, 'safe');
});
test('Frost: the alpha wolf comes on the third night; living through the last day brings the helicopter', () => {
  const g = frost(); g.start(); g.fuel = 99; g.time = 2 * g.DAY + g.NIGHT + 5; for (let i = 0; i < 4; i++) g.step(50);
  assert.ok(g.wolves.some(w => w.alpha));
  const h = frost('easiest'); h.start(); h.fuel = 99; h.time = h.DAYS * h.DAY - 0.05; for (let i = 0; i < 100 && !h.ended; i++) h.step(50);
  assert.equal(h.won, true); assert.equal(h.why, 'rescue'); assert.ok(h.score >= 500);
});
test('Frost: standing still the camp freezes quickly; a chief who builds and feeds is rescued on 보통 and lasts far longer on 달인', () => {
  for (const d of ['easiest', 'normal', 'expert']) {
    const idle = frost(d, 1); idle.start(); for (let i = 0; i < 4000 && !idle.ended; i++) idle.step(50);
    assert.equal(idle.ended, true); assert.equal(idle.won, false); assert.ok(idle.time < 100, d + ' idle ' + idle.time);
  }
  for (const seed of [1, 2, 3]) { const b = frostBot('normal', 500000, true, seed); assert.equal(b.won, true, 'seed ' + seed + ' ' + b.why + ' at ' + Math.round(b.time)); assert.ok(b.furnace >= 3, 'furnace ' + b.furnace); }
  assert.ok(frostBot('expert', 600000, true, 3).time > 300);
});
test('Frost: a stranger follows the chief and joins inside the warm circle', () => {
  const g = frost(); g.start();
  g.strangers.push({ x: 300, y: 300, follow: false, life: 28, t: 0 });
  g.chief.x = 310; g.chief.y = 300; g.step(20); assert.equal(g.strangers[0].follow, true);
  const n = g.people.length; g.chief.x = g.CX + 30; g.chief.y = g.CY + 40; for (let i = 0; i < 100; i++) g.step(50);
  assert.equal(g.people.length, n + 1); assert.equal(g.rescued, 1);
});

// ---- 탑 공략 ----
const tower = (seed = 12345, d = 'normal') => { const g = games.newTowerGame(rng(seed), d); g.closeStory(); return g; };
const room = (k, v = 0) => ({ k, v, done: false });
const skip = g => { g.phase = 'won'; g.story = null; g.next(); g.story = null; };
test('Tower: every dealt level can be cleared, at every difficulty and level, boss levels too', () => {
  for (const d of ['easiest', 'easy', 'normal', 'hard', 'expert']) for (let s = 1; s <= 15; s++) {
    const g = tower(s, d);
    for (let L = 1; L <= 16; L++) {
      assert.ok(g.solvable(), d + ' seed ' + s + ' level ' + L);
      if (L % 5 === 0) { const top = g.towers.find(t => t.some(r => r.k === 'boss')); assert.equal(top.slice(-2).map(r => r.k).join(), 'boss,princess'); }
      skip(g);
    }
  }
});
test('Tower: a chapter opens with a story card that blocks play until tapped', () => {
  const g = games.newTowerGame(rng(), 'normal');
  assert.equal(g.story.kind, 'intro'); assert.equal(g.enter(0), false); assert.equal(g.closeStory(), true); assert.notEqual(g.enter(0), false);
});
test('Tower: only the lowest room is reached; a weaker foe adds its power, a stronger one costs a heart', () => {
  const g = tower();
  g.towers = [[room('foe', 3), room('foe', 1)], [room('foe', 50)]]; g.power = 5;
  assert.equal(g.reach(0), 0); assert.equal(g.enter(0), 'win'); assert.equal(g.power, 8); assert.equal(g.reach(0), 1);
  assert.equal(g.enter(1), 'lose'); assert.equal(g.hearts, 2); assert.equal(g.phase, 'lost'); assert.equal(g.enter(0), false);
  assert.equal(g.retry(), true); assert.equal(g.phase, 'play');
});
test('Tower: potions, swords, spikes, poison, keys and locks; clearing every room wins with stars and gold', () => {
  const g = tower();
  g.towers = [[room('add', 4), room('mul', 2), room('trap', 3), room('poison', 2), room('lock', 10), room('boss', 7)], [room('key', 1)]]; g.power = 5;
  assert.equal(g.enter(0), 'add'); assert.equal(g.enter(0), 'mul'); assert.equal(g.power, 18); assert.equal(g.enter(0), 'trap'); assert.equal(g.power, 15);
  assert.equal(g.enter(0), 'poison'); assert.equal(g.power, 8);
  assert.equal(g.enter(0), 'locked'); assert.equal(g.enter(1), 'key'); const gold = g.gold; assert.equal(g.enter(0), 'lock'); assert.equal(g.gold, gold + 10);
  assert.equal(g.enter(0), 'boss'); assert.equal(g.phase, 'won'); assert.equal(g.score, 1); assert.equal(g.clearStar, 3); assert.ok(g.gold > gold + 10);
  assert.equal(g.next(), true); assert.equal(g.level, 2);
  const t = tower(); t.towers = [[room('trap', 9)]]; t.power = 5; assert.equal(t.enter(0), 'lose'); assert.equal(t.why, 'trap');
});
test('Tower: a shield takes one lost fight; the shop sells training, hearts and outfits only between fights', () => {
  const g = tower(); g.gold = 1000;
  assert.equal(g.buy('shield'), 'buy'); assert.equal(g.shields, 1);
  const p = g.power; assert.equal(g.buy('train'), 'buy'); assert.equal(g.power, p + 3);
  assert.equal(g.buy('heart'), 'buy'); assert.equal(g.hearts, 4); assert.equal(g.maxHearts, 4);
  assert.equal(g.buy('cape'), 'buy'); assert.equal(g.wear, 'cape'); assert.equal(g.buy('cape'), 'wear'); assert.equal(g.wear, '');
  g.towers = [[room('foe', 999), room('foe', 1)]];
  assert.equal(g.enter(0), 'block'); assert.equal(g.shields, 0); assert.equal(g.hearts, 4); assert.equal(g.phase, 'play'); assert.equal(g.reach(0), 0);
  g.towers = [[room('foe', 1), room('foe', 999)]]; g.enter(0); assert.equal(g.buy('glass'), false);
  const poor = tower(); poor.gold = 0; assert.equal(poor.buy('shield'), false);
});
test('Tower: a retry costs a star; the fifth level ends the chapter with the princess and a story card', () => {
  const g = tower(); g.towers = [[room('foe', 99)], [room('foe', 1)]]; g.power = 5; g.enter(0); g.retry();
  g.towers = [[room('foe', 1)]]; g.power = 5; g.enter(0); assert.equal(g.clearStar, 2);
  const b = tower(); for (let L = 1; L < 5; L++) skip(b);
  assert.equal(b.bossLevel(), true); b.towers = [[room('boss', 1), room('princess')]]; b.power = 5;
  b.enter(0); assert.equal(b.enter(0), 'princess'); assert.equal(b.phase, 'won'); assert.equal(b.story.kind, 'outro');
  assert.equal(b.next(), false); b.closeStory(); assert.equal(b.next(), true); assert.equal(b.chapterOf(), 1); assert.equal(b.story.kind, 'intro');
});
