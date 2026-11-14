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
  const WIDE = ["dino", "dash", "zombie", "school"];
  const page = new CSSStyleSheet();
  page.replaceSync(":host(:not([data-game-large])) { position:relative; inset:auto; width:100%; height:100%; } :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 150px); }"
    + " .gfx-load-games { position:relative; } .gfx-sheet, .gfx-menu-toggle { display:none; }"
    // Phones fold everything but the game away. Closed, the screen holds the game and one slim row: ☰, the game's name
    // and its scores (a narrow column on the left when the phone lies on its side). ☰ slides a menu sheet over the
    // game with the game's difficulty and 새 판 and the settings; in it 게임 설명 and 게임 목록 fold open on their own.
    // The pieces are moved there by the script below, so the games keep working on them as before.
    + "@media (max-width:640px), (orientation:landscape) and (max-height:520px) { .gfx-load-games { flex-direction:column; align-items:stretch; gap:0; font-size:15px; }"
    + " .gfx-load-games > .gfx-game-nav { display:none; }"
    + " .gfx-game-content { flex:1; min-height:0; padding:4px 4px 6px; border-width:2px; border-radius:16px; }"
    + " .gfx-game-head { margin-bottom:4px; flex-wrap:nowrap; gap:6px; } .gfx-game-head > .gfx-game-title { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:1em; }"
    + " .gfx-game-head > .gfx-game-stats { margin-left:auto; flex:0 1 auto; } .gfx-game-board { padding:3px; }"
    + " .gfx-menu-toggle { display:block; flex:none; order:0; font-size:.9em !important; padding:.15em .65em !important; line-height:1.2; }"
    + " :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 50px); }"
    + " .gfx-sheet { display:flex; flex-direction:column; gap:9px; position:absolute; inset:0; z-index:8; padding:12px 12px 16px; overflow-y:auto; overscroll-behavior:contain;"
    + " background:var(--gfx-card, #FFFDF5); color:var(--gfx-text, #5A3A24); border:3px solid var(--gfx-line, #6B4528); border-radius:18px; box-shadow:0 14px 36px rgba(0,0,0,.35);"
    + " opacity:0; transform:translateY(-14px); visibility:hidden; pointer-events:none; transition:opacity .18s, transform .18s, visibility .18s; }"
    + " :host([data-menu]) .gfx-sheet { opacity:1; transform:none; visibility:visible; pointer-events:auto; }"
    + " .gfx-sheet-top { display:flex; align-items:center; justify-content:space-between; gap:8px; } .gfx-sheet-top b { font-size:1.2em; font-weight:normal; }"
    + " .gfx-sheet-now { display:flex; flex-direction:column; gap:7px; padding:9px; border:2px dashed color-mix(in srgb,var(--gfx-line, #6B4528) 45%,transparent); border-radius:14px; }"
    + " .gfx-sheet-now > b { font-weight:normal; } .gfx-sheet .gfx-game-tools { justify-content:flex-start; flex-wrap:wrap; }"
    + " .gfx-sheet .gfx-sheet-fold { display:flex; justify-content:space-between; width:100%; text-align:left; font-size:1em !important; padding:.45em .9em !important; }"
    + " .gfx-sheet-body[hidden] { display:none; } .gfx-sheet-label { font-weight:normal; opacity:.8; margin-top:2px; }"
    + " .gfx-sheet .gfx-game-info { margin:0; padding:0 4px; text-align:left; font-size:.86em; line-height:1.5; }"
    + " .gfx-sheet .gfx-game-nav { position:static; display:grid; grid-template-columns:repeat(auto-fill, minmax(76px, 1fr)); gap:6px; width:auto; height:auto; max-height:none; overflow:visible; padding:0; margin:0; border:0; box-shadow:none; background:none; flex:none; }"
    + " .gfx-sheet .gfx-game-tab { display:flex !important; flex-direction:column; align-items:center; padding:.35em .1em !important; } .gfx-sheet .gfx-game-tab i { font-size:1.5em !important; } .gfx-sheet .gfx-game-tab span { font-size:.76em; }"
    + " .gfx-sheet-set { display:flex; flex-wrap:wrap; gap:6px; align-items:center; } .gfx-sheet .gfx-game-utils { display:flex; flex-direction:row; flex-wrap:wrap; gap:6px; }"
    + " .gfx-sheet .gfx-game-utils > :last-child { display:none; } .gfx-sheet .gfx-game-util { font-size:.85em !important; }"
    + " .gfx-sheet label { display:flex; align-items:center; gap:.4em; font-size:.9em; } .gfx-sheet select { font:inherit; font-size:16px; color:var(--gfx-text, #5A3A24); background:var(--gfx-card, #FFFDF5); border:2.5px solid var(--gfx-line, #6B4528); border-radius:999px; padding:.15em .7em; }"
    + " .gfx-rotate { inset:44px 0 0 !important; } }"
    // Upright: the game box reaches the bottom and the board sits in the middle of it.
    + "@media (max-width:640px) { .gfx-load-games { height:100%; } .gfx-game-content { display:flex; flex-direction:column; } .gfx-game-stage { flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; } }"
    // On its side the height is what is short: ☰, the name and the scores stack in a narrow column on the left and the
    // board takes the whole height beside it. The tall boards (macaron drop, pinball) drop their 170px floor.
    + "@media (orientation:landscape) and (max-height:520px) { .gfx-load-games { font-size:14px; }"
    + " .gfx-game-content { display:grid; grid-template-columns:112px minmax(0,1fr); grid-template-rows:minmax(0,1fr); column-gap:8px; padding:4px 6px 4px 4px; }"
    + " .gfx-game-head { grid-column:1; grid-row:1; flex-direction:column; align-items:stretch; justify-content:flex-start; align-self:start; flex-wrap:nowrap; gap:6px; margin:0; }"
    + " .gfx-game-head > .gfx-game-title { white-space:normal; } .gfx-game-head > .gfx-game-stats { margin:0; flex-wrap:wrap; justify-content:flex-start; } .gfx-menu-toggle { align-self:flex-start; }"
    + " .gfx-game-stage { grid-column:2; grid-row:1; min-height:0; align-self:center; }"
    + " .gfx-game-board:is([data-kind=\"drop\"], [data-kind=\"pinball\"]) { width:min(100%, var(--room) * var(--fit, 1)); }"
    + " :host(:not([data-game-large])) .gfx-load-games { --room:calc(100cqh - 24px); } }"
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
  // Phones: ☰ before the game's name opens the menu sheet over the game; in it 게임 설명 and 게임 목록 fold open.
  // The game list (with the sound, pixel and size switches), the difficulty and 새 판, the how-to line, the theme and
  // the fullscreen button are moved into the sheet while the screen is phone-sized, and back when it is not. Each
  // game builds its title row anew, so the moving is redone whenever the content changes.
  const PHONE = matchMedia("(max-width:640px), (orientation:landscape) and (max-height:520px)");
  const content = panel.querySelector(".gfx-game-content"), utils = nav.querySelector(".gfx-game-utils"), header = document.querySelector("header"), theme = header.querySelector("label"), full = document.getElementById("fullscreen");
  full.classList.add("gfx-game-util");
  const menu = el("button", "gfx-menu-toggle gfx-game-util", "☰"); menu.type = "button"; menu.setAttribute("aria-label", "메뉴 펼치기");
  const menuSheet = el("div", "gfx-sheet"); menuSheet.setAttribute("role", "dialog"); menuSheet.setAttribute("aria-label", "메뉴");
  const shut = el("button", "gfx-game-util", "✕ 닫기"); shut.type = "button";
  const top = el("div", "gfx-sheet-top"); top.append(el("b", "", "☰ 메뉴"), shut);
  const nowName = el("b"), toolsSlot = el("div"), now = el("div", "gfx-sheet-now"); now.append(nowName, toolsSlot);
  const fold = (label, body) => {
    const b = el("button", "gfx-sheet-fold gfx-game-util"); b.type = "button";
    const set = open => { body.hidden = !open; b.replaceChildren(el("span", "", label), el("span", "", open ? "▴" : "▾")); b.setAttribute("aria-expanded", String(open)); };
    set(false); on(b, "click", () => set(body.hidden)); return [b, set];
  };
  const infoSlot = el("div", "gfx-sheet-body"), listSlot = el("div", "gfx-sheet-body"), setBox = el("div", "gfx-sheet-set");
  const [infoFold, setInfo] = fold("📖 게임 설명", infoSlot), [listFold, setList] = fold("🎮 게임 목록", listSlot);
  menuSheet.append(top, now, infoFold, infoSlot, listFold, listSlot, el("b", "gfx-sheet-label", "⚙️ 설정"), setBox);
  panel.append(menuSheet);
  let phone = false;
  const seat = () => {
    const head = content.querySelector(".gfx-game-head");
    if (head && menu.parentNode !== head) head.prepend(menu);
    if (!phone) return;
    const tools = content.querySelector(".gfx-game-head > .gfx-game-tools"), info = content.querySelector(":scope > .gfx-game-info");
    if (tools) toolsSlot.replaceChildren(tools);
    if (info) infoSlot.replaceChildren(info);
    nowName.textContent = "지금 게임 · " + (content.querySelector(".gfx-game-title span")?.textContent || "");
  };
  new MutationObserver(seat).observe(content, { childList: true });
  const setMenu = (open) => {
    wrap.toggleAttribute("data-menu", open); menu.setAttribute("aria-expanded", String(open));
    if (open) { menuSheet.scrollTop = 0; shut.focus({ preventScroll: true }); } else { setInfo(false); setList(false); }
  };
  const place = () => {
    phone = PHONE.matches;
    if (phone) { listSlot.replaceChildren(nav); setBox.replaceChildren(utils, theme, full); seat(); return; }
    setMenu(false);
    panel.prepend(nav); nav.append(utils); header.append(theme, full);
    const head = content.querySelector(".gfx-game-head"), tools = toolsSlot.firstElementChild, info = infoSlot.firstElementChild;
    if (head && tools) head.insertBefore(tools, head.querySelector(".gfx-game-stats"));
    if (head && info) head.after(info);
  };
  setMenu(false);
  on(menu, "click", () => setMenu(true));
  on(shut, "click", () => setMenu(false));
  on(panel, "keydown", (e) => { if (e.key === "Escape" && wrap.hasAttribute("data-menu")) setMenu(false); });
  // The browser's own fullscreen hides its address bar too, where the phone allows it (not on iPhone).
  if (document.fullscreenEnabled) {
    full.hidden = false;
    const sync = () => { const now2 = !!document.fullscreenElement; full.textContent = now2 ? "⤡ 창 모드" : "⛶ 전체 화면"; full.setAttribute("aria-label", now2 ? "전체 화면 끝내기" : "전체 화면"); };
    on(full, "click", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch {} });
    on(document, "fullscreenchange", sync); sync();
  }
  // In the sideways desktop list the picked game may sit below the fold: bring it into view. Picking one closes the sheet.
  const reveal = () => { if (!phone) panel.querySelector('.gfx-game-tab[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); };
  on(panel, "click", (e) => { if (e.target.closest?.(".gfx-game-tab")) { setMenu(false); requestAnimationFrame(reveal); } });
  PHONE.addEventListener("change", place);
  place();
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
  #fullscreen { display:none; }
  header #fullscreen:not([hidden]) { display:block; flex:none; font:inherit; font-size:.9em; color:var(--gfx-text); background:var(--gfx-card); border:2.5px solid var(--gfx-line); border-radius:999px; padding:.2em .8em; box-shadow:0 2px 0 var(--gfx-line); cursor:pointer; }
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
    header { display:none; }
    #games { min-height:0; padding:6px max(6px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left)); }
  }
  /* Phones on their side: no title row, the games get the whole height. The picker sits at the top of the game
     list on the right, which leaves it 46px. */
  @media (orientation:landscape) and (max-height:520px) {
    html, body { overscroll-behavior:none; }
    body { height:100dvh; -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; }
    header { position:absolute; z-index:1; top:6px; right:max(8px, env(safe-area-inset-right)); width:150px; padding:0; flex-wrap:nowrap; gap:5px; }
    h1, label .tag { display:none; }
    label { flex:1; min-width:0; } select { width:100%; }
    header { display:none !important; }
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
  <button id="fullscreen" type="button" hidden></button>
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
