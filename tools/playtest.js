// Sensei Hakuun playtester bot.
// Walks every area of the garden, opens every game, climbs, glides and golfs, and reports anything that breaks:
// script errors, falling through the floor, walking into water or through walls, the camera stuck inside things, low FPS.
// Run:  xvfb-run -a electron --no-sandbox tools/playtest.js  [URL]     (URL defaults to http://127.0.0.1:8765/garden.html)
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// serves ../web itself unless a URL is given
const http = require('http'); const WEB = path.join(__dirname, '..', 'web'); let URL0 = process.argv.find(a => a.startsWith('http'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.wasm': 'application/wasm' };
function serve() { return new Promise(res => { const srv = http.createServer((q, r) => { const f = path.join(WEB, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); srv.listen(0, '127.0.0.1', () => res(srv.address().port)); }); }
const OUT = process.env.PLAYTEST_OUT || '/tmp/playtest'; fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  if (!URL0) URL0 = `http://127.0.0.1:${await serve()}/garden.html`; URL0 += '?dbg';
  const w = new BrowserWindow({ width: 1280, height: 760, show: true, webPreferences: { backgroundThrottling: false } });
  const issues = [], errors = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
  w.webContents.on('console-message', (e, l, m, line) => { if (l >= 3 || /Uncaught|TypeError|ReferenceError/.test(m)) errors.push(m.slice(0, 240) + ' @' + line); });
  await w.loadURL(URL0); await sleep(4500);
  const js = c => w.webContents.executeJavaScript(c).catch(e => ({ err: e.message }));
  const shot = async name => { await w.webContents.capturePage(); await sleep(400); const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, (await w.webContents.capturePage()).toPNG()); return f; };
  const seen = new Set(); const issue = async (kind, where, detail) => { const key = kind + '|' + where.replace(/\(.*\)/, ''); const id = issues.length + 1; let f = null; if (!seen.has(key)) { seen.add(key); f = await shot('issue' + id + '-' + kind); } issues.push({ id, kind, where, detail, shot: f }); };
  await js('__dbg.enterGame()'); await sleep(3000); await js('__dbg.day(); document.querySelectorAll(".panel.show").forEach(p=>p.classList.remove("show"))');
  for (let i = 0; i < 40; i++) { if (await js('__dbg.natReady')) break; await sleep(500); }
  // health probe run every step
  const PROBE = `(()=>{ const d=__dbg, p=d.player.position, g=d.groundY(p.x,p.z); const out={x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2),g:+g.toFixed(2),zone:d.zone,mode:d.pmode()};
    out.nan=!isFinite(p.x+p.y+p.z); out.under=d.zone==="world"&&d.pmode()==="walk"&&p.y<g-.35; out.water=d.zone==="world"&&d.pmode()==="walk"&&(d.lakeE(p.x,p.z)<.9||(p.x/(d.PRX-.4))**2+(p.z/(d.PRZ-.4))**2<1);
    out.inside=d.zone==="world"&&d.pmode()==="walk"&&d.insideCollider(p.x,p.z,-.25);
    const c=d.camera.position; out.camUnder=d.zone==="world"&&c.y<d.H(c.x,c.z)-.2; return out; })()`;
  const keyDown = c => js(`dispatchEvent(new KeyboardEvent('keydown',{code:'${c}'}))`), keyUp = c => js(`dispatchEvent(new KeyboardEvent('keyup',{code:'${c}'}))`);
  const stops = await js('JSON.stringify(__dbg.TRAVEL.map(t=>({id:t.id,n:t.n,x:t.x,z:t.z})))');
  const places = JSON.parse(stops).map(p => ({ ...p, lantern: true })).concat([{ id: 'pond', n: 'Koi pond edge', x: 0, z: 9 }, { id: 'tea', n: 'Tea house front', x: 9, z: 15 }, { id: 'bamboo', n: 'Bamboo grove', x: -34, z: 18 }, { id: 'drygarden', n: 'Dry garden', x: 20, z: 0 }, { id: 'pier', n: 'Pier', x: 48, z: 22 }, { id: 'art', n: 'Art board', x: -9, z: 4 }]);
  const blackFrac = async () => { const img = await w.webContents.capturePage(); const b = img.toBitmap(); let n = 0, t = 0; for (let i = 0; i < b.length; i += 4 * 23) { t++; if (b[i] < 4 && b[i + 1] < 4 && b[i + 2] < 4) n++; } return n / t; };
  const flickerCheck = async where => { const fr = []; for (let k = 0; k < 6; k++) { fr.push(await blackFrac()); await sleep(110); } const mx = Math.max(...fr), mn = Math.min(...fr);
    if (mx > .03) await issue('black-box', where, `${(mx * 100).toFixed(1)}% of the screen is pure black in at least one frame`); if (mx - mn > .02) await issue('flicker', where, `black area jumps between ${(mn * 100).toFixed(1)}% and ${(mx * 100).toFixed(1)}% across 6 frames`); };
  let fpsMin = 999;
  for (const pl of places) {
    await js(`(()=>{ const d=__dbg; const off=${pl.lantern?2.4:0}, a=Math.atan2(${pl.z},${pl.x}), x=${pl.x}-Math.cos(a)*off, z=${pl.z}-Math.sin(a)*off; d.setZone('world',x,d.H(x,z),z); document.querySelectorAll(".panel.show").forEach(p=>p.classList.remove("show")); })()`); await sleep(900);
    for (const dir of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
      await keyDown(dir); if (Math.random() < .5) await keyDown('ShiftLeft');
      for (let k = 0; k < 3; k++) { await sleep(280); const r = await js(PROBE); if (!r || r.err) continue;
        const where = `${pl.n} (${r.x}, ${r.z})`;
        if (r.nan) await issue('nan', where, 'player position became NaN');
        if (r.under) await issue('under-floor', where, `player at y=${r.y}, ground at ${r.g}`);
        if (r.water) await issue('in-water', where, 'walked into the pond or lake');
        if (r.inside) await issue('inside-wall', where, 'player is inside a collider');
        if (r.camUnder) await issue('camera-underground', where, 'camera went below the terrain'); }
      await keyUp(dir); await keyUp('ShiftLeft');
      if (issues.length > 120) break; }
    await flickerCheck(pl.n); await js(`(()=>{ const d=__dbg; d.player.rotation.y+=Math.PI; })()`); await sleep(500); await flickerCheck(pl.n + ' (turned around)');
    const f0 = await js('__dbg.renderer.info.render.frame'); await sleep(1000); const f1 = await js('__dbg.renderer.info.render.frame'); const fps = f1 - f0; fpsMin = Math.min(fpsMin, fps);
    if (fps < 12) issues.push({ id: issues.length + 1, kind: 'low-fps', where: pl.n, detail: fps + ' fps in the test VM (software rendering, so treat as relative)' });
  }
  // every minigame opens and closes cleanly
  const games = JSON.parse(await js('JSON.stringify(Object.keys(__dbg.GAMES||{}))') || '[]');
  for (const g of games) { const before = errors.length; await js(`(__dbg.GAMES.taiko._picked=true, __dbg.openGame(${JSON.stringify(g)}))`); await sleep(1800); await shot('game-' + g); await js('__dbg.mgClose()'); await sleep(500); if (errors.length > before) issues.push({ id: issues.length + 1, kind: 'game-error', where: g, detail: errors.slice(before).join(' | ') }); }
  // climbing, summit, glide
  await js('__dbg.adv.startAt()'); await keyDown('KeyW'); await sleep(3000); await keyUp('KeyW'); let r = JSON.parse(await js('JSON.stringify({m:__dbg.pmode(),y:__dbg.ADV.y})'));
  if (r.m !== 'climb' || r.y < 1) issues.push({ id: issues.length + 1, kind: 'climb', where: 'Kumo Peak', detail: 'climbing did not progress: ' + JSON.stringify(r) });
  await js('__dbg.ADV.y=33.9; __dbg.ADV.stamina=100'); await keyDown('KeyW'); await sleep(1200); await keyUp('KeyW'); await sleep(800);
  await js(`(()=>{ const d=__dbg; d.controls.target.copy(d.player.position); d.camera.position.set(d.player.position.x+8,d.player.position.y+3,d.player.position.z); })()`); await keyDown('KeyW'); await sleep(2500); await keyUp('KeyW');
  r = JSON.parse(await js('JSON.stringify({m:__dbg.pmode(),top:__dbg.ADV.onTop})')); if (r.m !== 'glide' && r.m !== 'walk') issues.push({ id: issues.length + 1, kind: 'glide', where: 'Kumo Peak summit', detail: JSON.stringify(r) });
  // golf round-trip
  await js('__dbg.setZone("world",0,0,10)'); await sleep(2500); await js('__dbg.golfStart()'); await sleep(1500); await js('__dbg.golf.padA=true'); await sleep(900); await js('__dbg.golf.padA=false'); await sleep(2500);
  r = JSON.parse(await js('JSON.stringify({s:__dbg.golf.strokes})')); if (!r.s) issues.push({ id: issues.length + 1, kind: 'golf', where: 'Mini golf', detail: 'controller shot did not register' }); await js('__dbg.golfEnd()');
  // UI: every panel opens, is on screen and readable, and closes; HUD pieces don't overlap
  const UI = [['Menu', 'showMenu()', '#title', 'hideMenu()'], ['Travel map', 'openTravel()', '#travelPanel', '$("#travelPanel").classList.remove("show")'], ['Chat', 'openChat()', '#chat', 'closeChat()'], ['Scroll library', '$("#scrollBtn").click()', '#scrollPanel', 'document.querySelectorAll(".panel.show").forEach(p=>p.classList.remove("show"))'], ['Life panel', '$("#lifeBtn").click()', '.panel.show', 'document.querySelectorAll(".panel.show").forEach(p=>p.classList.remove("show"))'], ['Music', '$("#soundBtn").click()', '.panel.show', 'document.querySelectorAll(".panel.show").forEach(p=>p.classList.remove("show"))']];
  for (const [n, open, sel, close] of UI) { const r = await js(`(async()=>{ try{ __dbg.ui(${JSON.stringify(open)}); }catch(e){ return {err:e.message}; } await new Promise(r=>setTimeout(r,700)); const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return {missing:true}; const b=el.getBoundingClientRect(), cs=getComputedStyle(el); return {w:b.width,h:b.height,l:b.left,t:b.top,r:b.right,bt:b.bottom,vis:cs.visibility,op:+cs.opacity,disp:cs.display,W:innerWidth,H:innerHeight}; })()`);
    if (!r || r.err) await issue('ui', n, 'opening it threw: ' + (r && r.err)); else if (r.missing) await issue('ui', n, 'panel element not found'); else if (r.disp === 'none' || r.vis === 'hidden' || r.w < 40 || r.h < 40) await issue('ui', n, 'did not become visible'); else if (r.l < -2 || r.t < -2 || r.r > r.W + 2 || r.bt > r.H + 2) await issue('ui', n, 'panel runs off the screen');
    await js(`try{ __dbg.ui(${JSON.stringify(close)}); }catch(e){}`); await sleep(400); }
  for (const touch of [false, true]) { const ov = await js(`(()=>{ document.body.classList.toggle('touch',${touch}); document.body.classList.remove('inmenu'); if(${touch}) document.getElementById('tpad').classList.add('on'); const ids=['#clock','.hud .btns','#mini','#joy','#tpad','#act']; const R=ids.map(s=>{ const e=document.querySelector(s); if(!e) return null; const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<.1) return null; const b=e.getBoundingClientRect(); return b.width&&b.height?[s,b]:null; }).filter(Boolean); const out=[]; for(let i=0;i<R.length;i++) for(let j=i+1;j<R.length;j++){ const a=R[i][1], b=R[j][1]; if(a.left<b.right-4&&b.left<a.right-4&&a.top<b.bottom-4&&b.top<a.bottom-4) out.push(R[i][0]+' overlaps '+R[j][0]); } document.body.classList.remove('touch'); return out; })()`);
    for (const o of (ov || [])) await issue('ui-overlap', touch ? 'Touch layout' : 'Desktop layout', o); }
  // movement: a roll actually moves you and leaves you on your feet
  await js(`(()=>{ const d=__dbg; d.setZone('world',2,d.H(2,30),30); })()`); await sleep(900);
  await js('document.activeElement&&document.activeElement.blur(); __dbg.ui("hideMenu()")'); const p0 = await js('JSON.stringify(__dbg.player.position)'); await js('__dbg.ui("startRoll()")'); await keyUp('Space'); await sleep(2600); r = await js(PROBE); const p1 = await js('JSON.stringify(__dbg.player.position)');
  { const a = JSON.parse(p0), b = JSON.parse(p1); if (Math.hypot(a.x - b.x, a.z - b.z) < .8) await issue('roll', 'Garden gate', 'the dodge roll did not move the player'); if (r && (r.nan || r.under)) await issue('roll', 'Garden gate', 'rolling left the player in a bad state'); }
  // world audit: nothing floating, nothing standing on stairs
  { const A = await js('JSON.stringify(__dbg.audit().filter(a=>!((a.x/10)**2+(a.z/7)**2<1.4)&&__dbg.lakeE(a.x,a.z)>1.2))'); for (const a of JSON.parse(A || '[]')) issues.push({ id: issues.length + 1, kind: a.kind, where: `(${a.x}, ${a.z})`, detail: (a.gap ? `bottom is ${a.gap} m above the ground; ` : '') + a.what }); }
  // sky
  await js('__dbg.setZone("sky",0,150,-64,Math.PI)'); await sleep(1500); r = await js(PROBE); await flickerCheck('Sky islands'); if (r && r.nan) issues.push({ id: issues.length + 1, kind: 'sky', where: 'Sky islands', detail: 'bad position' });
  const uniq = {}; const dedup = issues.filter(i => { const k = i.kind + '|' + i.where.replace(/\(.*\)/, ''); if (uniq[k]) { uniq[k]++; return false; } uniq[k] = 1; return true; });
  const report = { when: new Date().toISOString(), placesWalked: places.length, games: games.length, minFps: fpsMin, scriptErrors: [...new Set(errors)].slice(0, 30), issues: dedup.map(i => ({ ...i, count: uniq[i.kind + '|' + i.where.replace(/\(.*\)/, '')] })) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const md = [`# Playtest ${report.when}`, `Walked ${report.placesWalked} places, opened ${report.games} games. Min FPS (VM): ${fpsMin}.`, '', '## Script errors', ...(report.scriptErrors.length ? report.scriptErrors.map(e => '- ' + e) : ['- none']), '', '## Issues', ...(report.issues.length ? report.issues.map(i => `- **${i.kind}** at ${i.where} ×${i.count}: ${i.detail}`) : ['- none'])].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md); console.log(md); app.quit();
});
