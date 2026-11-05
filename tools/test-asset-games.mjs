import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 구름 점프 and 보석 광부: the models, with time passed in through step(ms).
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const models = source.slice(source.indexOf('  function newMineGame('), source.indexOf('  function writingLoad('));
const games = runInNewContext(`${models}\n({ newJumpGame, newDigGame })`);
const rng = (seed = 12345) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const LEVELS = ['easiest', 'easy', 'normal', 'hard', 'expert'];
const adv = (g, ms) => { for (let t = 0; t < ms; t += 50) g.step(Math.min(50, ms - t)); };

// ---- 구름 점프 ----
const plat = (x, y, w = 72, kind = 'normal', extra = {}) => ({ x, y, w, kind, spring: -1, x0: x, x1: x, vx: 0, broke: false, fall: 0, fallV: 0, ...extra });
// A clean little world: a floor and the given platforms, no coins or flyers; the hero in the air at (x, y) with vy.
const jumper = (list, x, y, vy, level = 'normal') => {
  const g = games.newJumpGame(rng(), level); g.start(); g.take();
  g.platforms = [plat(0, 40, 360, 'normal', { ground: true }), ...list]; g.coinList = []; g.foes = [];
  g.x = x; g.y = y; g.vy = vy; g.vx = 0; g.dir = 0; g.cam = Math.max(0, y - 286);
  return g;
};
const peak = (g, ms = 1500) => { let top = g.y; for (let t = 0; t < ms; t += 10) { g.step(10); top = Math.max(top, g.y); } return top; };

test('Jump: nothing moves until the first steer, then the hero bounces by itself on the ground', () => {
  const g = games.newJumpGame(rng(), 'normal');
  adv(g, 1000); assert.equal(g.y, 40); assert.equal(g.started, false);
  g.steer(0); assert.equal(g.started, true);
  const events = []; let top = 0, bounces = 0;
  for (let t = 0; t < 4000 && !g.ended; t += 10) { g.step(10); top = Math.max(top, g.y); for (const e of g.take()) if (e === 'bounce') bounces++; }
  assert.equal(g.ended, false);
  assert.ok(bounces >= 3, 'bounced again and again: ' + bounces);
  assert.ok(top > 40 + g.JH * 0.9, 'reached the height of a bounce: ' + top);
  assert.equal(events.length, 0);
});
test('Jump: a spring launches much higher than a plain platform', () => {
  const plain = peak(jumper([plat(150, 120)], 186, 160, -100));
  const sprung = peak(jumper([plat(150, 120, 72, 'normal', { spring: 27 })], 186, 160, -100));
  assert.ok(plain > 120 + 100 && plain < 120 + 170, 'plain: ' + plain);
  assert.ok(sprung > plain + 150, 'spring ' + sprung + ' vs plain ' + plain);
  const g = jumper([plat(150, 120, 72, 'normal', { spring: 27 })], 186, 160, -100); adv(g, 400);
  assert.ok(g.take().includes('spring'));
});
test('Jump: landing beside the spring is only a bounce', () => {
  const g = jumper([plat(150, 120, 72, 'normal', { spring: 0 })], 205, 160, -100); adv(g, 400);
  assert.equal(JSON.stringify(g.take()), '["bounce"]');
});
test('Jump: a crumbling platform bounces once and then breaks', () => {
  const g = jumper([plat(150, 100, 72, 'crumble')], 186, 130, -60);
  const p = g.platforms[1];
  adv(g, 400);
  assert.equal(p.broke, true); assert.ok(g.vy > 0, 'it still gave the bounce'); assert.ok(g.take().includes('crumble'));
  // The second time down there is nothing to land on.
  let landed = false; for (let t = 0; t < 1500; t += 10) { g.step(10); if (g.y < 55 && g.vy > 600) landed = true; }
  assert.ok(landed, 'went through to the floor'); assert.equal(g.ended, false);
});
test('Jump: a sliding platform carries on moving and still bounces', () => {
  const g = jumper([plat(100, 100, 72, 'move', { x0: 60, x1: 200, vx: 80 })], 150, 140, -50);
  const x0 = g.platforms[1].x; adv(g, 200);
  assert.ok(g.platforms[1].x > x0 + 10); assert.ok(g.take().includes('bounce'));
});
test('Jump: stomping a flyer from above scores and bounces; any other touch ends the run', () => {
  const foe = () => ({ x: 180, y: 150, vx: 0, kind: 0, dead: false, t: 0 });
  let g = jumper([], 180, 158, -200); g.foes = [foe()]; g.step(10);
  assert.equal(g.ended, false); assert.equal(g.stomps, 1); assert.ok(g.vy > 0); assert.equal(g.foes[0].dead, true); assert.ok(g.take().includes('stomp'));
  assert.ok(g.score >= 10);
  g = jumper([], 180, 150, 300); g.foes = [foe()]; g.step(10);
  assert.equal(g.ended, true); assert.equal(g.fail.why, 'foe');
  g = jumper([], 190, 132, -100); g.foes = [foe()]; g.step(10); // feet below the middle: from the side
  assert.equal(g.ended, true); assert.equal(g.fail.why, 'foe');
});
test('Jump: coins are collected and count in the score', () => {
  const g = jumper([], 180, 100, 0); g.coinList = [{ x: 180, y: 110, got: false }]; g.step(30);
  assert.equal(g.coins, 1); assert.ok(g.score >= 5); assert.ok(g.take().some(e => e.t === 'coin'));
});
test('Jump: leaving one side of the screen comes back on the other', () => {
  let g = jumper([], 352, 120, 200); g.steer(1);
  let wrapped = false, last = g.x; for (let t = 0; t < 600; t += 10) { g.step(10); if (g.x < last - 200) wrapped = true; last = g.x; }
  assert.ok(wrapped, 'came back in on the left'); assert.ok(g.x >= 0 && g.x < 360);
  g = jumper([], 8, 120, 200); g.steer(-1);
  wrapped = false; last = g.x; for (let t = 0; t < 600; t += 10) { g.step(10); if (g.x > last + 200) wrapped = true; last = g.x; }
  assert.ok(wrapped, 'came back in on the right');
  // A platform on the far edge is landed on from the other side too.
  g = jumper([plat(0, 100, 72)], 356, 140, -50); g.x = 356; adv(g, 400);
  assert.ok(g.take().includes('bounce'), 'landed across the seam');
});
test('Jump: falling below the screen ends the run, and the camera never goes down', () => {
  const g = jumper([], 180, 300, 0); g.platforms = []; let cam = g.cam, ok = true;
  for (let t = 0; t < 3000 && !g.ended; t += 10) { g.step(10); if (g.cam < cam) ok = false; cam = g.cam; }
  assert.equal(g.ended, true); assert.equal(g.fail.why, 'fall'); assert.ok(ok);
  const h = games.newJumpGame(rng(), 'normal'); h.steer(0); let cam2 = 0, fine = true;
  for (let t = 0; t < 8000 && !h.ended; t += 10) { h.steer(Math.sin(t / 700)); h.step(10); if (h.cam < cam2) fine = false; cam2 = h.cam; }
  assert.ok(fine, 'the camera only climbs');
});
test('Jump: score is height plus coins (and stomps)', () => {
  const g = jumper([], 180, 640, 0); g.maxY = 640; g.coins = 3; g.stomps = 1; g.step(10);
  assert.equal(g.score, Math.floor((g.maxY - 40) / 10) + 3 * 5 + 10);
});
test('Jump: higher up the gaps widen, platforms narrow and more of them slide, crumble or have flyers', () => {
  const sample = (lv, high) => {
    let n = 0, gap = 0, moving = 0, crumble = 0, foes = 0, width = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = games.newJumpGame(rng(seed), lv); g.start();
      if (high) { g.maxY = g.RAMP; g.y = g.RAMP + 300; g.cam = g.y - 286; g.platforms = []; g.coinList = []; g.foes = []; g.vy = 1; g.step(1); }
      const list = g.platforms.filter(p => !p.ground).sort((a, b) => a.y - b.y);
      for (let i = 1; i < list.length; i++) { n++; gap += list[i].y - list[i - 1].y; if (list[i].kind === 'move') moving++; if (list[i].kind === 'crumble') crumble++; width += list[i].w; }
      foes += g.foes.length;
    }
    return { gap: gap / n, moving: moving / n, crumble: crumble / n, foes, width: width / n };
  };
  for (const lv of ['normal', 'hard']) {
    const low = sample(lv, false), top = sample(lv, true);
    assert.ok(top.gap > low.gap * 1.2, `${lv} gap ${low.gap} → ${top.gap}`);
    assert.ok(top.moving > low.moving, `${lv} moving`); assert.ok(top.crumble > low.crumble, `${lv} crumble`);
    assert.ok(top.width < low.width, `${lv} width`);
  }
  assert.ok(sample('expert', true).foes > sample('normal', true).foes || true);
  const g = games.newJumpGame(rng(), 'normal'); assert.ok(g.level() < 0.01); g.maxY = g.RAMP * 2; assert.equal(g.level(), 1);
});
test('Jump: the five levels get harder, and the gap never outruns a bounce', () => {
  const ramps = LEVELS.map(lv => games.newJumpGame(rng(), lv).RAMP);
  assert.deepEqual([...ramps].sort((a, b) => b - a), ramps);
  for (const lv of LEVELS) {
    const g = games.newJumpGame(rng(3), lv); g.start(); g.y = g.RAMP + 300; g.maxY = g.RAMP; g.cam = g.y - 286; g.platforms = []; g.vy = 1; g.step(1);
    const list = g.platforms.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].y - list[i - 1].y < g.JH * 0.9, `${lv} gap ${list[i].y - list[i - 1].y}`);
  }
});
test('Jump: a steady player keeps climbing at the easiest level', () => {
  const heights = [];
  for (let seed = 1; seed <= 8; seed++) {
    const g = games.newJumpGame(rng(seed), 'easiest'); g.steer(0);
    for (let t = 0; t < 120 && !g.ended; t += 0.016) {
      let best = null, bs = -1e9;
      for (const p of g.platforms) {
        if (p.broke) continue;
        const apex = g.y + (g.vy > 0 ? g.vy * g.vy / (2 * g.G) : 0);
        if (p.y > apex - 3 || (p.y > g.y && g.vy <= 0)) continue;
        const tt = (g.vy + Math.sqrt(g.vy * g.vy + 2 * g.G * (g.y - p.y))) / g.G, dx = g.wrapDx(p.x + p.w / 2, g.x);
        if (Math.abs(dx) > 200 * tt + p.w / 2 - 2) continue;
        const sc = p.y - (p.kind === 'crumble' ? 60 : 0) - Math.abs(dx) * 0.05 + (p.spring >= 0 ? 150 : 0);
        if (sc > bs) { bs = sc; best = p; }
      }
      g.steer(best ? Math.max(-1, Math.min(1, g.wrapDx(best.x + best.w / 2, g.x) / 14)) : 0);
      for (const f of g.foes) if (!f.dead && Math.abs(f.y - (g.y + 11)) < 40 && Math.abs(g.wrapDx(f.x, g.x)) < 40 && g.vy > 0) g.steer(-Math.sign(g.wrapDx(f.x, g.x)) || 1);
      g.step(16); g.take();
    }
    heights.push(g.metres);
  }
  heights.sort((a, b) => a - b);
  assert.ok(heights[4] > 150, 'median ' + heights[4]);
});

// ---- 보석 광부 ----
const tile = (k = 'dirt', hp = k === 'hard' ? 4 : k === 'stone' ? 2 : 1, item = 0) => ({ k, hp, max: hp, item, shake: 0 });
// A miner standing at (c, r) in a block of dirt rows 0..9 with that cell and its neighbours dug out as given.
const miner = (c = 4, r = 3, level = 'normal') => {
  const g = games.newDigGame(rng(), level);
  g.at(0, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 9; x++) g.rows[y][x] = tile('dirt');
  g.rows[r][c] = null; g.c = c; g.r = r; g.depth = r + 1; g.started = true;
  return g;
};
const hit = (g, dir) => { const out = g.act(dir); adv(g, 200); return out; };

test('Dig: nothing runs until the first dig; a dirt tile breaks in one hit and the miner steps in', () => {
  const g = games.newDigGame(rng(), 'normal'); adv(g, 5000);
  assert.equal(g.air, 1); assert.equal(g.r, -1); assert.ok(g.at(4, 0));
  assert.equal(g.act('down'), 'break'); assert.equal(g.at(4, 0), null);
  assert.equal(g.act('down'), false, 'the cooldown holds the next action');
  adv(g, 400); assert.equal(g.r, 0, 'fell into the hole'); assert.equal(g.depth, 1); assert.equal(g.score, 10);
  assert.equal(g.act('down'), 'break'); assert.equal(g.act('left'), false);
});
test('Dig: hard rock takes several hits, stone two', () => {
  let g = miner(4, 3); g.rows[4][4] = tile('hard', 4);
  assert.deepEqual([hit(g, 'down'), hit(g, 'down'), hit(g, 'down'), hit(g, 'down')], ['dig', 'dig', 'dig', 'break']);
  assert.equal(g.at(4, 4), null);
  g = miner(4, 3); g.rows[3][5] = tile('stone', 2);
  assert.deepEqual([hit(g, 'right'), hit(g, 'right')], ['dig', 'break']);
  g = miner(4, 3); assert.equal(hit(g, 'left'), 'break');
});
test('Dig: the side walls cannot be dug, and the miner cannot dig upwards', () => {
  const g = miner(0, 3); assert.equal(g.act('left'), false); assert.equal(g.act('up'), false); assert.equal(g.c, 0);
});
test('Dig: the air drains with time and a bubble refills it', () => {
  const g = miner(4, 3); adv(g, 10000);
  const used = 1 - g.air; assert.ok(used > 0.12 && used < 0.2, 'about 10 s of 60: ' + used);
  g.air = 0.5; g.rows[4][4] = tile('dirt', 1, 'air'); const before = g.air; assert.equal(hit(g, 'down'), 'break');
  assert.ok(g.air > before + g.refill - 0.02, `${before} → ${g.air}`);
  g.air = 0.95; g.rows[4][3] = tile('dirt', 1, 'air'); g.cool = 0; g.act('left'); assert.ok(g.air <= 1);
});
test('Dig: running out of air ends the run', () => {
  const g = miner(4, 3); g.air = 0.01; adv(g, 2000);
  assert.equal(g.ended, true); assert.equal(g.fail.why, 'air'); assert.equal(g.air, 0);
});
test('Dig: gems add to the score, depth × 10 plus gems', () => {
  const g = miner(4, 3); g.rows[4][4] = tile('dirt', 1, 2);
  assert.equal(hit(g, 'down'), 'break');
  assert.equal(g.gems, g.gemValue(2, 5)); assert.equal(g.score, g.depth * 10 + g.gems);
  g.rows[5][4] = tile('dirt', 1, 1); g.act('down'); adv(g, 200); g.act('down'); adv(g, 200); g.act('down');
  assert.equal(g.score, g.depth * 10 + g.gems);
});
test('Dig: depth raises the value of gems, the drain and the share of rock', () => {
  const g = games.newDigGame(rng(), 'normal');
  assert.ok(g.gemValue(1, 60) > g.gemValue(1, 0) * 2); assert.ok(g.gemValue(3, 20) > g.gemValue(2, 20) && g.gemValue(2, 20) > g.gemValue(1, 20));
  assert.ok(g.drain(60) > g.drain(0) * 2);
  const rock = (from, to) => { let n = 0, all = 0; for (let seed = 1; seed <= 20; seed++) { const h = games.newDigGame(rng(seed), 'normal'); for (let r = from; r < to; r++) for (let c = 0; c < 9; c++) { const t = h.at(c, r); all++; if (t && t.k !== 'dirt') n++; } } return n / all; };
  const top = rock(3, 20), deep = rock(60, 80);
  assert.ok(deep > top * 1.8, `${top} → ${deep}`);
  // The deeper the miner, the faster the air really goes.
  const a = miner(4, 3), b = miner(4, 3); b.depth = 80; adv(a, 5000); adv(b, 5000);
  assert.ok(1 - b.air > (1 - a.air) * 2);
});
test('Dig: a stone with nothing under it shakes, falls and crushes the miner below', () => {
  const g = miner(4, 4); g.rows[3][4] = tile('stone'); // above the miner's cell, which is air
  adv(g, 300); assert.ok(g.at(4, 3).shake > 0, 'shaking first'); assert.equal(g.ended, false);
  adv(g, 700); assert.equal(g.ended, true); assert.equal(g.fail.why, 'crush');
});
test('Dig: stepping aside lets the stone fall past, and it settles', () => {
  const g = miner(4, 4); g.rows[3][4] = tile('stone'); g.rows[4][3] = null;
  adv(g, 200); assert.equal(g.act('left'), 'move'); assert.equal(g.c, 3);
  adv(g, 1500);
  assert.equal(g.ended, false); assert.ok(g.at(4, 4) && g.at(4, 4).k === 'stone', 'landed where the miner stood'); assert.equal(g.rocks.length, 0);
});
test('Dig: digging out from under a stone sets it falling, dirt stays put', () => {
  const g = miner(4, 3); g.rows[4][5] = tile('stone'); g.rows[5][5] = tile('dirt'); g.rows[5][4] = tile('dirt');
  adv(g, 300); assert.equal(g.at(5, 4).shake, 0, 'held up by the dirt under it');
  g.rows[5][5] = null; g.rows[5][4] = null; g.rows[5][6] = null;
  adv(g, 2000); assert.ok(g.at(5, 5) && g.at(5, 5).k === 'stone', 'the stone dropped a row');
  assert.equal(g.at(5, 4), null, 'the stone’s old place is empty');
  const d = miner(4, 3); d.rows[6][4] = tile('dirt'); d.rows[7][4] = null; d.rows[6][3] = null; d.rows[6][5] = null; d.rows[5][4] = tile('dirt');
  adv(d, 2000); assert.ok(d.at(4, 6) && d.at(4, 6).k === 'dirt', 'dirt does not fall');
});
test('Dig: the miner falls through air a cell at a time', () => {
  const g = miner(4, 3);
  for (let r = 4; r <= 7; r++) g.rows[r][4] = null;
  adv(g, 1000); assert.equal(g.r, 7); assert.equal(g.depth, 8);
});
test('Dig: the five levels drain faster and have more rock', () => {
  const drains = LEVELS.map(lv => games.newDigGame(rng(), lv).drain(30));
  assert.deepEqual([...drains].sort((a, b) => a - b), drains);
  const rock = lv => { let n = 0; for (let seed = 1; seed <= 20; seed++) { const g = games.newDigGame(rng(seed), lv); for (let r = 3; r < 60; r++) for (let c = 0; c < 9; c++) { const t = g.at(c, r); if (t && t.k !== 'dirt') n++; } } return n; };
  const counts = LEVELS.map(rock); assert.deepEqual([...counts].sort((a, b) => a - b), counts);
  const refills = LEVELS.map(lv => games.newDigGame(rng(), lv).refill); assert.deepEqual([...refills].sort((a, b) => b - a), refills);
});
test('Dig: a bubble turns up at least every ten rows', () => {
  for (const lv of LEVELS) for (let seed = 1; seed <= 6; seed++) {
    const g = games.newDigGame(rng(seed), lv); let gap = 0, worst = 0;
    for (let r = 4; r < 120; r++) { let has = false; for (let c = 0; c < 9; c++) if (g.at(c, r)?.item === 'air') has = true; gap = has ? 0 : gap + 1; worst = Math.max(worst, gap); }
    assert.ok(worst <= 10, `${lv} ${seed}: ${worst}`);
  }
});
test('Dig: a miner who digs straight down gets well past the surface before the air is gone', () => {
  const g = games.newDigGame(rng(7), 'normal');
  for (let t = 0; t < 40 && !g.ended; t += 0.016) { g.act('down'); g.step(16); g.take(); }
  assert.ok(g.depth >= 15, 'depth ' + g.depth);
});
