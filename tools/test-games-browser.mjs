// No npm dependencies. Run with Microsoft Edge or another Chromium executable.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, '.browser-check');
const edge = process.argv[2] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
mkdirSync(dir, { recursive: true });
const errors = `<script>window.browserErrors=[];window.inputSignals=[];addEventListener('error',e=>browserErrors.push(e.message));addEventListener('unhandledrejection',e=>browserErrors.push(String(e.reason)));for(const [target,event] of [[window,'blur'],[document,'visibilitychange']]){const add=target.addEventListener;target.addEventListener=function(type,fn,options){if(type===event&&options?.signal){options.signal.inputStack=new Error().stack;inputSignals.push(options.signal);}return add.call(this,type,fn,options);};}</script>`;
const runner = `<script>
(async()=>{
 const report=document.createElement('pre');report.id='browser-results';report.hidden=true;document.body.append(report);
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(x,m)=>{if(!x)throw Error(m)};
 try {
  const root=document.querySelector('#games').shadowRoot.firstElementChild.shadowRoot;
  const pick=key=>root.querySelector('[data-game="'+key+'"]').click();
  const snapshot=new URLSearchParams(location.search).get('game');
  if(snapshot){pick(snapshot);return;}
  check(root.querySelectorAll('.gfx-game-tab').length===18,'must show 18 games');
  for(const tab of root.querySelectorAll('.gfx-game-tab')) {tab.click();await wait(60);check(root.querySelector('.gfx-game-board'),'board '+tab.dataset.game);}
  pick('water');await wait(60);
  const wc=root.querySelector('canvas');check(wc&&wc.width>0,'water sort draws on a canvas');
  const undo=[...root.querySelectorAll('button')].find(b=>b.textContent.includes('되돌리기'));
  check(undo&&undo.disabled,'undo starts disabled');
  for(const key of ['dino','knife','count']) {
   pick(key);await wait(40);
   const canvas=root.querySelector('canvas');check(canvas&&canvas.width>0,'canvas '+key);
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   check(pixels.some((v,i)=>i%4===3&&v>0),'canvas renders '+key);
   canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:canvas.getBoundingClientRect().left+canvas.getBoundingClientRect().width*.75}));
   await wait(600);
   const stats=root.querySelector('.gfx-game-stats').textContent;
   if(key==='knife')check(stats.includes('⭐ 1'),'knife impact scores');
   pick('mines');await wait(20);pick(key);await wait(40);
   const after=root.querySelector('.gfx-game-stats').textContent;
   check(key==='dino'||after===stats,'switch preserves '+key);
   root.querySelector('[role="radio"][aria-label^="어려움"]').click();await wait(30);
   check(root.querySelector('[role="radio"][aria-label^="어려움"]').getAttribute('aria-checked')==='true','difficulty '+key);
  }
  for(const key of ['dino','water','knife','count']){
   pick(key);await wait(40);const board=root.querySelector('.gfx-game-board'),r=board.getBoundingClientRect();
   check(r.width>100&&r.height>80,'board dimensions '+key);
   check(r.right<=innerWidth+1&&r.left>=-1,'horizontal fit '+key);
  }
  pick('mines');check(inputSignals.every(s=>s.aborted),'global input handlers must be removed after leaving arcade games '+inputSignals.filter(s=>!s.aborted).map(s=>s.inputStack).join('; '));
  check(document.documentElement.scrollWidth<=innerWidth,'page must fit viewport');
  check(browserErrors.length===0,browserErrors.join('; '));report.textContent='PASS: 18 games, controls, canvas, state, difficulty and layout';
 }catch(e){report.textContent='FAIL: '+e.message+' '+browserErrors.join('; ');}
})();
</script>`;
const site = readFileSync(path.join(root, 'site/index.html'), 'utf8');
const fixture = path.join(dir, 'games.html');
writeFileSync(fixture, site.replace('</head>', errors + '</head>').replace('</body>', runner + '</body>'));
const url = pathToFileURL(fixture).href;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = path.join(dir, 'profile-cdp');
const processHandle = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) { try { port = Number(readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} if (!port) await wait(100); }
  assert.ok(port, 'Edge debugging endpoint must start');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(Error(JSON.stringify(m.error))); else p.resolve(m.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable');
  for (const [width, height] of [[1200, 900], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    let report = '';
    for (let i = 0; i < 200; i++) { await wait(100); report = await evaluate('document.querySelector("#browser-results")?.textContent || ""'); if (report) break; }
    writeFileSync(path.join(dir, 'report-' + width + '.txt'), report);
    assert.ok(report.startsWith('PASS:'), width + ': ' + report);
    console.log(width + 'x' + height + ': ' + report);
    for (const game of ['dino', 'water', 'knife', 'count']) {
      await evaluate(`document.querySelector('#games').shadowRoot.firstElementChild.shadowRoot.querySelector('[data-game="${game}"]').click()`);
      await wait(100);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(dir, game + '-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    }
  }
} finally {
  socket?.close(); processHandle.kill();
  await wait(1000);
  // Only the browser profile created by this test, under the project.
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
