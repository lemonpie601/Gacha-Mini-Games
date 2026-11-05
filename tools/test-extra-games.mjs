import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const names = ['newDinoGame', 'newWaterSortGame', 'newKnifeGame', 'newCountMastersGame', 'newCandyGame'];
const games = runInNewContext(`${models}\nObject.fromEntries(${JSON.stringify(names)}.map(name => [name, eval('typeof '+name) === 'function' ? eval(name) : null]))`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const tau = Math.PI * 2, gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('Dino: a tap is a short hop, holding jumps higher, no double jump', () => {
  const peak = hold => { const g = games.newDinoGame(rng()); g.jump(); if (!hold) g.release(); let m = 0; for (let i = 0; i < 90; i++) { g.step(16); m = Math.max(m, g.y); } return [m, g]; };
  const [low] = peak(false), [high, g] = peak(true);
  assert.ok(low >= 30 && low < high, `hop ${low} < jump ${high}`);
  assert.equal(g.y, 0);
  const air = games.newDinoGame(rng()); air.jump(); air.step(50); const vy = air.vy; air.jump(); assert.equal(air.vy, vy);
});
test('Dino: cactus kills on the ground, a jump clears it, ducking clears the middle bird', () => {
  const ground = games.newDinoGame(rng()); ground.duck(true); ground.duck(false); ground.runTime = -99;
  ground.obstacles = [{ kind: 'small', size: 1, x: 70, w: 17, h: 35, y: 0, vx: 0, gap: 999 }]; ground.step(10); assert.equal(ground.ended, true);
  const air = games.newDinoGame(rng()); air.jump(); air.y = 70; air.runTime = -99;
  air.obstacles = [{ kind: 'small', size: 1, x: 70, w: 17, h: 35, y: 0, vx: 0, gap: 999 }]; air.step(10); assert.equal(air.ended, false);
  const duck = games.newDinoGame(rng()); duck.duck(true); duck.runTime = -99;
  duck.obstacles = [{ kind: 'ptero', size: 1, x: 70, w: 46, h: 40, y: 25, vx: 0, gap: 999 }]; duck.step(10); assert.equal(duck.ended, false);
  duck.duck(false); duck.step(10); assert.equal(duck.ended, true);
});
test('Dino: speeds up to its cap and scores 0.025 a pixel', () => {
  const g = games.newDinoGame(rng(), 'normal'); g.jump(); g.release(); g.runTime = -1e9;
  for (let i = 0; i < 2000; i++) g.step(100);
  assert.equal(g.speed, 15); assert.equal(g.score, Math.floor(g.distance * 0.025)); assert.ok(g.hundreds > 0);
});
test('Water: every level is mixed, keeps four of each colour and grows', () => {
  for (const level of [1, 5, 15]) {
    const g = games.newWaterSortGame(rng(level), 'normal', level), counts = Array(g.colors).fill(0);
    g.bottles.forEach(b => b.forEach(c => counts[c]++));
    assert.deepEqual(counts, Array(g.colors).fill(4)); assert.ok(g.bottles.some(b => new Set(b).size > 1));
    assert.equal(g.bottles.length, g.colors + 2);
  }
  assert.ok(games.newWaterSortGame(rng(), 'normal', 9).colors > games.newWaterSortGame(rng(), 'normal', 1).colors);
});
test('Water: pours whole runs, undo is limited, the spare tube survives undo', () => {
  const g = games.newWaterSortGame(rng(), 'easy');
  g.bottles = [[0, 1, 1], [1], [2, 2], [], [0, 0, 0], [2, 2]];
  assert.equal(g.pour(0, 2), 0); assert.equal(g.pour(0, 1), 2); assert.deepEqual(Array.from(g.bottles[1]), [1, 1, 1]);
  assert.equal(g.addBottle(), true); assert.equal(g.addBottle(), false);
  assert.equal(g.undo(), true); assert.equal(g.bottles.length, 7); assert.equal(g.undos, 4);
  g.undos = 0; g.pour(0, 1); assert.equal(g.undo(), false);
});
test('Water: 입문 puzzles are solvable', () => {
  for (const seed of [1, 7, 83]) {
    const g = games.newWaterSortGame(rng(seed), 'easiest');
    const key = bs => bs.map(b => b.join('')).sort().join('|'), queue = [g.bottles.map(b => Array.from(b))], seen = new Set([key(queue[0])]);
    let found = false;
    for (let at = 0; at < queue.length && at < 100000 && !found; at++) {
      const bs = queue[at];
      if (bs.every(b => !b.length || b.length === 4 && b.every(c => c === b[0]))) found = true;
      for (let i = 0; i < bs.length; i++) for (let j = 0; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (i === j || !a.length || b.length === 4 || b.length && a.at(-1) !== b.at(-1)) continue;
        let n = 1; while (n < a.length && a.at(-1 - n) === a.at(-1)) n++;
        n = Math.min(n, 4 - b.length);
        const next = bs.map(x => x.slice()); next[j].push(...next[i].splice(-n));
        const k = key(next); if (!seen.has(k)) { seen.add(k); queue.push(next); }
      }
    }
    assert.equal(found, true, 'seed ' + seed);
  }
});
test('Knife: one throw at a time, a hit scores, hitting a knife ends the run', () => {
  const g = games.newKnifeGame(rng()); g.pattern = 'steady'; g.base = 0;
  assert.equal(g.throwKnife(), true); assert.equal(g.throwKnife(), false); g.step(200);
  assert.equal(g.score, 1); assert.equal(g.ended, false);
  g.throwKnife(); g.step(200); assert.equal(g.ended, true);
});
test('Knife: clearing a log moves on, the fifth is a boss, play is endless', () => {
  const g = games.newKnifeGame(rng(3));
  let t = 0;
  while (g.stage < 5 && !g.ended && t < 400) {
    const hit = ((Math.PI / 2 - g.angle) % tau + tau) % tau;
    if (g.knives.every(a => gap(a, hit) > 0.35)) g.throwKnife();
    g.step(16); t += 0.016;
  }
  assert.equal(g.stage, 5); assert.equal(g.boss, true);
  g.next(); assert.equal(g.stage, 6); assert.equal(g.boss, false); assert.ok(g.remaining > 0);
});
test('Count: gates, walls and enemy crowds change the crowd; stairs multiply the score', () => {
  for (const level of ['easiest', 'easy', 'normal', 'hard']) {
    const g = games.newCountMastersGame(rng(9), level); g.start();
    let t = 0;
    while (!g.ended && t < 90) {
      const e = g.events.find(e => !e.done);
      if (e?.type === 'gate') { const v = e.gates.map(x => x.op === '*' ? g.count * x.v : x.op === '/' ? g.count / x.v : x.op === '-' ? g.count - x.v : g.count + x.v); g.aim(v[0] > v[1] ? -0.7 : 0.7); }
      else if (e?.type === 'block') g.aim(e.from < 0 ? 0.9 : -0.9);
      else if (e?.type === 'saw') g.aim(g.sawAt(e) > 0 ? -0.9 : 0.9);
      else g.aim(0);
      g.step(16); t += 0.016;
    }
    assert.equal(g.won, true, level); if (level === 'easiest' || level === 'easy') assert.ok(g.mult > 1); // the crowds of 보통 and up reach the stairs with a handful assert.equal(g.score, Math.round(g.finishCount * g.mult));
  }
  const lose = games.newCountMastersGame(rng(), 'hard'); lose.start();
  lose.events[0].gates = [{ op: '-', v: 50 }, { op: '-', v: 50 }]; lose.z = lose.events[0].z - 0.1; lose.step(100);
  assert.equal(lose.ended, true); assert.equal(lose.won, false);
});

const settleAll = g => { let n = 0; while (g.phase === 'busy' && n++ < 2000) g.settle(); };
test('Candy: a fresh board has no matches, a move, and a full grid', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = games.newCandyGame(rng(seed));
    assert.ok(g.hint()); assert.equal(g.grid.flat().filter(Boolean).length, 64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) assert.ok(!(g.grid[r][c].color === g.grid[r][c + 1].color && g.grid[r][c].color === g.grid[r][c + 2].color));
  }
});
test('Candy: an illegal swap costs nothing, a legal one clears and refills', () => {
  const g = games.newCandyGame(rng(7)), moves = g.moves, h = g.hint();
  assert.equal(g.trySwap([0, 0], [5, 5]), 'no');
  const [a, b] = h; assert.equal(g.trySwap(a, b), 'ok'); assert.equal(g.moves, moves - 1);
  const e = g.settle(); assert.equal(e.type, 'clear'); assert.ok(g.score > 0);
  settleAll(g); assert.equal(g.grid.flat().filter(Boolean).length, 64);
});
test('Candy: four in a row makes a striped candy, five a colour bomb, an L a wrapped one', () => {
  const g = games.newCandyGame(rng(2));
  const set = (cells, color) => cells.forEach(([r, c]) => { g.grid[r][c].color = color; g.grid[r][c].kind = 'n'; });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { g.grid[r][c].color = (r * 3 + c * 2 + (r >> 1)) % 6; g.grid[r][c].kind = 'n'; }
  set([[7, 0], [7, 1], [7, 2], [7, 3]], 0); g.phase = 'busy';
  let e = g.settle(); assert.equal(e.created[0].kind, 'v');
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { g.grid[r][c] = g.grid[r][c] || { id: 9000 + r * 8 + c }; g.grid[r][c].color = (r * 3 + c * 2 + (r >> 1)) % 6; g.grid[r][c].kind = 'n'; }
  set([[7, 0], [7, 1], [7, 2], [7, 3], [7, 4]], 1); g.phase = 'busy';
  e = g.settle(); assert.equal(e.created[0].kind, 'b');
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { g.grid[r][c] = g.grid[r][c] || { id: 9100 + r * 8 + c }; g.grid[r][c].color = (r * 3 + c * 2 + (r >> 1)) % 6; g.grid[r][c].kind = 'n'; }
  set([[5, 0], [6, 0], [7, 0], [7, 1], [7, 2]], 2); g.phase = 'busy';
  e = g.settle(); assert.equal(e.created[0].kind, 'w');
});
test('Candy: a level ends won (with sugar crush) or lost', () => {
  const g = games.newCandyGame(rng(11), 'easy'); g.target = 10;
  const [a, b] = g.hint(); g.trySwap(a, b); settleAll(g);
  assert.equal(g.won, true); assert.equal(g.moves, 0); assert.ok(g.sugar);
  const l = games.newCandyGame(rng(12), 'hard'); l.target = 1e9; l.moves = 1;
  const [c, d] = l.hint(); l.trySwap(c, d); settleAll(l);
  assert.equal(l.ended, true); assert.equal(l.won, false);
});
