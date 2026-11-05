"""Build site/index.html: every game of extension.js on one page, without Marinara or 말랑.

Takes extension.js up to its stylesheet (the games, their UI and CSS) and mounts the game column full page instead of
inside the generation screen. A colour picker stands in for 말랑's presets. Run again after changing extension.js:

    python3 tools/build_standalone.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "extension.js").read_text(encoding="utf-8")
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
cut = src.index("  /* Mounting: the games sit inside")
games = src[:cut].replace("</script", "<\\/script")

MOUNT = r"""
  /* Standalone page: the column fills the page; the picked preset is set on the host, where 말랑 would put it. */
  const host = document.getElementById("games");
  const wrap = el("div");
  const shadow = host.attachShadow({ mode: "open" });
  // Games drawn for a wide screen (the T-Rex is 600×170, the runner and the zombie school as wide): on an upright phone they ask to be turned.
  const WIDE = ["dino", "dash", "zombie"];
  const page = new CSSStyleSheet();
  page.replaceSync(":host(:not([data-game-large])) { position:relative; inset:auto; width:100%; height:100%; } :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 150px); }"
    + " .gfx-load-games { position:relative; } .gfx-shelf-toggle { display:none; }"
    // Phones held upright: the game list folds into one bar — the game on screen, [게임 목록 ▾], 크게 보기 and the
    // sound switch (게임 접기 would only leave an empty page here). [게임 목록] opens every game as a grid over the
    // screen, so nothing has to be scrolled sideways. (The how-to line under the board comes from the games' own
    // stylesheet.) The type is set in px: the column's 1.5vw comes out at 12px on a phone.
    + "@media (max-width:640px) { .gfx-load-games { flex-direction:column; align-items:stretch; gap:6px; font-size:15px; }"
    + " :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 200px); }"
    + " .gfx-game-nav { flex:none; display:flex; flex-direction:row; flex-wrap:nowrap; align-items:center; overflow:visible; max-height:none; padding:5px; gap:6px; border-radius:18px; }"
    + " :host(:not([data-shelf])) .gfx-game-tab:not([aria-pressed=\"true\"]) { display:none; }"
    + " :host(:not([data-shelf])) .gfx-game-tab { flex:1; min-width:0; flex-direction:row; justify-content:flex-start; gap:.45em; padding:.3em .8em !important; }"
    + " :host(:not([data-shelf])) .gfx-game-tab i { font-size:1.3em !important; } :host(:not([data-shelf])) .gfx-game-tab span { font-size:.95em; overflow:hidden; text-overflow:ellipsis; }"
    + " .gfx-shelf-toggle { display:block; flex:none; white-space:nowrap; }"
    + " .gfx-game-utils { flex:none; flex-direction:row; flex-wrap:nowrap; gap:5px; }"
    + " .gfx-game-nav .gfx-game-util { flex:none; font-size:.78em !important; padding:.35em .6em !important; }"
    + " .gfx-game-utils > :last-child { display:none; }"
    + " :host([data-shelf]) .gfx-game-nav { position:absolute; left:0; right:0; top:0; z-index:6; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); align-items:stretch; gap:6px; padding:8px;"
    + " max-height:calc(100cqh - 6px); overflow-y:auto; overscroll-behavior:contain; box-shadow:0 5px 0 var(--gfx-line, #6B4528), 0 14px 36px rgba(0,0,0,.3); }"
    + " :host([data-shelf]) .gfx-game-tab { padding:.35em .1em !important; } :host([data-shelf]) .gfx-game-tab i { font-size:1.5em !important; } :host([data-shelf]) .gfx-game-tab span { font-size:.76em; }"
    + " :host([data-shelf]) .gfx-shelf-toggle { grid-column:1 / 3; } :host([data-shelf]) .gfx-game-utils { grid-column:3 / -1; justify-content:flex-end; }"
    + " .gfx-game-content { flex:1; min-height:0; padding:8px 8px 10px; border-radius:18px; }"
    + " .gfx-game-head { margin-bottom:6px; gap:5px 8px; } .gfx-game-title { font-size:1em; } }"
    // Phones on their side: the game takes the full height, the list stays a column on the right under the theme
    // picker, which the page pins above it (46px). The tall boards (macaron drop, pinball) drop their 170px floor so
    // they fit the height instead of scrolling.
    + "@media (orientation:landscape) and (max-height:520px) { .gfx-load-games { gap:8px; font-size:14px; }"
    + " :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 108px); }"
    + " .gfx-game-board:is([data-kind=\"drop\"], [data-kind=\"pinball\"]) { width:min(100%, var(--room) * var(--fit, 1)); }"
    + " .gfx-game-nav { flex-basis:150px; margin-top:46px; max-height:calc(100% - 46px); overscroll-behavior:contain; }"
    + " .gfx-game-content { padding:6px 10px 8px; } }"
    // Games made for a wide screen ask to turn the phone; 그냥 세로로 dismisses it for this visit.
    + ".gfx-rotate { display:none; position:absolute; inset:var(--nav-h, 90px) 0 0; z-index:3; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:20px; text-align:center;"
    + " background:color-mix(in srgb,var(--gfx-card, #FFFDF5) 96%,transparent); border:3px solid var(--gfx-line, #6B4528); border-radius:18px; }"
    + " .gfx-rotate b { font-size:1.25em; font-weight:normal; } .gfx-rotate p { margin:0; opacity:.75; }"
    + " .gfx-rotate i { font-style:normal; font-size:3.4em; line-height:1; animation:gfx-turn 2.4s ease-in-out infinite; }"
    + " .gfx-rotate button { min-width:12em; font-size:1em; }"
    + " @keyframes gfx-turn { 0%, 30% { rotate:0deg; } 60%, 100% { rotate:-90deg; } }"
    + " @media (prefers-reduced-motion: reduce) { .gfx-rotate i { animation:none; rotate:-90deg; } }"
    + " @media (max-width:640px) and (orientation:portrait) { " + WIDE.map((k) => `:host([data-game="${k}"]:not([data-portrait-ok])) .gfx-rotate`).join(", ") + " { display:flex; } }");
  wrap.attachShadow({ mode: "open" });
  shadow.append(wrap);
  const inner = new CSSStyleSheet();
  inner.replaceSync(":host { display:block; height:100%; container-type:size; }");
  shadow.adoptedStyleSheets = [inner];
  wrap.shadowRoot.adoptedStyleSheets = [styleSheet(), page];
  const panel = makeLoadingGames(wrap);
  wrap.shadowRoot.append(panel);
  // The turn-your-phone card covers the game, below the list. Android can turn the screen itself from fullscreen;
  // iOS cannot, so there the card only asks.
  const rotate = el("div", "gfx-rotate");
  const turnIcon = el("i", "", "📱"); turnIcon.setAttribute("aria-hidden", "true");
  rotate.append(turnIcon, el("b", "", "가로로 돌려서 하는 게임이에요"), el("p", "", "휴대폰을 옆으로 눕히면 화면을 넓게 써요"));
  const canLock = document.fullscreenEnabled && typeof screen.orientation?.lock === "function";
  if (canLock) {
    const turn = el("button", "", "가로 전체 화면으로"); turn.type = "button";
    on(turn, "click", async () => { try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); await screen.orientation.lock("landscape"); } catch {} });
    rotate.append(turn);
  }
  const stay = el("button", "", "그냥 세로로 할게요"); stay.type = "button";
  on(stay, "click", () => { wrap.setAttribute("data-portrait-ok", ""); panel.querySelector(".gfx-game-board")?.focus({ preventScroll: true }); });
  rotate.append(stay);
  panel.append(rotate);
  const nav = panel.querySelector(".gfx-game-nav");
  new ResizeObserver(() => wrap.style.setProperty("--nav-h", nav.offsetTop + nav.offsetHeight + 6 + "px")).observe(nav);
  const pick = document.getElementById("preset");
  const apply = () => {
    host.setAttribute("data-gfx-preset", pick.value);
    document.documentElement.dataset.preset = pick.value;
    try { localStorage.setItem("gfx-games-preset", pick.value); } catch {}
    panel.retheme();
  };
  try { const saved = localStorage.getItem("gfx-games-preset"); if (saved && [...pick.options].some((o) => o.value === saved)) pick.value = saved; } catch {}
  on(pick, "change", apply);
  apply();
  // Upright phones: [게임 목록] opens the whole list as a grid; picking a game, tapping the game or Esc closes it.
  const shelf = el("button", "gfx-shelf-toggle gfx-game-util"); shelf.type = "button";
  nav.insertBefore(shelf, nav.querySelector(".gfx-game-utils"));
  const setShelf = (open) => { wrap.toggleAttribute("data-shelf", open); shelf.textContent = open ? "닫기 ▴" : "게임 목록 ▾"; shelf.setAttribute("aria-expanded", String(open)); };
  setShelf(false);
  on(shelf, "click", () => setShelf(!wrap.hasAttribute("data-shelf")));
  on(panel, "pointerdown", (e) => { if (wrap.hasAttribute("data-shelf") && !e.target.closest?.(".gfx-game-nav")) setShelf(false); });
  on(panel, "keydown", (e) => { if (e.key === "Escape" && wrap.hasAttribute("data-shelf")) setShelf(false); });
  // In the sideways list the picked game may sit below the fold: bring it into view.
  const reveal = () => panel.querySelector('.gfx-game-tab[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  on(panel, "click", (e) => { if (e.target.closest?.(".gfx-game-tab")) { setShelf(false); requestAnimationFrame(reveal); } });
  panel.querySelector('[data-game="shop"]')?.click();
})();
"""

HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Gacha Mini Games</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
  /* 말랑's five presets: card, outline, text, ground, highlight, accent. */
  :root, :root[data-preset="cream"] { --gfx-card:#FFFDF5; --gfx-line:#6B4528; --gfx-text:#5A3A24; --gfx-ink:#FFF4D9; --gfx-pick:#FFE17A; --gfx-accent:#F0763A; --page:#F6E7CC; }
  :root[data-preset="berry"] { --gfx-card:#FFF8FA; --gfx-line:#7A2E45; --gfx-text:#6A2E45; --gfx-ink:#FFE4EC; --gfx-pick:#FFD3E0; --gfx-accent:#F2557F; --page:#FBD9E3; }
  :root[data-preset="mint"] { --gfx-card:#F6FFFA; --gfx-line:#4A3424; --gfx-text:#3E2C1E; --gfx-ink:#E1F7EC; --gfx-pick:#BFEFD8; --gfx-accent:#3FA57A; --page:#CDEEDD; }
  :root[data-preset="lavender"] { --gfx-card:#FCFBFF; --gfx-line:#4F3F85; --gfx-text:#43356F; --gfx-ink:#EFE8FF; --gfx-pick:#DCD0FF; --gfx-accent:#8C6CF0; --page:#E2D8FA; }
  :root[data-preset="night"] { --gfx-card:#2A2E4D; --gfx-line:#14162A; --gfx-text:#F0EEFF; --gfx-ink:#22253D; --gfx-pick:#4A4F80; --gfx-accent:#FFB84D; --page:#171A2E; }
  /* Gacha Forge's own five UI styles: the tokens the game sets on its arena; the games dress themselves from them. */
  :root[data-preset^="gf-"] { --body:"Segoe UI", system-ui, -apple-system, sans-serif; }
  :root[data-preset="gf-base"] { --surface:#EDF1F6; --on-surface:#23374F; --text:#EDF1F6; --ink-2:#151D2C; --ground-1:#17212F; --steel:#4A6E96; --steel-dark:#23374F; --steel-faint:#8AA2BC; --coral:#F2603C; --radius:0px; --radius-sm:0px; --page:#0B1119; }
  :root[data-preset="gf-aurora"] { --surface:rgba(255,255,255,0.09); --on-surface:#F0EAFB; --text:#EDE8FA; --ink-2:#171334; --ground-1:#171334; --steel:#A98BE0; --steel-dark:#3A2E63; --steel-faint:#AEA0CE; --coral:#E8C87A; --radius:14px; --radius-sm:8px; --page:#07060F; }
  :root[data-preset="gf-bloom"] { --surface:#FFFFFF; --on-surface:#16233A; --text:#EAF1FC; --ink-2:#1D2B45; --ground-1:#2B3F63; --steel:#6E86AE; --steel-dark:#45566F; --steel-faint:#C3D2E8; --coral:#528CF7; --radius:20px; --radius-sm:12px; --page:#1D2B45; }
  :root[data-preset="gf-signal"] { --surface:rgba(255,255,255,0.06); --on-surface:#E8EAEE; --text:#FFFFFF; --ink-2:#0C0D10; --ground-1:#0C0D10; --steel:#9AA1AC; --steel-dark:#2A2E36; --steel-faint:#8B929C; --coral:#C8FF3D; --radius:2px; --radius-sm:2px; --page:#08090B; }
  :root[data-preset="gf-ember"] { --surface:#53381F; --on-surface:#F0D9A8; --text:#F5E7CE; --ink-2:#241811; --ground-1:#3A2A1E; --steel:#C89A4A; --steel-dark:#7A5730; --steel-faint:#BC9C70; --coral:#F0B429; --radius:18px; --radius-sm:10px; --page:#170F0B; }
  :root[data-preset^="gf-"] header { color:var(--text); }
  :root[data-preset^="gf-"] select { color:var(--on-surface); background:var(--surface); border-color:var(--steel-dark); box-shadow:none; border-radius:var(--radius-sm); }
  :root[data-preset^="gf-"] select option { color:#16233A; background:#fff; }
  * { box-sizing:border-box; }
  html, body { margin:0; height:100%; }
  body { display:flex; flex-direction:column; background:var(--page); color:var(--gfx-text); font:16px/1.4 Jua, "Malgun Gothic", sans-serif; }
  header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 16px 0; }
  h1 { margin:0; font-size:1.35em; font-weight:normal; }
  h1 small { font-size:.6em; opacity:.6; margin-left:.4em; }
  label { display:flex; align-items:center; gap:.4em; font-size:.9em; }
  select { font:inherit; color:var(--gfx-text); background:var(--gfx-card); border:2.5px solid var(--gfx-line); border-radius:999px; padding:.2em .8em; box-shadow:0 2px 0 var(--gfx-line); }
  #games { flex:1; min-height:520px; display:block; padding:10px 12px 12px; }
  /* Phones: one slim header row and the games fill the rest of the screen, clear of the notch and the home bar.
     The picker keeps 16px type so iOS does not zoom in when it opens. */
  @media (max-width:640px) {
    html, body { overscroll-behavior:none; }
    body { height:100dvh; -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; }
    header { flex-wrap:nowrap; padding:max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left)); }
    h1 { min-width:0; font-size:1.08em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    h1 small { margin-left:.3em; }
    label .tag { display:none; }
    select { max-width:9em; padding:.1em .6em; }
    #games { min-height:0; padding:6px max(6px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left)); }
  }
  /* Phones on their side: no title row, the games get the whole height. The picker sits at the top of the game
     list on the right, which leaves it 46px. */
  @media (orientation:landscape) and (max-height:520px) {
    html, body { overscroll-behavior:none; }
    body { height:100dvh; -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; }
    header { position:absolute; z-index:1; top:6px; right:max(8px, env(safe-area-inset-right)); width:150px; padding:0; }
    h1, label .tag { display:none; }
    label, select { width:100%; }
    select { padding:.15em .6em; }
    #games { min-height:0; padding:6px max(8px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
  }
</style>
</head>
<body>
<header>
  <h1>🎮 Gacha Mini Games<small>v__VERSION__</small></h1>
  <label><span class="tag">테마</span>
    <select id="preset" aria-label="테마">
      <option value="cream">크림 코코아</option>
      <option value="berry">딸기 우유</option>
      <option value="mint">민트 초코</option>
      <option value="lavender">라벤더</option>
      <option value="night">밤하늘</option>
      <optgroup label="가챠 포지 UI 스타일">
        <option value="gf-base">기본</option>
        <option value="gf-aurora">오로라</option>
        <option value="gf-bloom">블룸</option>
        <option value="gf-signal">시그널</option>
        <option value="gf-ember">엠버</option>
      </optgroup>
    </select>
  </label>
</header>
<div id="games"></div>
<script>
__GAMES__
__MOUNT__
</script>
</body>
</html>
"""

out = HTML.replace("__VERSION__", manifest["config"]["version"]).replace("__GAMES__", games.rstrip()).replace("__MOUNT__", MOUNT.strip("\n"))
(ROOT / "site").mkdir(exist_ok=True)
(ROOT / "site" / "index.html").write_text(out, encoding="utf-8")
print("site/index.html", len(out.encode("utf-8")), "bytes")
