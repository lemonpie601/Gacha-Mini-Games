/* Gacha Mini Games v1.0.1 — personal extension for Gacha Forge on Marinara Engine.
 * While a chapter or story is being generated, the generation screen gets a column of small games on its right:
 * 지뢰찾기, 사과 상자 (the fruit follows the 말랑 colour preset), 2048 and 짝 맞추기. Closing the column or
 * finishing generation removes them; nothing here touches the run, rewards or the generation request.
 * Split out of Gacha UI Style · 말랑 (1.12.0). Works on its own; with 말랑 on it takes 말랑's colours, preset and
 * SD sprites. Best records live in this browser only. */
(() => {
  "use strict";
  const KEY = "__GF_MINIGAMES_EXTENSION";
  if (typeof window[KEY] === "function") {
    try { window[KEY](); } catch {}
  }
  const HOST_TAG = "marinara-capability-gacha-forge";
  const MARINARA = typeof marinara !== "undefined" && marinara ? marinara : null;
  const life = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: life.signal });
  const el = (tag, cls = "", text = "") => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  let disposed = false;

  /* Loading games: local UI state only; never touch the run, rewards or generation request. */
  function newMineGame(random = Math.random, difficulty = "easy") {
    const [cols, mines] = ({ easy: [8, 10], normal: [10, 18], hard: [12, 30] })[difficulty] || [8, 10];
    const cells = Array.from({ length: cols * cols }, () => ({ mine: false, open: false, flag: false, count: 0 }));
    const game = { cells, cols, rows: cols, mines, started: false, ended: false, won: false, boom: -1 };
    const neighbours = (i) => cells.map((_, j) => j).filter((j) => j !== i && Math.abs(j % cols - i % cols) <= 1 && Math.abs(Math.floor(j / cols) - Math.floor(i / cols)) <= 1);
    game.neighbours = neighbours;
    game.flag = (i) => { if (!game.ended && !cells[i].open) cells[i].flag = !cells[i].flag; };
    game.reveal = (i) => {
      if (game.ended || cells[i].flag || cells[i].open) return;
      if (!game.started) {
        const safe = new Set([i, ...neighbours(i)]), pool = cells.map((_, j) => j).filter((j) => !safe.has(j));
        for (let k = 0; k < mines; k++) { const at = k + Math.floor(random() * (pool.length - k)); [pool[k], pool[at]] = [pool[at], pool[k]]; cells[pool[k]].mine = true; }
        cells.forEach((c, j) => c.count = neighbours(j).filter((n) => cells[n].mine).length);
        game.started = true;
      }
      if (cells[i].mine) { cells[i].open = true; game.ended = true; game.boom = i; return; }
      const queue = [i];
      while (queue.length) { const j = queue.pop(), c = cells[j]; if (c.open || c.flag || c.mine) continue; c.open = true; if (!c.count) queue.push(...neighbours(j)); }
      if (cells.filter((c) => c.open).length === cells.length - mines) { game.ended = true; game.won = true; }
    };
    // Pressing an opened number whose flags are all placed opens the rest around it (as in the classic game).
    game.chord = (i) => {
      const c = cells[i];
      if (game.ended || !c.open || !c.count) return;
      const around = neighbours(i);
      if (around.filter((j) => cells[j].flag).length !== c.count) return;
      for (const j of around) { game.reveal(j); if (game.ended) return; }
    };
    return game;
  }
  function newFruitGame(random = Math.random, difficulty = "normal") {
    const [cols, rows, max, time] = ({ easy: [8, 6, 5, 180], normal: [10, 8, 9, 120], hard: [12, 10, 9, 90] })[difficulty] || [10, 8, 9, 120];
    const game = { cols, rows, time, cells: Array.from({ length: cols * rows }, () => 1 + Math.floor(random() * max)), score: 0, ended: false };
    game.cells[0] = max === 5 ? 5 : 1; game.cells[1] = 10 - game.cells[0]; // Every new board has at least one legal selection.
    game.select = (a, b, remove = false) => {
      const x0 = Math.min(a % cols, b % cols), x1 = Math.max(a % cols, b % cols), y0 = Math.min(Math.floor(a / cols), Math.floor(b / cols)), y1 = Math.max(Math.floor(a / cols), Math.floor(b / cols));
      const ids = game.cells.map((_, i) => i).filter((i) => i % cols >= x0 && i % cols <= x1 && Math.floor(i / cols) >= y0 && Math.floor(i / cols) <= y1);
      const sum = ids.reduce((n, i) => n + game.cells[i], 0);
      if (remove && sum === 10 && !game.ended) { game.score += ids.filter((i) => game.cells[i]).length; ids.forEach((i) => game.cells[i] = 0); }
      return { ids, sum };
    };
    // A rectangle that still sums to 10 (for the hint, and to end a board with nothing left to clear).
    game.findMove = () => {
      const sum = (x0, y0, x1, y1) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += game.cells[y * cols + x]; return n; };
      for (let y0 = 0; y0 < rows; y0++) for (let x0 = 0; x0 < cols; x0++) for (let y1 = y0; y1 < rows; y1++) {
        if (sum(x0, y0, x0, y1) > 10) break;
        for (let x1 = x0; x1 < cols; x1++) { const s = sum(x0, y0, x1, y1); if (s === 10) return { a: y0 * cols + x0, b: y1 * cols + x1 }; if (s > 10) break; }
      }
      return null;
    };
    return game;
  }
  function new2048Game(random = Math.random, difficulty = "normal") {
    const [size, goal] = ({ easy: [5, 2048], normal: [4, 2048], hard: [3, 256] })[difficulty] || [4, 2048];
    const cells = Array(size * size).fill(0);
    const game = { size, cols: size, goal, cells, score: 0, ended: false, won: false, fresh: -1, merged: [] };
    const spawn = () => {
      const empty = cells.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
      if (!empty.length) { game.fresh = -1; return; }
      const i = empty[Math.floor(random() * empty.length)];
      cells[i] = random() < 0.9 ? 2 : 4; game.fresh = i;
    };
    // The cells of one row or column, listed from the side the tiles slide towards.
    const line = (k, dir) => Array.from({ length: size }, (_, i) => dir === "left" ? k * size + i : dir === "right" ? k * size + size - 1 - i : dir === "up" ? i * size + k : (size - 1 - i) * size + k);
    game.canMove = () => cells.some((v, i) => !v || (i % size < size - 1 && cells[i + 1] === v) || (i + size < cells.length && cells[i + size] === v));
    game.move = (dir) => {
      if (game.ended) return false;
      let moved = false; game.merged = [];
      for (let k = 0; k < size; k++) {
        const idx = line(k, dir), vals = idx.map((i) => cells[i]).filter(Boolean), out = [], merged = [];
        for (let j = 0; j < vals.length; j++) {
          if (j + 1 < vals.length && vals[j] === vals[j + 1]) { const v = vals[j] * 2; out.push(v); merged.push(out.length - 1); game.score += v; if (v >= goal) game.won = true; j++; }
          else out.push(vals[j]);
        }
        idx.forEach((i, p) => { const v = out[p] || 0; if (cells[i] !== v) moved = true; cells[i] = v; });
        game.merged.push(...merged.map((p) => idx[p]));
      }
      if (moved) spawn(); else game.fresh = -1;
      if (!game.canMove()) game.ended = true;
      return moved;
    };
    spawn(); spawn();
    return game;
  }
  const MEMORY_SYMBOLS = ["🍎", "🍋", "🍇", "🍓", "🍑", "🍒", "🥝", "🍍", "🍉", "🍊", "🫐", "🥥"];
  function newMemoryGame(random = Math.random, difficulty = "easy", faces = []) {
    const [cols, pairs] = ({ easy: [4, 6], normal: [4, 8], hard: [6, 12] })[difficulty] || [4, 6];
    const shuffle = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // The world's own SD characters are the cards; fruit fills in when there are fewer of them than pairs.
    const pool = [...shuffle([...new Set(faces)]).slice(0, pairs), ...MEMORY_SYMBOLS].slice(0, pairs);
    const cells = shuffle([...pool, ...pool]).map((face) => ({ face, open: false, done: false }));
    const game = { cols, rows: cells.length / cols, pairs, cells, moves: 0, ended: false, won: false };
    game.flip = (i) => {
      const c = cells[i];
      if (game.ended || c.open || c.done) return "ignored";
      const up = cells.map((x, j) => x.open && !x.done ? j : -1).filter((j) => j >= 0);
      if (up.length >= 2) return "busy";
      c.open = true;
      if (!up.length) return "open";
      game.moves++;
      const other = cells[up[0]];
      if (other.face !== c.face) return "miss";
      other.done = c.done = true;
      if (cells.every((x) => x.done)) game.ended = game.won = true;
      return "match";
    };
    game.hide = () => cells.forEach((x) => { if (x.open && !x.done) x.open = false; });
    return game;
  }
  function writingLoad(h) {
    if (!h) return false;
    // A story fetch/entry is not generation. The Forge screen also covers image generation after text is ready.
    const forge = h.shadowRoot?.querySelector?.('.forge-center');
    const visible = forge && !forge.closest('[hidden]') && forge.getClientRects().length > 0;
    const text = visible ? forge.textContent || '' : '';
    if (/(?:실패|오류|취소|failed|error|cancelled)/i.test(text)) return false;
    const working = /(?:생성\s*중|작성\s*중|그리는\s*중|generating|rendering|writing\b)/i.test(text);
    if (visible && /(?:완료|완성|completed|finished)/i.test(text) && !working) return false;
    // Fetching an existing chapter also uses _planState=loading. Only an explicit
    // generation-in-progress screen may offer games; labels/buttons are not evidence.
    return !!visible && working;
  }
  // Best records per game and level, kept in this browser only (a convenience; losing them loses nothing).
  const GAME_BEST_KEY = "gfx-games-best";
  function gameBest(key) { try { return (JSON.parse(localStorage.getItem(GAME_BEST_KEY) || "{}") || {})[key]; } catch { return undefined; } }
  function saveGameBest(key, value, lower) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(GAME_BEST_KEY) || "{}") || {}; } catch {}
    const old = all[key];
    if (old != null && (lower ? value >= old : value <= old)) return false;
    all[key] = value;
    try { localStorage.setItem(GAME_BEST_KEY, JSON.stringify(all)); } catch {}
    return true;
  }
  const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function makeLoadingGames(overlay) {
    const panel = el('section', 'gfx-load-games');
    panel.setAttribute('aria-label', '로딩 미니게임');
    const nav = el('div', 'gfx-game-nav'), content = el('div', 'gfx-game-content');
    const button = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; on(b, 'click', fn); return b; };
    // One picture per character of this world, for the memory cards.
    // The 말랑 extension shares its SD sprites when it is on; without it the cards are fruit.
    const faces = () => { try { return [...new Set(window.__GFX_SD_FACES?.() || [])].filter(Boolean); } catch { return []; } };
    const GAMES = {
      mines: { name: '지뢰찾기', icon: '💣', level: 'easy', levels: [['easy', '쉬움', '8×8 · 10개'], ['normal', '보통', '10×10 · 18개'], ['hard', '어려움', '12×12 · 30개']], make: (lv) => newMineGame(Math.random, lv) },
      fruits: { name: '사과 상자', icon: '🍎', level: 'normal', levels: [['easy', '쉬움', '3분 · 1~5'], ['normal', '보통', '2분 · 1~9'], ['hard', '어려움', '1분 30초']], make: (lv) => newFruitGame(Math.random, lv) },
      merge: { name: '2048', icon: '🔢', level: 'normal', levels: [['easy', '쉬움', '5×5'], ['normal', '보통', '4×4'], ['hard', '어려움', '3×3 · 256']], make: (lv) => new2048Game(Math.random, lv) },
      memory: { name: '짝 맞추기', icon: '🃏', level: 'easy', levels: [['easy', '쉬움', '6쌍'], ['normal', '보통', '8쌍'], ['hard', '어려움', '12쌍']], make: (lv) => newMemoryGame(Math.random, lv, faces()) },
    };
    const fresh = (which) => ({ game: GAMES[which].make(GAMES[which].level), level: GAMES[which].level, started: 0, stopped: 0, hints: 3, recorded: false, hideResult: false });
    const states = {};
    let mode = '', flagMode = false, anchor = null, pointer = null, moved = false, end = null, paintNow = null;
    const tabs = Object.entries(GAMES).map(([key, g]) => {
      const b = button('', () => show(key), 'gfx-game-tab');
      const icon = el('i', '', g.icon); icon.setAttribute('aria-hidden', 'true');
      b.append(icon, el('span', '', g.name)); b.dataset.game = key; b.setAttribute('aria-label', g.name); b.setAttribute('aria-pressed', 'false');
      return b;
    });
    const close = button('게임 접기', () => { mode = ''; paintNow = null; overlay.removeAttribute('data-game'); content.replaceChildren(); tabs.forEach((b) => b.setAttribute('aria-pressed', 'false')); }, 'gfx-game-util');
    const enlarge = button('크게 보기', () => { const big = overlay.toggleAttribute('data-game-large'); enlarge.textContent = big ? '기본 크기' : '크게 보기'; enlarge.setAttribute('aria-pressed', String(big)); }, 'gfx-game-util');
    const utils = el('div', 'gfx-game-utils');
    utils.append(enlarge, close);
    nav.append(...tabs, utils); panel.append(nav, content);
    // The 말랑 colour preset picks the box game's fruit and the minesweeper palette (custom colours: a dark ground
    // reads as 밤하늘, anything else as 크림).
    const GAME_THEMES = { cream: ['사과 상자', '🍎'], berry: ['딸기 상자', '🍓'], mint: ['청사과 상자', '🍏'], lavender: ['포도 상자', '🍇'], night: ['별 상자', '⭐'] };
    const themeNow = () => {
      try {
        // 말랑 marks its preset on the game element; a picked palette is judged by its ground colour.
        const preset = overlay.getRootNode?.()?.host?.getAttribute('data-gfx-preset') || '';
        if (GAME_THEMES[preset]) return preset;
        const ink = getComputedStyle(overlay).getPropertyValue('--gfx-ink').trim();
        const hex = /^#([0-9a-f]{6})$/i.exec(ink), rgb = /^rgba?\((\d+)\D+(\d+)\D+(\d+)/i.exec(ink);
        const [r, g, b] = hex ? [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4), 16)] : rgb ? rgb.slice(1).map(Number) : [255, 255, 255];
        if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.4) return 'night';
      } catch {}
      return 'cream';
    };
    const retheme = () => {
      const t = themeNow(), [name, icon] = GAME_THEMES[t], tab = tabs.find((b) => b.dataset.game === 'fruits');
      panel.dataset.theme = t; GAMES.fruits.name = name; GAMES.fruits.icon = icon;
      tab.setAttribute('aria-label', name); tab.querySelector('i').textContent = icon; tab.querySelector('span').textContent = name;
    };
    retheme();
    panel.retheme = retheme;
    for (const event of ['pointerdown', 'pointerup', 'click', 'dblclick', 'keydown', 'keyup']) on(panel, event, (e) => e.stopPropagation());
    // The clock: time-attack countdown and elapsed time. Stops by itself once the panel has been gone a while.
    let goneSince = 0;
    const tick = setInterval(() => {
      if (!panel.isConnected) { goneSince ||= performance.now(); if (performance.now() - goneSince > 60000) clearInterval(tick); return; }
      goneSince = 0;
      if (paintNow && !document.hidden) paintNow(true);
    }, 250);
    function show(next) {
      mode = next; anchor = null; pointer = null; overlay.setAttribute('data-game', mode); retheme();
      tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.game === mode)));
      const g = GAMES[mode], st = states[mode] ||= fresh(mode), game = st.game;
      content.replaceChildren();
      content.dataset.kind = mode;
      const head = el('div', 'gfx-game-head'), title = el('b', 'gfx-game-title'), stats = el('div', 'gfx-game-stats');
      const titleIcon = el('i', '', g.icon); titleIcon.setAttribute('aria-hidden', 'true');
      title.append(titleIcon, el('span', '', g.name));
      const tools = el('div', 'gfx-game-tools'), levels = el('div', 'gfx-game-levels');
      levels.setAttribute('role', 'radiogroup'); levels.setAttribute('aria-label', '난이도 (바꾸면 새 판)');
      for (const [value, label, detail] of g.levels) {
        const b = button(label, () => { if (st.level === value) return; g.level = value; states[mode] = fresh(mode); show(mode); });
        // One short word per level; the board size or time is in its tooltip and accessible name.
        b.title = detail; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(st.level === value)); b.setAttribute('aria-label', label + ' ' + detail);
        levels.append(b);
      }
      const renew = () => { states[mode] = fresh(mode); show(mode); };
      tools.append(levels, button('새 판', renew, 'gfx-game-new'));
      const info = el('div', 'gfx-game-info'), stage = el('div', 'gfx-game-stage'), board = el('div', 'gfx-game-board'), result = el('div', 'gfx-game-result');
      info.setAttribute('aria-live', 'polite'); result.hidden = true;
      on(result, 'click', (e) => { if (e.target === result) { st.hideResult = true; result.hidden = true; } });
      stage.append(board, result);
      // Title, level, new game (and the game's own tool) and the counters share one compact row.
      head.append(title, tools, stats);
      content.append(head, info, stage);
      const best = () => gameBest(mode + '-' + st.level);
      const begin = () => { if (!st.started) st.started = performance.now(); };
      const elapsed = () => st.started ? (st.stopped || performance.now()) - st.started : 0;
      const finish = (lower, value) => {
        if (st.stopped) return;
        st.stopped = performance.now();
        if (value != null && !st.recorded) { st.recorded = true; st.newBest = saveGameBest(mode + '-' + st.level, value, lower); }
      };
      const chips = (list) => stats.replaceChildren(...list.filter(Boolean).map(([text, alert]) => { const s = el('span', '', text); if (alert) s.dataset.alert = ''; return s; }));
      const showResult = (headline, line) => {
        if (st.hideResult) { result.hidden = true; return; }
        if (!result.hidden && result.dataset.headline === headline) return;
        const card = el('div'), again = button('다시 하기', renew, 'gfx-game-again');
        card.append(el('b', '', headline), el('span', '', line));
        if (st.newBest) card.append(el('em', '', '최고 기록!'));
        card.append(again);
        result.dataset.headline = headline; result.replaceChildren(card); result.hidden = false;
      };
      board.style.setProperty('--cols', String(game.cols));
      // The board's shape, for its size: the fruit box is wide, the memory cards are 3:4.
      board.style.setProperty('--fit', String(mode === 'fruits' ? game.cols / game.rows : mode === 'memory' ? game.cols * 3 / (game.rows * 4) : 1));
      board.dataset.kind = mode;
      let paint = () => {};

      if (mode === 'mines') {
        const flags = button('깃발 모드', () => { flagMode = !flagMode; flags.setAttribute('aria-pressed', String(flagMode)); }, 'gfx-game-flag');
        flags.setAttribute('aria-pressed', String(flagMode)); tools.append(flags);
        let held = null, heldFired = false;
        const buttons = game.cells.map((_, i) => {
          const b = button('', () => {
            if (heldFired) { heldFired = false; return; }
            const c = game.cells[i];
            if (c.open) game.chord(i);
            else if (flagMode) game.flag(i);
            else { begin(); game.reveal(i); }
            paint();
          });
          b.dataset.cell = String(i); board.append(b);
          on(b, 'contextmenu', (e) => { e.preventDefault(); game.flag(i); paint(); });
          // Touch: press and hold to place a flag.
          on(b, 'pointerdown', (e) => { if (e.pointerType !== 'touch') return; clearTimeout(held); heldFired = false; held = setTimeout(() => { if (!game.cells[i].open) { game.flag(i); heldFired = true; navigator.vibrate?.(15); paint(); } }, 430); });
          for (const t of ['pointerup', 'pointercancel', 'pointerleave']) on(b, t, () => clearTimeout(held));
          return b;
        });
        paint = (clockOnly) => {
          const flags = game.cells.filter((c) => c.flag).length, b0 = best();
          chips([['💣 ' + Math.max(0, game.mines - flags)], ['⏱ ' + clock(elapsed())], b0 != null && ['🏆 ' + clock(b0 * 1000)]]);
          if (clockOnly) return;
          if (game.ended) finish(true, game.won ? Math.round(elapsed() / 1000) : null);
          info.textContent = game.ended ? (game.won ? '성공! 지뢰를 모두 피했어요.' : '펑! 지뢰를 밟았어요.') : !game.started ? '첫 칸은 언제나 안전해요 · 우클릭/길게 눌러 깃발' : '숫자를 누르면 깃발 수가 맞을 때 주변이 한 번에 열려요';
          buttons.forEach((b, i) => {
            const c = game.cells[i], showMine = c.mine && game.ended && !c.flag;
            b.textContent = c.flag ? '깃발' : c.open && !c.mine ? (c.count || '') : '';
            b.dataset.open = String(c.open); b.dataset.flag = String(c.flag); b.dataset.n = c.open && !c.mine ? String(c.count) : '';
            b.dataset.mine = String(showMine); b.dataset.boom = String(i === game.boom); b.dataset.wrong = String(game.ended && !game.won && c.flag && !c.mine);
            b.disabled = game.ended;
            b.setAttribute('aria-label', (i + 1) + '번 칸 ' + (c.flag ? '깃발' : c.open ? (c.mine ? '지뢰' : '주변 지뢰 ' + c.count) : '닫힘'));
          });
          if (game.ended) showResult(game.won ? '클리어!' : '게임 오버', game.won ? '기록 ' + clock(elapsed()) : '새 판으로 다시 도전해 보세요');
        };
      }

      if (mode === 'fruits') {
        let hintIds = [], hintTimer = 0;
        const hint = button('힌트', () => {
          if (game.ended || st.hints <= 0) return;
          const m = game.findMove(); if (!m) return;
          st.hints--; hintIds = game.select(m.a, m.b).ids; clearTimeout(hintTimer);
          hintTimer = setTimeout(() => { hintIds = []; paint(); }, 1600); paint();
        }, 'gfx-game-hint');
        tools.append(hint);
        const buttons = game.cells.map((_, i) => {
          const b = button('', () => {
            // Keyboard and assistive-technology activation uses the same two-corner selection.
            if (pointer !== null || game.ended) return;
            begin();
            if (anchor === null) anchor = i; else { game.select(anchor, i, true); anchor = null; }
            paint();
          });
          b.dataset.cell = String(i); board.append(b);
          return b;
        });
        // The dragged rectangle, drawn as one thick box round the cells with the running sum on its corner:
        // tinting each apple alone was hard to see.
        const frame = el('div', 'gfx-fruit-frame'), frameSum = el('b');
        frame.setAttribute('aria-hidden', 'true'); frame.hidden = true; frame.append(frameSum); board.append(frame);
        const placeFrame = (selected) => {
          if (!selected || game.ended) { frame.hidden = true; return; }
          const first = buttons[Math.min(...selected.ids)], last = buttons[Math.max(...selected.ids)];
          frame.style.left = first.offsetLeft + 'px'; frame.style.top = first.offsetTop + 'px';
          frame.style.width = (last.offsetLeft + last.offsetWidth - first.offsetLeft) + 'px';
          frame.style.height = (last.offsetTop + last.offsetHeight - first.offsetTop) + 'px';
          frame.dataset.state = selected.sum === 10 ? 'ok' : selected.sum > 10 ? 'over' : '';
          frameSum.textContent = String(selected.sum); frame.hidden = false;
        };
        const left = () => game.time * 1000 - elapsed();
        paint = (clockOnly, selection = null) => {
          if (!game.ended && st.started && left() <= 0) { game.ended = true; anchor = null; }
          const b0 = best(), remain = st.started ? left() : game.time * 1000;
          chips([[g.icon + ' ' + game.score + '점'], ['⏱ ' + clock(remain), st.started && !game.ended && remain < 15000], b0 != null && ['🏆 ' + b0 + '점']]);
          hint.textContent = '힌트 ' + st.hints; hint.disabled = game.ended || st.hints <= 0;
          if (clockOnly && (!game.ended || st.endPainted)) return;
          // Only after a move, not on every drag step: the search is the costly part.
          if (!game.ended && st.started && !selection && !game.findMove()) game.ended = true;
          st.endPainted = game.ended;
          if (game.ended) finish(false, game.score);
          const selected = selection || (anchor !== null ? game.select(anchor, anchor) : null);
          info.replaceChildren(document.createTextNode('점수 ' + game.score + ' · '));
          if (game.ended) info.append(left() <= 0 ? '시간 종료!' : '더 지울 수 있는 사과가 없어요');
          else if (selected) { const s = el('b', '', '선택 합계 ' + selected.sum); if (selected.sum === 10) s.dataset.ok = ''; else if (selected.sum > 10) s.dataset.over = ''; info.append(s); }
          else info.append(st.started ? '합이 10이 되게 사각형으로 묶으세요' : '합이 10이 되게 드래그하세요 · 첫 선택부터 시간이 흘러요');
          buttons.forEach((b, i) => {
            const v = game.cells[i];
            b.replaceChildren(); if (v) b.append(el('span', '', String(v)));
            b.dataset.empty = String(!v); b.dataset.selected = String(!!selected?.ids.includes(i)); b.dataset.hint = String(hintIds.includes(i));
            b.dataset.ok = String(!!selected && selected.sum === 10);
            b.disabled = game.ended;
            b.setAttribute('aria-label', (i + 1) + '번 사과 ' + v);
          });
          placeFrame(selected);
          if (game.ended) showResult(left() <= 0 ? '시간 종료!' : '상자 정리 끝!', '사과 ' + game.score + '개를 지웠어요');
        };
        // Measured from the first and last cell, not the board box: the board's padding put a drag one row off.
        const cellAt = (e) => {
          const r0 = buttons[0].getBoundingClientRect(), r1 = buttons.at(-1).getBoundingClientRect();
          if (e.clientX < r0.left || e.clientX >= r1.right || e.clientY < r0.top || e.clientY >= r1.bottom) return null;
          const x = Math.floor((e.clientX - r0.left) / (r1.right - r0.left) * game.cols), y = Math.floor((e.clientY - r0.top) / (r1.bottom - r0.top) * game.rows);
          return Math.min(game.rows - 1, Math.max(0, y)) * game.cols + Math.min(game.cols - 1, Math.max(0, x));
        };
        on(board, 'pointerdown', (e) => { if (e.button !== 0 || pointer !== null || game.ended) return; const i = cellAt(e); if (i === null) return; e.preventDefault(); begin(); pointer = e.pointerId; moved = false; end = i; if (anchor === null) anchor = i; board.setPointerCapture(e.pointerId); paint(false, game.select(anchor, i)); });
        on(board, 'pointermove', (e) => { if (pointer !== e.pointerId) return; const i = cellAt(e); if (i !== null) { moved ||= i !== end; end = i; paint(false, game.select(anchor, end)); } });
        on(board, 'pointerup', (e) => { if (pointer !== e.pointerId) return; e.preventDefault(); if (moved || end !== anchor) { game.select(anchor, end, true); anchor = null; } pointer = null; board.releasePointerCapture(e.pointerId); paint(); });
        on(board, 'pointercancel', () => { pointer = null; anchor = null; paint(); });
        // Pointer input is handled above; prevent its synthetic click from selecting twice.
        on(board, 'click', (e) => { if (e.detail) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });
      }

      if (mode === 'merge') {
        board.tabIndex = 0; board.setAttribute('role', 'application'); board.setAttribute('aria-label', '2048 판 · 방향키나 스와이프로 밀기');
        const tiles = game.cells.map((_, i) => { const t = el('div'); t.dataset.cell = String(i); board.append(t); return t; });
        const pad = el('div', 'gfx-game-pad');
        const push = (dir) => { if (game.ended) return; begin(); if (game.move(dir)) paint(); board.focus({ preventScroll: true }); };
        for (const [dir, label, arrow] of [['up', '위로', '▲'], ['left', '왼쪽으로', '◀'], ['down', '아래로', '▼'], ['right', '오른쪽으로', '▶']]) { const b = button(arrow, () => push(dir)); b.setAttribute('aria-label', label); b.dataset.dir = dir; pad.append(b); }
        stage.append(pad);
        const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
        on(board, 'keydown', (e) => { const dir = KEYS[e.key]; if (!dir) return; e.preventDefault(); push(dir); });
        let from = null;
        on(board, 'pointerdown', (e) => { from = [e.clientX, e.clientY, e.pointerId]; board.setPointerCapture?.(e.pointerId); });
        on(board, 'pointerup', (e) => {
          if (!from || from[2] !== e.pointerId) return;
          const dx = e.clientX - from[0], dy = e.clientY - from[1]; from = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { board.focus({ preventScroll: true }); return; }
          push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        });
        on(board, 'pointercancel', () => { from = null; });
        let shownWin = false;
        paint = (clockOnly) => {
          const b0 = best(), top = Math.max(...game.cells);
          chips([['⭐ ' + game.score], ['🔝 ' + top], b0 != null && ['🏆 ' + b0]]);
          if (clockOnly) return;
          if (game.ended) finish(false, game.score);
          info.textContent = game.ended ? '더 움직일 수 없어요.' : game.won ? game.goal + ' 달성! 계속 더 높이 올라가 보세요.' : '같은 숫자끼리 밀어서 합치세요 · 목표 ' + game.goal + ' · 방향키·스와이프';
          tiles.forEach((t, i) => {
            const v = game.cells[i];
            t.textContent = v || ''; t.dataset.v = String(v); t.dataset.d = String(String(v).length);
            t.toggleAttribute('data-new', i === game.fresh); t.toggleAttribute('data-merged', game.merged.includes(i));
          });
          if (game.ended) showResult('게임 끝', '점수 ' + game.score + ' · 최고 타일 ' + top);
          else if (game.won && !shownWin && !st.shownWin) { shownWin = st.shownWin = true; info.textContent = '🎉 ' + game.goal + ' 달성! 계속할 수 있어요.'; }
        };
      }

      if (mode === 'memory') {
        let busy = 0;
        const buttons = game.cells.map((c, i) => {
          const b = button('', () => {
            if (busy) return;
            begin();
            const r = game.flip(i);
            if (r === 'miss') { busy = setTimeout(() => { busy = 0; game.hide(); paint(); }, 800); }
            paint();
          });
          b.dataset.cell = String(i); board.append(b);
          const face = el('span', 'face');
          if (/^(blob:|https?:|\/|data:)/.test(c.face)) { const img = typeof heroNode === 'function' ? heroNode(c.face) : Object.assign(el('img'), { src: c.face, alt: '' }); face.append(img); }
          else face.append(el('i', '', c.face));
          b.append(face, el('span', 'back'));
          return b;
        });
        paint = (clockOnly) => {
          const b0 = best(), found = game.cells.filter((c) => c.done).length / 2;
          chips([['🃏 ' + found + '/' + game.pairs], ['🔁 ' + game.moves + '번'], ['⏱ ' + clock(elapsed())], b0 != null && ['🏆 ' + b0 + '번']]);
          if (clockOnly) return;
          if (game.ended) finish(true, game.moves);
          info.textContent = game.ended ? '모두 찾았어요!' : '같은 그림 두 장을 찾아 뒤집으세요';
          buttons.forEach((b, i) => { const c = game.cells[i]; b.dataset.open = String(c.open); b.dataset.done = String(c.done); b.setAttribute('aria-label', (i + 1) + '번 카드 ' + (c.open ? '앞면' : '뒷면')); });
          if (game.ended) showResult('완성!', game.moves + '번 만에 ' + clock(elapsed()));
        };
      }
      paintNow = (clockOnly) => { if (!content.contains(board)) return; paint(clockOnly); };
      paint();
      if (mode === 'merge') board.focus({ preventScroll: true });
    }
    return panel;
  }


  const CSS = "/* Buttons: the 말랑 capsule that presses down. */\n.gfx-load-games button { font:inherit; color:var(--gfx-text, #5A3A24); background:var(--gfx-card, #FFFDF5); border:2.5px solid var(--gfx-line, #6B4528); border-radius:999px; padding:.42em .95em; cursor:pointer;\n  box-shadow:0 3px 0 var(--gfx-line, #6B4528); transition:translate .1s ease, box-shadow .1s ease, background .15s ease; }\n.gfx-load-games button:hover:not(:disabled) { background:color-mix(in srgb,var(--gfx-pick, #FFE17A) 45%,var(--gfx-card, #FFFDF5)); }\n.gfx-load-games button:active:not(:disabled) { translate:0 2px; box-shadow:0 1px 0 var(--gfx-line, #6B4528); }\n.gfx-load-games button:disabled { cursor:default; }\n.gfx-load-games button[aria-pressed=\"true\"] { background:var(--gfx-pick, #FFE17A); }\n.gfx-load-games button:focus-visible, .gfx-game-board:focus-visible { outline:3px solid var(--gfx-accent, #F0763A); outline-offset:2px; }\n/* The game shelf: one card per game. */\n.gfx-game-nav { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:8px; margin-bottom:10px; padding:8px; border:3px solid var(--gfx-line, #6B4528); border-radius:22px;\n  background:color-mix(in srgb,var(--gfx-card, #FFFDF5) 94%,transparent); box-shadow:0 4px 0 var(--gfx-line, #6B4528); }\n.gfx-game-tab { display:flex; flex-direction:column; align-items:center; gap:1px; border-radius:16px !important; padding:.4em .75em !important; min-width:5.4em; }\n.gfx-game-tab i { font-style:normal; font-size:1.7em; line-height:1.15; }\n.gfx-game-tab span { font-size:.9em; white-space:nowrap; }\n.gfx-game-tab[aria-pressed=\"true\"] { background:var(--gfx-accent, #F0763A) !important; color:#fff !important; }\n.gfx-game-utils { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }\n.gfx-game-util { font-size:.82em !important; padding:.35em .8em !important; box-shadow:0 2px 0 var(--gfx-line, #6B4528) !important; }\n/* The game card. */\n.gfx-game-content:empty { display:none; }\n.gfx-game-content { background:var(--gfx-card, #FFFDF5); border:3px solid var(--gfx-line, #6B4528); border-radius:22px; padding:12px 14px 14px; box-shadow:0 5px 0 var(--gfx-line, #6B4528); }\n.gfx-game-head { display:flex; align-items:center; justify-content:space-between; gap:6px 10px; flex-wrap:wrap; margin-bottom:6px; }\n.gfx-game-title { display:flex; align-items:center; gap:.3em; font-size:1.12em; font-weight:normal; white-space:nowrap; }\n.gfx-game-title i { font-style:normal; }\n.gfx-game-stats { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }\n.gfx-game-stats { font-size:.86em; }\n.gfx-game-stats span { padding:.1em .6em; border-radius:999px; background:var(--gfx-ink, #FFF4D9); border:2px solid color-mix(in srgb,var(--gfx-line, #6B4528) 35%,transparent); font-variant-numeric:tabular-nums; white-space:nowrap; }\n.gfx-game-stats span[data-alert] { background:#FFD9D4; color:#A1281C; border-color:#E0786B; animation:gfx-game-blink .8s ease-in-out infinite; }\n@keyframes gfx-game-blink { 50% { opacity:.55; } }\n/* Level, new game and the game tool: one small row inside the header. */\n.gfx-game-tools { flex:1 1 auto; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:5px; font-size:.82em; }\n.gfx-game-tools > button { padding:.2em .75em; border-width:2px; box-shadow:0 2px 0 var(--gfx-line, #6B4528); }\n.gfx-game-levels { display:inline-flex; gap:2px; padding:2px; border:2px solid var(--gfx-line, #6B4528); border-radius:999px; background:var(--gfx-ink, #FFF4D9); }\n.gfx-game-levels button { line-height:1.2; padding:.16em .7em; border:0; background:transparent; box-shadow:none; }\n.gfx-game-levels button:active:not(:disabled) { translate:none; box-shadow:none; }\n.gfx-game-levels button[aria-checked=\"true\"] { background:var(--gfx-accent, #F0763A); color:#fff; }\n.gfx-game-new { background:var(--gfx-pick, #FFE17A) !important; }\n.gfx-game-flag[aria-pressed=\"true\"] { background:#FFD9D4 !important; }\n.gfx-game-info { min-height:1.5em; text-align:center; margin-bottom:8px; font-size:.95em; }\n.gfx-game-info b { font-weight:normal; padding:0 .4em; border-radius:999px; background:var(--gfx-ink, #FFF4D9); }\n.gfx-game-info b[data-ok] { background:#C9F0D6; color:#1C7A43; }\n.gfx-game-info b[data-over] { background:#FFD9D4; color:#A1281C; }\n/* The board: square cells sized from the board's own width. */\n.gfx-game-stage { position:relative; }\n.gfx-game-board { display:grid; grid-template-columns:repeat(var(--cols),minmax(0,1fr)); gap:4px; width:min(100%, max(170px, var(--room) * var(--fit, 1))); margin:auto; padding:6px; box-sizing:border-box;\n  border-radius:16px; background:color-mix(in srgb,var(--gfx-line, #6B4528) 16%,var(--gfx-ink, #FFF4D9)); touch-action:none; user-select:none; -webkit-user-select:none; container-type:inline-size; }\n.gfx-game-board > * { position:relative; aspect-ratio:1; min-width:0; min-height:0; padding:0 !important; display:grid; place-items:center; border-radius:9px !important; box-sizing:border-box;\n  font-size:calc(100cqw / var(--cols) * .46); line-height:1; }\n/* 지뢰찾기 */\n.gfx-game-board[data-kind=\"mines\"] > button { background:var(--gfx-pick, #FFE17A); border-width:2px; box-shadow:0 2px 0 var(--gfx-line, #6B4528); }\n.gfx-game-board[data-kind=\"mines\"] > button[data-open=\"true\"] { background:var(--gfx-card, #FFFDF5); border-color:color-mix(in srgb,var(--gfx-line, #6B4528) 25%,transparent); box-shadow:none; translate:none; }\n.gfx-game-board > button[data-mine=\"true\"]::before { content:\"\"; width:52%; aspect-ratio:1; border-radius:50%; background:#262626;\n  box-shadow:0 0 0 .12em #1f1f1f, 0 -.28em 0 -.16em #1f1f1f, 0 .28em 0 -.16em #1f1f1f, .28em 0 0 -.16em #1f1f1f, -.28em 0 0 -.16em #1f1f1f; }\n.gfx-game-board > button[data-boom=\"true\"] { background:#FF6B5E !important; animation:gfx-game-shake .35s ease; }\n.gfx-game-board > button[data-wrong=\"true\"] { opacity:.45; }\n@keyframes gfx-game-shake { 25% { translate:-3px 0; } 75% { translate:3px 0; } }\n.gfx-game-board button[data-flag=\"true\"] { font-size:0 !important; background:var(--gfx-card, #FFFDF5); }\n.gfx-game-board button[data-flag=\"true\"]::before { content:\"\"; position:absolute; left:34%; top:18%; height:62%; border-left:3px solid #432e23; }\n.gfx-game-board button[data-flag=\"true\"]::after { content:\"\"; position:absolute; left:calc(34% + 3px); top:18%; width:42%; height:36%; background:#e13f35; clip-path:polygon(0 0,100% 25%,0 100%); }\n/* 사과 상자 */\n.gfx-game-board[data-kind=\"fruits\"] { gap:2px; position:relative; }\n.gfx-game-board > .gfx-fruit-frame { position:absolute; z-index:2; aspect-ratio:auto; display:block; pointer-events:none; box-sizing:border-box; border-radius:14px !important;\n  border:4px solid var(--gfx-accent, #F0763A); background:color-mix(in srgb,var(--gfx-accent, #F0763A) 22%,transparent); box-shadow:0 0 0 2px #fff, 0 0 14px color-mix(in srgb,var(--gfx-accent, #F0763A) 70%,transparent);\n  transition:left .06s linear, top .06s linear, width .06s linear, height .06s linear; }\n.gfx-game-board > .gfx-fruit-frame[hidden] { display:none; }\n.gfx-game-board > .gfx-fruit-frame b { position:absolute; bottom:calc(100% + 3px); left:-4px; min-width:1.4em; padding:.05em .45em; border-radius:999px; text-align:center; font-weight:normal;\n  font-size:clamp(13px, calc(100cqw / var(--cols) * .38), 22px); line-height:1.3; color:#fff; background:var(--gfx-accent, #F0763A); border:2.5px solid var(--gfx-line, #6B4528); box-shadow:0 2px 0 var(--gfx-line, #6B4528); }\n.gfx-game-board > .gfx-fruit-frame[data-state=\"ok\"] { border-color:#2FA95E; background:color-mix(in srgb,#2FA95E 26%,transparent); box-shadow:0 0 0 2px #fff, 0 0 16px #2FA95EAA; }\n.gfx-game-board > .gfx-fruit-frame[data-state=\"ok\"] b { background:#2FA95E; }\n.gfx-game-board > .gfx-fruit-frame[data-state=\"over\"] { border-color:#E0483C; background:color-mix(in srgb,#E0483C 16%,transparent); box-shadow:0 0 0 2px #fff; }\n.gfx-game-board > .gfx-fruit-frame[data-state=\"over\"] b { background:#E0483C; }\n/* A sticker-outlined apple (stem, leaf, shine) drawn once as an SVG; the number sits on its belly. */\n.gfx-game-board[data-kind=\"fruits\"] > button, .gfx-game-board[data-kind=\"fruits\"] > button:active:not(:disabled) { background:transparent; border:0; box-shadow:none; translate:none; border-radius:28% !important; transition:background .12s ease; }\n.gfx-game-board[data-kind=\"fruits\"] > button::before { content:\"\"; position:absolute; inset:2%; background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='93' rx='26' ry='4' fill='%236B4528' opacity='.18'/%3E%3Cpath d='M50 31C40 22 16 22 13 47 10 72 29 92 42 91c3-.3 5-1.4 8-1.4s5 1.1 8 1.4c13 1 32-19 29-44C84 22 60 22 50 31Z' fill='%23EF4B3F' stroke='%236B2318' stroke-width='3.5' stroke-linejoin='round'/%3E%3Cpath d='M27 40c-4 6-5 13-3 19' fill='none' stroke='%23fff' stroke-width='5' stroke-linecap='round' opacity='.55'/%3E%3Ccircle cx='31' cy='34' r='3' fill='%23fff' opacity='.6'/%3E%3Cpath d='M50 31c0-7 1-13 4-18' fill='none' stroke='%236B4528' stroke-width='4.5' stroke-linecap='round'/%3E%3Cpath d='M54 18c6-9 19-10 26-5-5 9-17 11-26 5Z' fill='%237ED36A' stroke='%233E7A33' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M57 17c6-2 12-3 18-3' fill='none' stroke='%233E7A33' stroke-width='1.8' stroke-linecap='round' opacity='.7'/%3E%3C/svg%3E\") center / contain no-repeat; transition:scale .14s cubic-bezier(.3,1.6,.5,1), filter .12s ease; }\n.gfx-game-board[data-kind=\"fruits\"] > button span { position:relative; z-index:1; margin-top:22%; color:#fff; font-size:calc(100cqw / var(--cols) * .36); letter-spacing:0;\n  -webkit-text-stroke:.16em #6B2318; paint-order:stroke fill; }\n.gfx-game-board[data-kind=\"fruits\"] > button[data-empty=\"true\"]::before { display:none; }\n.gfx-game-board[data-kind=\"fruits\"] > button[data-selected=\"true\"]::before { scale:1.1; filter:brightness(1.08); }\n.gfx-game-board[data-kind=\"fruits\"] > button[data-hint=\"true\"] { background:color-mix(in srgb,#FFD84D 55%,transparent); }\n.gfx-game-board[data-kind=\"fruits\"] > button[data-hint=\"true\"]::before { animation:gfx-game-hint .5s ease-in-out infinite alternate; }\n@keyframes gfx-game-hint { to { scale:1.12; } }\n/* 2048 */\n.gfx-game-board[data-kind=\"merge\"] { gap:6px; padding:8px; }\n.gfx-game-board[data-kind=\"merge\"] > div { background:color-mix(in srgb,var(--gfx-card, #FFFDF5) 60%,transparent); color:#5A3A24; font-size:calc(100cqw / var(--cols) * .36); }\n.gfx-game-board[data-kind=\"merge\"] > div[data-d=\"3\"] { font-size:calc(100cqw / var(--cols) * .3); } .gfx-game-board[data-kind=\"merge\"] > div[data-d=\"4\"] { font-size:calc(100cqw / var(--cols) * .24); }\n.gfx-game-board[data-kind=\"merge\"] > div[data-d=\"5\"] { font-size:calc(100cqw / var(--cols) * .2); }\n.gfx-game-board[data-kind=\"merge\"] > div:not([data-v=\"0\"]) { border:2px solid var(--gfx-line, #6B4528); box-shadow:0 3px 0 var(--gfx-line, #6B4528); }\n.gfx-game-board > div[data-v=\"2\"] { background:#FFF6DF; } .gfx-game-board > div[data-v=\"4\"] { background:#FFE7AE; } .gfx-game-board > div[data-v=\"8\"] { background:#FFC27A; color:#fff; }\n.gfx-game-board > div[data-v=\"16\"] { background:#FF9F68; color:#fff; } .gfx-game-board > div[data-v=\"32\"] { background:#FF7F6E; color:#fff; } .gfx-game-board > div[data-v=\"64\"] { background:#F25C5C; color:#fff; }\n.gfx-game-board > div[data-v=\"128\"] { background:#FFD84D; color:#fff; } .gfx-game-board > div[data-v=\"256\"] { background:#FFC933; color:#fff; } .gfx-game-board > div[data-v=\"512\"] { background:#FFB81C; color:#fff; }\n.gfx-game-board > div[data-v=\"1024\"] { background:#8FD16B; color:#fff; } .gfx-game-board > div[data-v=\"2048\"] { background:#4FC1A0; color:#fff; }\n.gfx-game-board[data-kind=\"merge\"] > div:not([data-v=\"0\"]):is([data-v^=\"4096\"],[data-v^=\"8192\"],[data-v^=\"16384\"],[data-v^=\"32768\"],[data-v^=\"65536\"]) { background:#8C6CF0; color:#fff; }\n.gfx-game-board[data-kind=\"merge\"] > div:is([data-v=\"8\"],[data-v=\"16\"],[data-v=\"32\"],[data-v=\"64\"],[data-v=\"128\"],[data-v=\"256\"],[data-v=\"512\"],[data-v=\"1024\"],[data-v=\"2048\"]) { text-shadow:0 .05em 0 #0003; }\n.gfx-game-board > div[data-new] { animation:gfx-tile-in .18s ease both; }\n.gfx-game-board > div[data-merged] { animation:gfx-tile-pop .2s ease both; }\n@keyframes gfx-tile-in { from { scale:.3; opacity:0; } }\n@keyframes gfx-tile-pop { 50% { scale:1.14; } }\n.gfx-game-pad { position:absolute; right:0; bottom:0; display:grid; grid-template-columns:repeat(3,2.4em); grid-template-areas:\". up .\" \"left down right\"; gap:4px; }\n.gfx-game-pad button { padding:.25em 0 !important; border-radius:12px !important; }\n.gfx-game-pad [data-dir=\"up\"] { grid-area:up; } .gfx-game-pad [data-dir=\"left\"] { grid-area:left; } .gfx-game-pad [data-dir=\"down\"] { grid-area:down; } .gfx-game-pad [data-dir=\"right\"] { grid-area:right; }\n@media (pointer:coarse) { .gfx-game-pad { display:none; } }\n/* 짝 맞추기 */\n.gfx-game-board[data-kind=\"memory\"] { gap:6px; }\n.gfx-game-board[data-kind=\"memory\"] > button { aspect-ratio:3 / 4; border-radius:12px !important; overflow:hidden; background:var(--gfx-card, #FFFDF5); border-width:2.5px; box-shadow:0 3px 0 var(--gfx-line, #6B4528); }\n.gfx-game-board[data-kind=\"memory\"] > button > span { position:absolute; inset:0; display:grid; place-items:center; transition:opacity .18s ease, scale .22s cubic-bezier(.3,1.5,.5,1); }\n.gfx-game-board[data-kind=\"memory\"] > button > .back { background:var(--gfx-accent, #F0763A); box-shadow:inset 0 0 0 .3em color-mix(in srgb,#fff 35%,var(--gfx-accent, #F0763A)); }\n.gfx-game-board[data-kind=\"memory\"] > button > .face { opacity:0; scale:.6; padding:6%; box-sizing:border-box; }\n.gfx-game-board[data-kind=\"memory\"] > button > .face img { width:100%; height:100%; object-fit:contain; object-position:50% 100%; }\n.gfx-game-board[data-kind=\"memory\"] > button > .face i { font-style:normal; font-size:calc(100cqw / var(--cols) * .5); }\n.gfx-game-board[data-kind=\"memory\"] > button[data-open=\"true\"] > .face { opacity:1; scale:1; }\n.gfx-game-board[data-kind=\"memory\"] > button[data-open=\"true\"] > .back { opacity:0; scale:.6; }\n.gfx-game-board[data-kind=\"memory\"] > button[data-done=\"true\"] { background:color-mix(in srgb,#C9F0D6 70%,var(--gfx-card, #FFFDF5)); border-color:#2FA95E; box-shadow:0 3px 0 #2FA95E; }\n/* Theme pieces: the box game's fruit and the minesweeper board follow the chosen 말랑 colour preset. */\n.gfx-load-games[data-theme=\"berry\"] .gfx-game-board[data-kind=\"fruits\"] > button::before { background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='93' rx='26' ry='4' fill='%233A2A20' opacity='.18'/%3E%3Cpath d='M50 93C31 86 12 64 14 43 16 28 31 25 50 30 69 25 84 28 86 43 88 64 69 86 50 93Z' fill='%23F0456A' stroke='%237A1E33' stroke-width='3.5' stroke-linejoin='round'/%3E%3Cellipse cx='28' cy='48' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='42' cy='44' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='58' cy='44' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='72' cy='48' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='24' cy='62' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='38' cy='60' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='52' cy='62' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='66' cy='60' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='78' cy='62' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='34' cy='74' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='48' cy='76' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='62' cy='74' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='44' cy='86' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cellipse cx='56' cy='86' rx='1.6' ry='2.4' fill='%23FFE58A'/%3E%3Cpath d='M27 46c-3 5-3 11-1 16' fill='none' stroke='%23fff' stroke-width='4.5' stroke-linecap='round' opacity='.55'/%3E%3Cpath d='M50 34 40 38 30 33 38 27 32 19 44 22 50 13 56 22 68 19 62 27 70 33 60 38Z' fill='%236CC25E' stroke='%232F6E2A' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M50 22c0-5 1-9 3-12' fill='none' stroke='%232F6E2A' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E\"); }\n.gfx-load-games[data-theme=\"berry\"] .gfx-game-board[data-kind=\"fruits\"] > button span { -webkit-text-stroke-color:#7A1E33; }\n.gfx-load-games[data-theme=\"mint\"] .gfx-game-board[data-kind=\"fruits\"] > button::before { background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='93' rx='26' ry='4' fill='%233A2A20' opacity='.18'/%3E%3Cpath d='M50 31C40 22 16 22 13 47 10 72 29 92 42 91c3-.3 5-1.4 8-1.4s5 1.1 8 1.4c13 1 32-19 29-44C84 22 60 22 50 31Z' fill='%238ACF4E' stroke='%232F5E1C' stroke-width='3.5' stroke-linejoin='round'/%3E%3Cpath d='M27 40c-4 6-5 13-3 19' fill='none' stroke='%23fff' stroke-width='5' stroke-linecap='round' opacity='.6'/%3E%3Ccircle cx='31' cy='34' r='3' fill='%23fff' opacity='.65'/%3E%3Cpath d='M50 31c0-7 1-13 4-18' fill='none' stroke='%236B4528' stroke-width='4.5' stroke-linecap='round'/%3E%3Cpath d='M54 18c6-9 19-10 26-5-5 9-17 11-26 5Z' fill='%233FA56B' stroke='%231F5E3A' stroke-width='3' stroke-linejoin='round'/%3E%3Ccircle cx='70' cy='70' r='3.2' fill='%235A3A24' opacity='.85'/%3E%3Ccircle cx='30' cy='72' r='2.6' fill='%235A3A24' opacity='.85'/%3E%3Ccircle cx='62' cy='50' r='2.4' fill='%235A3A24' opacity='.85'/%3E%3C/svg%3E\"); }\n.gfx-load-games[data-theme=\"mint\"] .gfx-game-board[data-kind=\"fruits\"] > button span { -webkit-text-stroke-color:#2F5E1C; }\n.gfx-load-games[data-theme=\"lavender\"] .gfx-game-board[data-kind=\"fruits\"] > button::before { background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='93' rx='26' ry='4' fill='%233A2A20' opacity='.18'/%3E%3Cpath d='M52 24c0-6 2-11 6-15' fill='none' stroke='%236B4528' stroke-width='4.5' stroke-linecap='round'/%3E%3Cpath d='M56 16c8-8 20-6 25 0-7 8-18 8-25 0Z' fill='%237ED36A' stroke='%233E7A33' stroke-width='3' stroke-linejoin='round'/%3E%3Ccircle cx='30' cy='34' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='26' cy='30' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='50' cy='32' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='46' cy='28' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='70' cy='34' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='66' cy='30' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='22' cy='52' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='18' cy='48' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='40' cy='50' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='36' cy='46' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='60' cy='50' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='56' cy='46' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='78' cy='52' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='74' cy='48' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='31' cy='68' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='27' cy='64' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='50' cy='67' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='46' cy='63' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='69' cy='68' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='65' cy='64' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='40' cy='84' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='36' cy='80' r='2.6' fill='%23fff' opacity='.7'/%3E%3Ccircle cx='60' cy='84' r='11' fill='%239A6CE8' stroke='%233D2470' stroke-width='3'/%3E%3Ccircle cx='56' cy='80' r='2.6' fill='%23fff' opacity='.7'/%3E%3C/svg%3E\"); }\n.gfx-load-games[data-theme=\"lavender\"] .gfx-game-board[data-kind=\"fruits\"] > button span { -webkit-text-stroke-color:#3D2470; }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"fruits\"] > button::before { background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='93' rx='24' ry='4' fill='%23000' opacity='.25'/%3E%3Cpath d='M45.8 17.4Q50 10 54.2 17.4L61.6 30.2Q64.1 34.6 69.1 35.6L83.5 38.7Q91.8 40.4 86.1 46.7L76.2 57.6Q72.8 61.4 73.4 66.5L75 81.1Q75.9 89.6 68.1 86.1L54.7 80.1Q50 78 45.3 80.1L31.9 86.1Q24.1 89.6 25 81.1L26.6 66.5Q27.2 61.4 23.8 57.6L13.9 46.7Q8.2 40.4 16.5 38.7L30.9 35.6Q35.9 34.6 38.4 30.2Z' fill='%23FFCF3D' stroke='%238A5A00' stroke-width='3.5' stroke-linejoin='round'/%3E%3Cpath d='M38 40c-3 3-4 7-4 11' fill='none' stroke='%23fff' stroke-width='4' stroke-linecap='round' opacity='.75'/%3E%3Ccircle cx='85' cy='15' r='4' fill='%23FFF6C2'/%3E%3Ccircle cx='13' cy='76' r='3' fill='%23FFF6C2'/%3E%3C/svg%3E\"); }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"fruits\"] > button span { -webkit-text-stroke-color:#7A4E00; }\n.gfx-load-games[data-theme=\"lavender\"] .gfx-game-board[data-kind=\"fruits\"] > button span { margin-top:30%; }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"fruits\"] > button span { margin-top:14%; }\n.gfx-load-games[data-theme=\"berry\"] .gfx-game-board[data-kind=\"fruits\"] > button span { margin-top:26%; }\n/* Minesweeper palettes: covered tile (two stops), opened tile, its rim, the board, the flag and the eight numbers. */\n.gfx-load-games { --mc1:#FFF3C4; --mc2:#FFD86B; --mo:#FFFDF5; --mol:#E8D9BE; --mb:#E8D9BE; --mflag:#E13F35;\n  --n1:#2F6FD6; --n2:#2E8B43; --n3:#D23B3B; --n4:#6A3FB5; --n5:#A0522D; --n6:#13817F; --n7:#333; --n8:#777; }\n.gfx-load-games[data-theme=\"berry\"] { --mc1:#FFE1EA; --mc2:#FFAEC6; --mo:#FFF8FA; --mol:#F6CFDC; --mb:#F3C6D4; --mflag:#D91E4F; }\n.gfx-load-games[data-theme=\"mint\"] { --mc1:#DDF8EA; --mc2:#8FDDBA; --mo:#F6FFFA; --mol:#C4E9D7; --mb:#BFE4D2; --mflag:#6B4528; }\n.gfx-load-games[data-theme=\"lavender\"] { --mc1:#EFE8FF; --mc2:#C3AEFF; --mo:#FCFBFF; --mol:#DCD0F7; --mb:#D5C8F5; --mflag:#E0483C; }\n.gfx-load-games[data-theme=\"night\"] { --mc1:#5C6299; --mc2:#3E4374; --mo:#22253D; --mol:#3B4068; --mb:#171A2E; --mflag:#FFD166;\n  --n1:#8EC5FF; --n2:#8EE6A8; --n3:#FF9B9B; --n4:#D3B5FF; --n5:#FFC48A; --n6:#7FE0DA; --n7:#F0F0F0; --n8:#BBBBBB; }\n.gfx-game-board[data-kind=\"mines\"] { background:var(--mb); }\n/* Solid tiles; the lighter shade is a top edge, not a gradient. */\n.gfx-game-board[data-kind=\"mines\"] > button { background:var(--mc2); box-shadow:inset 0 3px 0 var(--mc1), 0 2px 0 var(--gfx-line, #6B4528); }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"mines\"] > button:not([data-open=\"true\"]) {\n  background:var(--mc2); box-shadow:inset 0 3px 0 var(--mc1), 0 2px 0 #14162A; border-color:#14162A; box-shadow:0 2px 0 #14162A; }\n.gfx-game-board[data-kind=\"mines\"] > button[data-open=\"true\"] { background:var(--mo); border-color:var(--mol); }\n.gfx-game-board > button[data-n=\"1\"] { color:var(--n1); } .gfx-game-board > button[data-n=\"2\"] { color:var(--n2); } .gfx-game-board > button[data-n=\"3\"] { color:var(--n3); }\n.gfx-game-board > button[data-n=\"4\"] { color:var(--n4); } .gfx-game-board > button[data-n=\"5\"] { color:var(--n5); } .gfx-game-board > button[data-n=\"6\"] { color:var(--n6); }\n.gfx-game-board > button[data-n=\"7\"] { color:var(--n7); } .gfx-game-board > button[data-n=\"8\"] { color:var(--n8); }\n.gfx-game-board[data-kind=\"mines\"] button[data-flag=\"true\"]::after { background:var(--mflag); }\n/* 밤하늘: a gold star instead of the flag, a glowing orb instead of the bomb. */\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"mines\"] button[data-flag=\"true\"] { background:var(--mc2); }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"mines\"] button[data-flag=\"true\"]::before { display:none; }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board[data-kind=\"mines\"] button[data-flag=\"true\"]::after { left:18%; top:16%; width:64%; height:64%;\n  clip-path:none; -webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M45.6 12.3Q50 4 54.4 12.3L62 26.8Q64.7 31.8 70.3 32.7L86.4 35.5Q95.7 37.2 89.1 43.9L77.7 55.7Q73.8 59.7 74.6 65.3L76.9 81.5Q78.2 90.8 69.7 86.7L55.1 79.5Q50 77 44.9 79.5L30.3 86.7Q21.8 90.8 23.1 81.5L25.4 65.3Q26.2 59.7 22.3 55.7L10.9 43.9Q4.3 37.2 13.6 35.5L29.7 32.7Q35.3 31.8 38 26.8Z'/%3E%3C/svg%3E\") center / contain no-repeat; mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M45.6 12.3Q50 4 54.4 12.3L62 26.8Q64.7 31.8 70.3 32.7L86.4 35.5Q95.7 37.2 89.1 43.9L77.7 55.7Q73.8 59.7 74.6 65.3L76.9 81.5Q78.2 90.8 69.7 86.7L55.1 79.5Q50 77 44.9 79.5L30.3 86.7Q21.8 90.8 23.1 81.5L25.4 65.3Q26.2 59.7 22.3 55.7L10.9 43.9Q4.3 37.2 13.6 35.5L29.7 32.7Q35.3 31.8 38 26.8Z'/%3E%3C/svg%3E\") center / contain no-repeat; filter:drop-shadow(0 0 3px #FFD166); }\n.gfx-load-games[data-theme=\"night\"] .gfx-game-board > button[data-mine=\"true\"]::before { background:#8C6CF0;\n  box-shadow:0 0 .35em #9C82FF, 0 0 0 .1em #2A1F66; }\n/* 민트 초코: the mine is a chocolate chip. */\n.gfx-load-games[data-theme=\"mint\"] .gfx-game-board > button[data-mine=\"true\"]::before { width:56%; border-radius:52% 48% 46% 54% / 60% 58% 42% 40%;\n  background:#5A3A24; box-shadow:0 .08em 0 #2A180C; }\n/* The result card over the board; a tap beside it shows the board again. */\n.gfx-game-result { position:absolute; inset:0; display:grid; place-items:center; z-index:2; border-radius:16px; background:color-mix(in srgb,var(--gfx-ink, #FFF4D9) 45%,transparent); cursor:pointer; }\n.gfx-game-result[hidden] { display:none; }\n.gfx-game-result > div { display:grid; justify-items:center; gap:.35em; padding:1em 1.6em; background:var(--gfx-card, #FFFDF5); border:3px solid var(--gfx-line, #6B4528); border-radius:22px; box-shadow:0 5px 0 var(--gfx-line, #6B4528); cursor:default; animation:gfx-game-pop .35s cubic-bezier(.3,1.6,.5,1) both; }\n.gfx-game-result b { font-size:1.6em; font-weight:normal; color:var(--gfx-accent, #F0763A); }\n.gfx-game-result em { font-style:normal; padding:.1em .8em; border-radius:999px; background:#FFD84D; color:#5A3A10; }\n.gfx-game-again { background:var(--gfx-accent, #F0763A) !important; color:#fff !important; margin-top:.2em; }\n@keyframes gfx-game-pop { from { scale:.6; opacity:0; } }\n@media (prefers-reduced-motion: reduce) { .gfx-load-games *, .gfx-load-games *::before { animation:none !important; transition:none !important; } }\n/* Placement: a column of game cards on the right of the generation screen, the game beside it. */\n:host { position:absolute; inset:12px 12px 12px auto; width:min(880px,96%); z-index:5; display:block; pointer-events:none; container-type:size; }\n:host([data-game-large]) { width:calc(100% - 24px); }\n.gfx-load-games { height:100%; display:flex; flex-direction:row-reverse; align-items:flex-start; gap:10px; --room:calc(100cqh - 150px);\n  color:var(--gfx-text, #5A3A24); font:clamp(12px,1.5vw,16px)/1.35 var(--body, \"Jua\"), \"Malgun Gothic\", sans-serif; }\n.gfx-load-games > * { pointer-events:auto; }\n.gfx-game-nav { flex:0 0 112px; flex-direction:column; flex-wrap:nowrap; align-items:stretch; max-height:100%; overflow:auto; margin:0; box-sizing:border-box; }\n.gfx-game-utils { flex-direction:column; }\n.gfx-game-content { flex:1; min-width:0; max-height:100%; overflow:auto; box-sizing:border-box; }\n.gfx-game-board[data-kind=\"memory\"] > button > .face img { filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1px #fff); }\n@media (max-width:600px) { :host { inset:8px 8px 8px auto; } .gfx-load-games { gap:5px; } .gfx-game-nav { flex-basis:78px; padding:5px; } .gfx-game-tab i { font-size:1.3em !important; } }\n";
  let sheet = null;
  const styleSheet = () => { if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); } return sheet; };

  /* Mounting: the games sit inside the game's generation panel (.forge-center) only while it says it is
   * generating. The game redraws that panel; the same games (and their state) move to the new one. */
  let mounted = null; // { center, wrap, position }
  function release() {
    if (!mounted) return;
    mounted.center.style.position = mounted.position;
    mounted = null;
  }
  /* The game shows this same screen, saying "Generating story…", while it merely fetches a scene that is already
   * written: on opening the game, on switching worlds, on entering a chapter. It cannot tell beforehand; a saved
   * scene just comes back within a second or so. So: never while the game boots or opens a chapter it has already
   * written, and otherwise only once the screen has been generating for GENERATING_AFTER without a break. */
  const GENERATING_AFTER = 2500;
  let generatingSince = 0;
  function generating(h) {
    if (!writingLoad(h)) return false;
    if (h._boot === "idle" || h._boot === "loading") return false;
    try { if (h._hudView === "forge" && typeof h._chapterWritten === "function" && h._chapterWritten()) return false; } catch {}
    return true;
  }
  function sync() {
    if (disposed) return;
    const h = document.querySelector(HOST_TAG), now = performance.now();
    if (generating(h)) generatingSince ||= now; else generatingSince = 0;
    const settled = generatingSince && (mounted || now - generatingSince >= GENERATING_AFTER);
    const center = settled ? h.shadowRoot.querySelector(".forge-center") : null;
    if (!center) { if (mounted) { mounted.wrap.remove(); release(); } return; }
    if (mounted && mounted.center !== center) { const wrap = mounted.wrap; release(); mounted = { center, wrap, position: center.style.position }; }
    if (!mounted) {
      const wrap = el("div");
      wrap.setAttribute("data-gfx-minigames", "");
      const shadow = wrap.attachShadow({ mode: "open" });
      shadow.adoptedStyleSheets = [styleSheet()];
      shadow.append(makeLoadingGames(wrap));
      mounted = { center, wrap, position: center.style.position };
      center.append(wrap);
      // The preset is read from the game element, so once the column is inside it.
      shadow.querySelector(".gfx-load-games")?.retheme?.();
    }
    if (getComputedStyle(center).position === "static") center.style.position = "relative";
    if (mounted.wrap.parentNode !== center) center.append(mounted.wrap);
  }
  const tick = setInterval(sync, 200);
  sync();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(tick);
    life.abort();
    if (mounted) { mounted.wrap.remove(); release(); }
    if (window[KEY] === dispose) delete window[KEY];
  };
  window[KEY] = dispose;
  MARINARA?.onCleanup?.(dispose);
})();
