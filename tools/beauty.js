// Sensei Hakuun beauty bot: takes composed shots of every area at midday and dusk, measures exposure, contrast,
// colour and clutter, finds crowded areas and things standing inside each other, and builds one contact sheet
// for a quick art-direction review. Cheap to review: one JPEG + one small JSON.
// Run: xvfb-run -a electron --no-sandbox tools/beauty.js   (writes $BEAUTY_OUT or /tmp/beauty)
const { app, BrowserWindow, nativeImage } = require('electron'); const fs = require('fs'); const path = require('path'); const http = require('http');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
const WEB = path.join(__dirname, '..', 'web'); const OUT = process.env.BEAUTY_OUT || '/tmp/beauty'; fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, r) => { const f = path.join(WEB, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); s.listen(0, '127.0.0.1', () => res(s.address().port)); });
// [name, camera position, look-at] — composed like screenshots a player would take
const VIEWS = [
  ['Garden gate', [4, 6, 40], [0, 2, 22]], ['Koi pond', [9, 7, 14], [0, 0, 0]], ['Tea house', [6, 5, 11], [17, 2, 15]], ['Dry garden', [22, 8, -8], [31, 0, 2]],
  ['Castle approach', [12, 9, -14], [34, 8, -40]], ['Shrine stairs', [6, 6, -30], [0, 9, -60]], ['Kumo Peak', [0, 10, -40], [-30, 18, -72]], ['Mirror Lake', [40, 7, 8], [62, 0, 22]],
  ['Night Market', [20, 8, 60], [8, 2, 76]], ['Golf to market walk', [40, 12, 30], [20, 0, 62]], ['Orchard', [-24, 7, 36], [-40, 2, 52]], ['Valley overview', [-70, 45, 70], [0, 0, 0]]];
app.whenReady().then(async () => {
  const port = await serve(); const w = new BrowserWindow({ width: 1280, height: 720, show: true, webPreferences: { backgroundThrottling: false } }); const sleep = ms => new Promise(r => setTimeout(r, ms)); const errors = [];
  w.webContents.on('console-message', (e, l, m) => { if (l >= 3) errors.push(m.slice(0, 200)); });
  await w.loadURL(`http://127.0.0.1:${port}/garden.html?dbg`); await sleep(4500); const js = c => w.webContents.executeJavaScript(c);
  await js('__dbg.enterGame()'); for (let i = 0; i < 40; i++) { if (await js('__dbg.natReady')) break; await sleep(500); } await sleep(2500);
  await js('document.querySelectorAll(".panel.show,#whisper").forEach(p=>p.classList.remove("show"))');
  const shots = [];
  for (const [i, [name, pos, tgt]] of VIEWS.entries()) { const hour = i % 3 === 2 ? 18.2 : 11; await js(`__dbg.hour(${hour})`); await sleep(700);
    const r = await js(`__dbg.shot(${JSON.stringify(pos)},${JSON.stringify(tgt)})`); const flags = [];
    if (r.m.lum < .2) flags.push('too dark'); if (r.m.crushed > .1) flags.push('crushed blacks'); if (r.m.blown > .03) flags.push('blown highlights'); if (r.m.contrast < .12) flags.push('flat / low contrast'); if (r.m.sat < .14) flags.push('washed out'); if (r.m.sat > .62) flags.push('oversaturated'); if (r.m.busy > .32) flags.push('visually cluttered');
    shots.push({ name, hour, ...r.m, flags }); fs.writeFileSync(path.join(OUT, `${String(i).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.jpg`), Buffer.from(r.img.split(',')[1], 'base64')); }
  // layout checks: crowded areas and things standing inside each other
  const layout = await js(`(()=>{ const d=__dbg, out={crowded:[],overlaps:[]}; const D=d.discoveries.filter(x=>x.r);
    for(let i=0;i<D.length;i++) for(let j=i+1;j<D.length;j++){ const a=D[i],b=D[j], g=Math.hypot(a.x-b.x,a.z-b.z)-(a.r+b.r); if(g<-1) out.crowded.push(a.n+' ↔ '+b.n+' (overlap '+(-g).toFixed(1)+' m)'); }
    const C=d.circles.filter(c=>!c.sky&&!c.peak&&!c.part&&c.r>.9), B=d.boxes; for(const c of C) for(const b of B){ const dx=c.x-b.x, dz=c.z-b.z, lx=dx*b.c-dz*b.s, lz=dx*b.s+dz*b.c; if(Math.abs(lx)<b.hw+c.r-.6&&Math.abs(lz)<b.hd+c.r-.6) out.overlaps.push('object r'+c.r.toFixed(1)+' at ('+c.x.toFixed(0)+','+c.z.toFixed(0)+') inside a building/wall'); }
    for(let i=0;i<C.length;i++) for(let j=i+1;j<C.length;j++){ const a=C[i],b=C[j]; if(Math.hypot(a.x-b.x,a.z-b.z)<(a.r+b.r)*.45) out.overlaps.push('two big objects merged at ('+a.x.toFixed(0)+','+a.z.toFixed(0)+')'); }
    out.overlaps=[...new Set(out.overlaps)].slice(0,25); out.crowded=out.crowded.slice(0,15); return out; })()`);
  // contact sheet: 4 x 3 at 400 x 225 with labels
  const sheet = await js(`(async()=>{ const files=${JSON.stringify(fs.readdirSync(OUT).filter(f => f.endsWith('.jpg') && /^\d\d-/.test(f)).sort())}; const c=document.createElement('canvas'); c.width=1600; c.height=675; const g=c.getContext('2d'); g.fillStyle='#111'; g.fillRect(0,0,1600,675); return files; })()`);
  const imgs = fs.readdirSync(OUT).filter(f => /^\d\d-.*\.jpg$/.test(f)).sort().map(f => nativeImage.createFromPath(path.join(OUT, f)).resize({ width: 400, height: 225 }));
  const W = 1600, Hh = 675, buf = Buffer.alloc(W * Hh * 4); imgs.forEach((im, k) => { const b = im.toBitmap(); const ox = (k % 4) * 400, oy = Math.floor(k / 4) * 225; for (let y = 0; y < 225; y++) b.copy(buf, ((oy + y) * W + ox) * 4, y * 400 * 4, (y + 1) * 400 * 4); });
  const sheetImg = nativeImage.createFromBitmap(buf, { width: W, height: Hh }); fs.writeFileSync(path.join(OUT, 'contact.jpg'), sheetImg.toJPEG(78));
  const report = { when: new Date().toISOString(), views: shots, layout, scriptErrors: [...new Set(errors)].slice(0, 10), legend: 'contact.jpg = 12 views left→right, top→bottom in the order of views[]' };
  fs.writeFileSync(path.join(OUT, 'beauty.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ flagged: shots.filter(s => s.flags.length).map(s => s.name + ': ' + s.flags.join(', ')), crowded: layout.crowded, overlaps: layout.overlaps.length, errors: report.scriptErrors.length }, null, 1)); app.quit();
});
