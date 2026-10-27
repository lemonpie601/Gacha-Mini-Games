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
  const page = new CSSStyleSheet();
  page.replaceSync(":host, :host([data-game-large]) { position:relative; inset:auto; width:100%; height:100%; } .gfx-load-games { --room:calc(100cqh - 150px); }"
    // Phones: the game list becomes one scrolling row above the game.
    + "@media (max-width:640px) { .gfx-load-games { flex-direction:column; align-items:stretch; --room:calc(100cqh - 260px); }"
    + " .gfx-game-nav { flex:none; display:flex; flex-direction:row; overflow-x:auto; overflow-y:hidden; max-height:none; padding:5px; gap:5px; }"
    + " .gfx-game-tab { flex:0 0 4.4em; } .gfx-game-utils { display:none; } .gfx-game-content { flex:1; min-height:0; padding:8px; } }");
  wrap.attachShadow({ mode: "open" });
  shadow.append(wrap);
  const inner = new CSSStyleSheet();
  inner.replaceSync(":host { display:block; height:100%; container-type:size; }");
  shadow.adoptedStyleSheets = [inner];
  wrap.shadowRoot.adoptedStyleSheets = [styleSheet(), page];
  const panel = makeLoadingGames(wrap);
  wrap.shadowRoot.append(panel);
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
  panel.querySelector('[data-game="shop"]')?.click();
})();
"""

HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
  * { box-sizing:border-box; }
  html, body { margin:0; height:100%; }
  body { display:flex; flex-direction:column; background:var(--page); color:var(--gfx-text); font:16px/1.4 Jua, "Malgun Gothic", sans-serif; }
  header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 16px 0; }
  h1 { margin:0; font-size:1.35em; font-weight:normal; }
  h1 small { font-size:.6em; opacity:.6; margin-left:.4em; }
  label { display:flex; align-items:center; gap:.4em; font-size:.9em; }
  select { font:inherit; color:var(--gfx-text); background:var(--gfx-card); border:2.5px solid var(--gfx-line); border-radius:999px; padding:.2em .8em; box-shadow:0 2px 0 var(--gfx-line); }
  #games { flex:1; min-height:520px; display:block; padding:10px 12px 12px; }
</style>
</head>
<body>
<header>
  <h1>🎮 Gacha Mini Games<small>v__VERSION__</small></h1>
  <label>테마
    <select id="preset">
      <option value="cream">크림 코코아</option>
      <option value="berry">딸기 우유</option>
      <option value="mint">민트 초코</option>
      <option value="lavender">라벤더</option>
      <option value="night">밤하늘</option>
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
