// Sensei Hakuun — app core. Downloaded from GitHub and loaded by the shell, so it can update itself.
module.exports = function core(ctx) {
  const { electron, app, webPath, readManifest, webDir, checkUpdates, fetchBuf, shellDir } = ctx;
  const { BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, nativeImage, dialog, Notification, session } = electron;
  const { WebSocket, selfsigned, QRCode } = ctx.deps;
  const path = require('path'), fs = require('fs'), os = require('os'), https = require('https'), crypto = require('crypto');
  const { spawn, execFile } = require('child_process');

  const GARDEN_URL = 'https://claude.ai/artifact/EaFRSKcNFcj5TfDwVXGoDE';
  const PORT = 47300;
  const UD = app.getPath('userData');
  const PRELOAD = path.join(shellDir, 'preload.js');
  const ICON = path.join(shellDir, 'icon.png');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let quitting = false; app.on('before-quit', () => { quitting = true; });

  /* ================= settings ================= */
  const SETTINGS = path.join(UD, 'settings.json');
  const DEFAULTS = { customFolders: [], overlay: 'swim', voice: true, voiceEngine: 'classic', voiceModel: 'ghost', voiceVolume: .9, echo: .55, autostart: true, sens: 16,
    alwaysOnTop: true, monitors: 'main', gardenUnloadMin: 15, token: null,
    hotkeys: { palette: 'Control+Shift+Space', summon: 'Control+Alt+S', listen: 'Control+Alt+Space', hide: 'Control+Shift+H', garden: 'Control+Shift+G' } };
  let settings = { ...DEFAULTS };
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }; } catch (e) {}
  settings.hotkeys = { ...DEFAULTS.hotkeys, ...(settings.hotkeys || {}) };
  if (!settings.token) settings.token = crypto.randomBytes(8).toString('hex');
  const saveSettings = () => { try { fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2)); } catch (e) {} };
  saveSettings();
  const publicSettings = () => ({ ...settings, token: undefined, version: app.getVersion(), web: (readManifest(webDir()) || {}).version, voiceReady: voiceReady(), earsReady: earsReady() });
  function broadcast(ch, data) { BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.webContents.send(ch, data); }); }

  // microphone for Sensei's ears (local pages only)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb((['media', 'audioCapture', 'microphone'].includes(perm) && /^file:/.test(wc.getURL())) || ['pointerLock', 'fullscreen'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ['media', 'audioCapture', 'microphone', 'pointerLock', 'fullscreen'].includes(perm));

  /* ================= downloads ================= */
  function download(url, dest, onProgress, redirects = 6) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'sensei-hakuun' }, timeout: 30000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects - 1)); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
        const total = +res.headers['content-length'] || 0; let got = 0, lastP = 0;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const out = fs.createWriteStream(dest);
        res.on('data', d => { got += d.length; const p = total ? got / total : 0; if (onProgress && p - lastP > .05) { lastP = p; onProgress(p); } });
        res.pipe(out); out.on('finish', () => out.close(() => resolve(dest))); out.on('error', reject);
      });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
    });
  }
  const unzip = (zip, dest) => new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { windowsHide: true, timeout: 180000 }, e => e ? rej(e) : res()));
  function findFile(dir, re, depth = 4) { let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
    for (const e of ents) { const p = path.join(dir, e.name); if (e.isFile() && re.test(e.name)) return p; }
    if (depth > 0) for (const e of ents) if (e.isDirectory()) { const f = findFile(path.join(dir, e.name), re, depth - 1); if (f) return f; } return null; }
  async function latestAsset(repo, name, fallback) {
    try { const rel = JSON.parse((await fetchBuf(`https://api.github.com/repos/${repo}/releases/latest`)).toString()); const a = (rel.assets || []).find(a => a.name === name); if (a) return a.browser_download_url; } catch (e) {}
    return fallback;
  }
  function say(text, kind = 'info') { broadcast('say', { kind, text }); }
  const LOG = path.join(UD, 'sensei.log');
  function log(...a) { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.map(x => x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); } catch (e) {} }
  ipcMain.on('openLog', () => shell.openPath(LOG));

  /* ================= Sensei's voice: Piper (natural neural voice, offline) ================= */
  const VOICE_DIR = path.join(UD, 'voice');
  const VOICES = {
    ghost: { file: 'en_GB-alan-medium', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/' },
    elder: { file: 'en_US-ryan-medium', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/' },
    north: { file: 'en_GB-northern_english_male-medium', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/' }
  };
  const voiceKey = () => VOICES[settings.voiceModel] ? settings.voiceModel : 'ghost';
  const piperExe = () => findFile(path.join(VOICE_DIR, 'piper'), /^piper\.exe$/i, 3);
  const voiceModelPath = () => path.join(VOICE_DIR, VOICES[voiceKey()].file + '.onnx');
  function voiceReady() { return !!(piperExe() && fs.existsSync(voiceModelPath()) && fs.existsSync(voiceModelPath() + '.json')); }
  let voiceSetup = null;
  function ensureVoice() {
    if (voiceReady()) return Promise.resolve(true);
    if (voiceSetup) return voiceSetup;
    voiceSetup = (async () => {
      try {
        if (!piperExe()) {
          say('Fetching my voice from the mountain… (one time, about 25 MB)', 'setup');
          const url = await latestAsset('rhasspy/piper', 'piper_windows_amd64.zip', 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip');
          const zip = path.join(VOICE_DIR, 'piper.zip'); await download(url, zip); await unzip(zip, path.join(VOICE_DIR, 'piper')); fs.rmSync(zip, { force: true });
        }
        const v = VOICES[voiceKey()];
        if (!fs.existsSync(voiceModelPath())) { say('Learning to speak… (one time, about 60 MB)', 'setup'); await download(v.url + v.file + '.onnx', voiceModelPath() + '.part', p => broadcast('setup-progress', { what: 'voice', p })); fs.renameSync(voiceModelPath() + '.part', voiceModelPath()); }
        if (!fs.existsSync(voiceModelPath() + '.json')) await download(v.url + v.file + '.onnx.json', voiceModelPath() + '.json');
        broadcast('settings', publicSettings());
        return true;
      } catch (e) { log('voice setup failed', e); say('My ghost voice could not be fetched: ' + e.message + '. I will use my classic voice.', 'error'); return false; }
      finally { voiceSetup = null; }
    })();
    return voiceSetup;
  }
  // text -> wav bytes; the pages add the ghostly echo, breath and depth with WebAudio
  async function synth(text) {
    if (!(await ensureVoice())) return null;
    const out = path.join(os.tmpdir(), 'sensei-say-' + Date.now() + '.wav');
    await new Promise((res, rej) => {
      const p = spawn(piperExe(), ['--model', voiceModelPath(), '--output_file', out, '--length_scale', '1.06', '--sentence_silence', '0.45'], { windowsHide: true });
      p.on('error', rej); p.on('exit', c => c === 0 ? res() : rej(new Error('piper exit ' + c)));
      p.stdin.write(String(text).replace(/[\u3040-\u30ff\u3400-\u9fff]+/g, '').slice(0, 1500) + '\n'); p.stdin.end();
    });
    const buf = fs.readFileSync(out); fs.rmSync(out, { force: true }); return buf;
  }

  /* ================= Sensei's ears: whisper.cpp (offline speech recognition) ================= */
  const EARS_DIR = path.join(UD, 'ears');
  const EARS_MODEL = path.join(EARS_DIR, 'ggml-base.en.bin');
  const whisperExe = () => findFile(path.join(EARS_DIR, 'bin'), /^whisper-cli\.exe$/i, 3);
  function earsReady() { return !!(whisperExe() && fs.existsSync(EARS_MODEL)); }
  let earsSetup = null, earsError = '';
  function ensureEars() {
    if (earsReady()) return Promise.resolve(true);
    if (earsSetup) return earsSetup;
    earsSetup = (async () => {
      try {
        if (!whisperExe()) {
          say('Opening my ears… (one time download, about 5 MB)', 'setup');
          // the newest whisper.cpp releases sometimes ship without Windows builds, so try known-good ones too
          const cands = [await latestAsset('ggml-org/whisper.cpp', 'whisper-bin-x64.zip', null), ...['v1.9.0', 'v1.8.3', 'v1.8.2', 'v1.7.6'].map(v => `https://github.com/ggml-org/whisper.cpp/releases/download/${v}/whisper-bin-x64.zip`)].filter(Boolean);
          const zip = path.join(EARS_DIR, 'w.zip'); let ok = false, lastErr = null;
          for (const url of cands) { try { log('ears: downloading', url); await download(url, zip); fs.rmSync(path.join(EARS_DIR, 'bin'), { recursive: true, force: true }); await unzip(zip, path.join(EARS_DIR, 'bin')); if (whisperExe()) { ok = true; break; } } catch (e) { lastErr = e; log('ears: failed', url, e); } }
          fs.rmSync(zip, { force: true });
          if (!ok) throw lastErr || new Error('no Windows build of whisper found');
        }
        if (!fs.existsSync(EARS_MODEL)) { say('Learning to listen… (one time, about 140 MB)', 'setup'); await download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin', EARS_MODEL + '.part', p => broadcast('setup-progress', { what: 'ears', p })); fs.renameSync(EARS_MODEL + '.part', EARS_MODEL); }
        broadcast('settings', publicSettings()); return true;
      } catch (e) { log('ears setup failed', e); earsError = e.message; say('My ears could not be opened: ' + e.message, 'error'); return false; }
      finally { earsSetup = null; }
    })();
    return earsSetup;
  }
  async function transcribe(wav, hint) {
    if (!(await ensureEars())) return '';
    const f = path.join(os.tmpdir(), 'sensei-hear-' + Date.now() + '.wav'); fs.writeFileSync(f, Buffer.from(wav));
    const text = await new Promise(res => execFile(whisperExe(), ['-m', EARS_MODEL, '-f', f, '-nt', '-np', '-l', 'en', '-bs', '5', '-t', String(Math.max(2, Math.min(8, os.cpus().length - 1))), ...(hint ? ['--prompt', String(hint).slice(0, 600)] : [])], { windowsHide: true, timeout: 90000, maxBuffer: 1 << 20 },
      (e, out, err) => { if (e) log('whisper error', e, String(err || '').slice(-600)); res(String(out || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()); }));
    fs.rmSync(f, { force: true }); return text;
  }

  /* ================= Sensei's mind: claude.ai, through your plan ================= */
  let brain = null;
  function stripUA(wc) { wc.setUserAgent(wc.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?sensei-hakuun\/\S+/i, '')); }
  function ensureBrain(show) {
    if (!brain || brain.isDestroyed()) {
      brain = new BrowserWindow({ width: 980, height: 760, title: "Sensei's mind — sign in to claude.ai", show: !!show, autoHideMenuBar: true, backgroundColor: '#0b1026',
        webPreferences: { partition: 'persist:sensei', backgroundThrottling: false } });
      stripUA(brain.webContents);
      brain.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com|google\.com|apple\.com)\//.test(url)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
      brain.on('close', e => { if (!quitting) { e.preventDefault(); ghostBrain(); } });
      if (!show) brain.once('ready-to-show', () => ghostBrain());
      // after a sign-in finishes anywhere on claude.ai, come back to Sensei's mind page
      const back = (ev, url) => { try { const u = new URL(url); if (u.hostname.endsWith('claude.ai') && !/^\/(login|magic-link|logout|onboarding|verify)/.test(u.pathname) && !url.startsWith(GARDEN_URL) && brain.__wantMind) { signedIn().then(ok => { if (ok) { brain.__wantMind = false; log('mind: signed in, loading brain page'); brain.loadURL(GARDEN_URL + '#brain'); } }); } } catch (e) {} };
      brain.webContents.on('did-navigate', back); brain.webContents.on('did-navigate-in-page', back);
      brain.webContents.on('did-finish-load', () => { autoWake(); });
      signedIn().then(ok => { if (ok) brain.loadURL(GARDEN_URL + '#brain'); else { brain.__wantMind = true; brain.loadURL('https://claude.ai/login'); if (!show) { /* nothing to wait for until he signs in */ } } });
      if (show) brain.once('ready-to-show', () => showBrain());
    } else if (show) {
      signedIn().then(ok => { if (!ok) { brain.__wantMind = true; brain.loadURL('https://claude.ai/login'); } });
      showBrain();
    }
    return brain;
  }
  // claude.ai only runs the mind page while its window counts as visible, so when hidden it stays "shown" but fully transparent, tiny and off the taskbar
  function ghostBrain() { if (!brain || brain.isDestroyed()) return; try { brain.setSkipTaskbar(true); brain.setOpacity(0.01); brain.setIgnoreMouseEvents(true); const d = screen.getPrimaryDisplay().workArea; brain.setBounds({ x: d.x + d.width - 420, y: d.y + d.height - 320, width: 400, height: 300 }); brain.setFocusable(false); if (!brain.isVisible()) brain.showInactive(); brain.__ghost = true; } catch (e) { log('ghost brain', e); } }
  function showBrain() { if (!brain || brain.isDestroyed()) return; try { brain.setIgnoreMouseEvents(false); brain.setFocusable(true); brain.setSkipTaskbar(false); brain.setOpacity(1); brain.setSize(980, 760); brain.center(); brain.__ghost = false; brain.show(); brain.focus(); } catch (e) { log('show brain', e); } }
  async function signedIn() { try { const c = await session.fromPartition('persist:sensei').cookies.get({ url: 'https://claude.ai', name: 'sessionKey' }); return c.length > 0; } catch (e) { return false; } }
  // the mind page needs one click the first time; press it for him once he is signed in
  let waking = false;
  async function autoWake() { if (waking) return; waking = true; const t0 = Date.now();
    try { for (let i = 0; i < 90; i++) { await sleep(i < 20 ? 400 : 1000); if (!brain || brain.isDestroyed()) return; if (await brainFrame()) { log('mind: awake in', Date.now() - t0, 'ms'); broadcast('mind', { awake: true }); return; }
      for (const f of brain.webContents.mainFrame.framesInSubtree) { try { await f.executeJavaScript('(async()=>{ if(typeof window.__startBrain==="function"&&!window.__brainCalled){ window.__brainCalled=1; window.__startBrain(); } const b=document.getElementById("sbGo"); if(b&&!window.__clicked){ window.__clicked=1; b.click(); } })()', true); } catch (e) {} }
      // claude.ai asks once per artifact version whether it may use Claude; that prompt lives on the host page, outside the artifact frame
      try { const hit = await brain.webContents.executeJavaScript(`(()=>{ const ds=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[data-state="open"]')]; for(const d of ds){ for(const b of d.querySelectorAll('button')){ const t=(b.innerText||'').trim(); if(/^(always allow|allow always|allow|continue|approve|run|trust|accept|got it|confirm)\\b/i.test(t)&&!b.disabled){ b.click(); return t+' | '+(d.innerText||'').slice(0,160).replace(/\\s+/g,' '); } } } return ''; })()`, true); if (hit) log('mind: pressed host prompt:', hit); } catch (e) {}
      if (i === 25) { const st = await mindStage(); log('mind: still asleep after ~20s, stage:', st); }
      if (i === 45) { log('mind: still asleep after ~45s:', await mindStage()); broadcast('mind', { awake: false, stuck: true }); } } }
    finally { waking = false; } }
  async function mindStage() { if (!brain || brain.isDestroyed()) return 'no window'; let url = ''; try { url = brain.webContents.getURL(); } catch (e) {} for (const f of brain.webContents.mainFrame.framesInSubtree) { try { const st = await f.executeJavaScript('window.__sb ? (window.__sb.ready ? "ready" : (window.__sb.stage||"not ready")) : ""'); if (st) return st + ' @ ' + url; } catch (e) {} } return 'mind page not loaded @ ' + url; }
  // keep the mind warm: wake it as soon as the app starts (if signed in), and quietly revive it if it ever falls asleep
  let mindMisses = 0;
  async function brainWatch() { try { if (!(await signedIn())) return; if (!brain || brain.isDestroyed()) { ensureBrain(false); return; }
      if (await brainFrame()) { mindMisses = 0; return; } if (waking) return; mindMisses++;
      if (mindMisses >= 2) { mindMisses = 0; log('mind: asleep, reloading'); brain.loadURL(GARDEN_URL + '#brain'); } else autoWake(); } catch (e) { log('mind watch', e); } }
  async function brainFrame() {
    if (!brain || brain.isDestroyed()) return null;
    for (const f of brain.webContents.mainFrame.framesInSubtree) { try { if (await f.executeJavaScript('!!(window.__sb && window.__sb.ready)')) return f; } catch (e) {} }
    return null;
  }
  async function brainJS(js) {
    ensureBrain(false); const t0 = Date.now(); let f;
    while (!(f = await brainFrame())) { if (Date.now() - t0 > 30000) { const e = new Error("Sensei's mind is asleep. Open Settings → Sensei's mind and sign in."); e.code = 'mind_asleep'; throw e; } await sleep(800); }
    return await f.executeJavaScript(js, true);
  }
  ipcMain.handle('brain:start', async (e, { id, kind, input, opts }) => {
    const wc = e.sender;
    try { await brainJS(`window.__sb.start(${JSON.stringify(id)},${JSON.stringify(kind)},${JSON.stringify(input)},${JSON.stringify(opts || {})})`); }
    catch (err) { wc.send('brain:stream', { id, done: true, error: { code: err.code || 'unavailable', message: err.message } }); return false; }
    (async () => { const t0 = Date.now(); let last = '';
      while (Date.now() - t0 < (kind === 'json' ? 120000 : 100000)) { await sleep(220); let r; try { r = await brainJS(`window.__sb.peek(${JSON.stringify(id)})`); } catch (err) { r = { done: true, error: { code: 'unavailable', message: err.message } }; }
        if (!r) continue; if (wc.isDestroyed()) return;
        if (r.text && r.text !== last) { last = r.text; wc.send('brain:stream', { id, text: r.text }); }
        if (r.done) { wc.send('brain:stream', { id, done: true, result: r.result, error: r.error }); return; } }
      if (!wc.isDestroyed()) wc.send('brain:stream', { id, done: true, error: { code: 'timeout', message: 'Sensei took too long to answer.' } }); })();
    return true;
  });
  ipcMain.handle('brain:db', async (e, q) => {
    try {
      if (q.op === 'get') return await brainJS(`window.__sb.dbGet(${JSON.stringify(q.path)})`);
      if (q.op === 'set' || q.op === 'update') return await brainJS(`window.__sb.dbSet(${JSON.stringify(q.path)},${JSON.stringify(q.data)})`);
      if (q.op === 'list') return await brainJS(`window.__sb.dbList(${JSON.stringify(q.coll)},${JSON.stringify(q.orderBy || null)},${JSON.stringify(q.dir || 'asc')},${+q.limit || 60})`);
    } catch (err) { return { error: err.message }; }
  });
  ipcMain.handle('brain:status', async () => { const si = await signedIn(); if (!si) return { awake: false, signedIn: false }; ensureBrain(false); let f = null; const t0 = Date.now(); while (!(f = await brainFrame().catch(() => null)) && Date.now() - t0 < 4000) await sleep(400); if (!f) autoWake(); return { awake: !!f, signedIn: true, waking: !f, stage: f ? '' : await mindStage() }; });

  /* ================= windows ================= */
  let overlay = null, palette = null, pairWin = null, garden = null, setWin = null, tray = null, gardenUnloadT = null;
  // Sensei lives in a transparent, click-through layer over the chosen monitor(s); only the small square around him is drawn.
  function overlayBounds() {
    const ds = settings.monitors === 'all' ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    ds.forEach(d => { l = Math.min(l, d.bounds.x); t = Math.min(t, d.bounds.y); r = Math.max(r, d.bounds.x + d.bounds.width); b = Math.max(b, d.bounds.y + d.bounds.height); });
    return { x: l, y: t, width: r - l, height: b - t };
  }
  function layout() {
    const ds = settings.monitors === 'all' ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
    const pd = screen.getPrimaryDisplay(), o = overlay && !overlay.isDestroyed() ? overlay.getBounds() : overlayBounds();
    return { origin: { x: o.x, y: o.y }, rects: ds.map(d => ({ x: d.workArea.x, y: d.workArea.y, w: d.workArea.width, h: d.workArea.height })), primary: { x: pd.workArea.x, y: pd.workArea.y, w: pd.workArea.width, h: pd.workArea.height } };
  }
  function pushLayout() { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('layout', layout()); }
  function createOverlay() {
    overlay = new BrowserWindow({ ...overlayBounds(), transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      alwaysOnTop: !!settings.alwaysOnTop, skipTaskbar: true, focusable: false, hasShadow: false, enableLargerThanScreen: true,
      backgroundColor: '#00000000', show: false, webPreferences: { preload: PRELOAD, backgroundThrottling: false } });
    applyOnTop(); overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.loadFile(webPath('overlay.html'));
    overlay.webContents.on('did-finish-load', pushLayout);
    overlay.once('ready-to-show', () => { if (settings.overlay !== 'hidden') overlay.showInactive(); });
  }
  // clicking Sensei: the app watches the cursor itself and makes the layer clickable only while it is over him or his menu
  let hit = null, clickable = false;
  ipcMain.on('overlay:hit', (e, h) => { hit = h; });
  setInterval(() => {
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible() || !hit) return;
    const c = screen.getCursorScreenPoint(), o = overlay.getBounds();
    const inside = (Array.isArray(hit) ? hit : [hit]).some(h => h && Math.hypot(c.x - (o.x + h.x), c.y - (o.y + h.y)) < h.r);
    if (inside !== clickable) { clickable = inside; overlay.setIgnoreMouseEvents(!inside, { forward: true }); overlay.webContents.send('hover', inside); }
  }, 60);
  function applyOnTop() { if (!overlay || overlay.isDestroyed()) return; if (settings.alwaysOnTop) { overlay.setAlwaysOnTop(true, 'screen-saver'); overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } else overlay.setAlwaysOnTop(false); }
  function applyMonitors() { if (overlay && !overlay.isDestroyed()) overlay.setBounds(overlayBounds()); setTimeout(pushLayout, 200); }
  screen.on('display-added', applyMonitors); screen.on('display-removed', applyMonitors); screen.on('display-metrics-changed', applyMonitors);

  // full-screen pointer layer: exists only while the phone pointer or calibration is in use
  let ptrWin = null, ptrIdleT = null;
  function ensurePtrWin() {
    clearTimeout(ptrIdleT); ptrIdleT = setTimeout(() => { if (ptrWin && !ptrWin.isDestroyed() && !calibStep) { ptrWin.destroy(); ptrWin = null; } }, 6000);
    if (ptrWin && !ptrWin.isDestroyed()) return ptrWin;
    const b = allBounds();
    ptrWin = new BrowserWindow({ x: b.l, y: b.t, width: b.r - b.l + 1, height: b.b - b.t + 1, transparent: true, frame: false, focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
      resizable: false, movable: false, enableLargerThanScreen: true, backgroundColor: '#00000000', show: false, webPreferences: { preload: PRELOAD } });
    ptrWin.setAlwaysOnTop(true, 'screen-saver'); ptrWin.setIgnoreMouseEvents(true);
    ptrWin.loadFile(webPath('pointer.html')); ptrWin.once('ready-to-show', () => ptrWin && ptrWin.showInactive());
    return ptrWin;
  }

  function createPalette() {
    const d = screen.getPrimaryDisplay().workArea;
    palette = new BrowserWindow({ width: 680, height: 470, x: Math.round(d.x + (d.width - 680) / 2), y: Math.round(d.y + d.height * .16), frame: false, transparent: true, resizable: false, show: false,
      skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000', webPreferences: { preload: PRELOAD } });
    palette.loadFile(webPath('palette.html'));
    palette.on('blur', () => { if (palette && palette.isVisible()) palette.hide(); });
  }
  function togglePalette(show) {
    if (!palette || palette.isDestroyed()) createPalette();
    if (show === false || (show === undefined && palette.isVisible())) { palette.hide(); return; }
    palette.show(); palette.focus(); palette.webContents.send('palette:open');
  }
  function simpleWin(ref, file, opts) {
    if (ref && !ref.isDestroyed()) { ref.show(); ref.focus(); return ref; }
    const w = new BrowserWindow({ autoHideMenuBar: true, backgroundColor: '#0b0f22', webPreferences: { preload: PRELOAD }, ...opts });
    w.loadFile(webPath(file)); return w;
  }
  const openPair = () => { pairWin = simpleWin(pairWin, 'pair.html', { width: 520, height: 760, title: 'Connect your phone — Sensei' }); };
  const openSettings = () => { setWin = simpleWin(setWin, 'settings.html', { width: 560, height: 820, title: 'Settings — Sensei Hakuun', backgroundColor: '#efe4c9' }); };
  function openGarden() {
    clearTimeout(gardenUnloadT);
    if (garden && !garden.isDestroyed()) { garden.show(); garden.focus(); return; }
    garden = new BrowserWindow({ width: 1360, height: 860, fullscreen: true, title: 'Sensei Hakuun — The Garden', autoHideMenuBar: true, backgroundColor: '#0b1026', show: false,
      webPreferences: { preload: PRELOAD, backgroundThrottling: true } });
    // Taiko "live" mode: let the garden hear what the PC is playing (system audio loopback, no picker dialog)
    try { garden.webContents.session.setDisplayMediaRequestHandler((req, cb) => { electron.desktopCapturer.getSources({ types: ['screen'] }).then(src => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({})); }); } catch (e) { log('loopback', e); }
    garden.loadFile(webPath('garden.html'));
    garden.webContents.on('before-input-event', (e, inp) => { if (inp.type === 'keyDown' && inp.key === 'F11') { garden.setFullScreen(!garden.isFullScreen()); e.preventDefault(); } });
    garden.once('ready-to-show', () => { garden.show(); garden.focus(); });
    garden.on('close', e => {
      if (quitting) return; e.preventDefault(); garden.hide();          // hidden = frozen: rendering and sound stop
      clearTimeout(gardenUnloadT);
      gardenUnloadT = setTimeout(() => { if (garden && !garden.isDestroyed() && !garden.isVisible()) { garden.destroy(); garden = null; } }, Math.max(1, settings.gardenUnloadMin) * 60000);
    });
    garden.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  }
  function reloadUI() {
    [[overlay, 'overlay.html'], [palette, 'palette.html'], [pairWin, 'pair.html'], [setWin, 'settings.html'], [ptrWin, 'pointer.html']].forEach(([w, f]) => { if (w && !w.isDestroyed()) w.loadFile(webPath(f)); });
    if (garden && !garden.isDestroyed() && !garden.isVisible()) { garden.destroy(); garden = null; }
  }

  /* ================= launcher catalog ================= */
  const regQuery = (key, val) => new Promise(r => execFile('reg', ['query', key, '/v', val], { windowsHide: true }, (e, out) => { if (e) return r(null); const m = String(out).match(new RegExp(val + '\\s+REG_\\w+\\s+(.+)')); r(m ? m[1].trim() : null); }));
  function walk(dir, depth, out, ext, skip) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth > 0 && !(skip && skip.test(e.name))) walk(p, depth - 1, out, ext, skip); } else if (ext.test(e.name)) out.push(p);
      if (out.length > 4000) return; }
  }
  async function steamGames() {
    const sp = (await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || 'C:/Program Files (x86)/Steam';
    const libs = new Set([path.join(sp, 'steamapps')]);
    try { const vdf = fs.readFileSync(path.join(sp, 'steamapps', 'libraryfolders.vdf'), 'utf8'); for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps')); } catch (e) {}
    const games = [];
    for (const lib of libs) { let files = []; try { files = fs.readdirSync(lib); } catch (e) { continue; }
      for (const f of files) { if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
        try { const t = fs.readFileSync(path.join(lib, f), 'utf8'); const id = (t.match(/"appid"\s+"(\d+)"/) || [])[1], name = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
          if (id && name && !/Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR/i.test(name)) games.push({ type: 'steam', name, id, launch: 'steam://rungameid/' + id }); } catch (e) {} } }
    return games;
  }
  function startMenuApps() {
    const dirs = [path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs'), path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs')];
    const out = []; dirs.forEach(d => walk(d, 3, out, /\.(lnk|url)$/i)); const seen = new Set();
    return out.filter(p => !/uninstall|readme|help|documentation|website|manual|release notes|license/i.test(path.basename(p)))
      .map(p => ({ type: 'app', name: path.basename(p).replace(/\.(lnk|url)$/i, ''), launch: p }))
      .filter(a => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function folderGames() {
    const out = [];
    for (const f of settings.customFolders) { const ex = []; walk(f, 3, ex, /\.(exe|lnk|url)$/i, /^(\.|_CommonRedist|redist|DirectX|vcredist|__)/i);
      ex.filter(p => !/unins|setup|crash|redist|vc_|dxsetup|helper|report|install|updater|cefprocess|UnityCrash|BsSndRpt/i.test(path.basename(p)))
        .forEach(p => out.push({ type: 'game', name: path.basename(p).replace(/\.(exe|lnk|url)$/i, ''), where: path.basename(path.dirname(p)), launch: p })); }
    return out;
  }
  let catalog = [];
  async function rescan() { try { catalog = [...(await steamGames()), ...folderGames(), ...startMenuApps()]; } catch (e) {} return catalog; }
  function launchItem(item) {
    if (!item || !item.launch) return;
    if (/^(steam|https?|spotify|ms-settings):/i.test(item.launch)) shell.openExternal(item.launch); else shell.openPath(item.launch);
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('say', { kind: 'launch', name: item.name });
  }

  /* ================= mouse & keys via user32 (one PowerShell process) ================= */
  let ps = null;
  function psStart() {
    if (process.platform !== 'win32' || ps) return;
    ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    ps.stdin.write("Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class SM{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,int d,UIntPtr e);[DllImport(\"user32.dll\")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}'\n");
    ps.on('exit', () => { ps = null; }); ps.on('error', () => { ps = null; }); ps.stdin.on('error', () => {});
  }
  const psRun = cmd => { if (!ps) psStart(); if (ps) try { ps.stdin.write(cmd + '\n'); } catch (e) {} };
  const Z = '[UIntPtr]::Zero';
  const mouse = { down: b => psRun(`[SM]::mouse_event(${b === 'right' ? 8 : 2},0,0,0,${Z})`), up: b => psRun(`[SM]::mouse_event(${b === 'right' ? 16 : 4},0,0,0,${Z})`),
    wheel: d => psRun(`[SM]::mouse_event(2048,0,0,${Math.round(d)},${Z})`), key: vk => psRun(`[SM]::keybd_event(${vk},0,0,${Z});[SM]::keybd_event(${vk},0,2,${Z})`),
    keyDown: vk => psRun(`[SM]::keybd_event(${vk},0,0,${Z})`), keyUp: vk => psRun(`[SM]::keybd_event(${vk},0,2,${Z})`) };
  let cursor = null, lastSent = '', pointerSeen = 0, calibStep = null;
  function allBounds() { const ds = screen.getAllDisplays(); let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    ds.forEach(d => { l = Math.min(l, d.bounds.x); t = Math.min(t, d.bounds.y); r = Math.max(r, d.bounds.x + d.bounds.width); b = Math.max(b, d.bounds.y + d.bounds.height); }); return { l, t, r: r - 1, b: b - 1 }; }
  setInterval(() => {
    if (!cursor || Date.now() - pointerSeen > 1600) return;
    const k = Math.round(cursor.x) + ',' + Math.round(cursor.y);
    if (k === lastSent) return; lastSent = k; psRun(`[SM]::SetCursorPos(${Math.round(cursor.x)},${Math.round(cursor.y)})`);
    const w = ensurePtrWin(); if (w && !w.isDestroyed()) { const o = w.getBounds(); w.webContents.send('pointer', { x: cursor.x - o.x, y: cursor.y - o.y }); }
  }, 16);

  /* ================= phone remote server ================= */
  function lanIP() { const all = []; for (const n of Object.values(os.networkInterfaces())) for (const a of n || []) if (a.family === 'IPv4' && !a.internal) all.push(a.address);
    return all.find(a => /^192\.168\./.test(a)) || all.find(a => /^10\./.test(a)) || all.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) || all[0] || '127.0.0.1'; }
  function getCert() { const p = path.join(UD, 'cert.json'); try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
    const pems = selfsigned.generate([{ name: 'commonName', value: 'sensei-hakuun.local' }], { days: 3650, keySize: 2048, algorithm: 'sha256' }); fs.writeFileSync(p, JSON.stringify(pems)); return pems; }
  const remotes = new Set();
  const remoteURL = () => `https://${lanIP()}:${PORT}/?k=${settings.token}`;
  function startServer() {
    const pems = getCert();
    const srv = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
      const u = new URL(req.url, 'https://x');
      if (u.pathname === '/' || u.pathname === '/remote') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); try { res.end(fs.readFileSync(webPath('remote.html'))); } catch (e) { res.end('missing'); } }
      else if (u.pathname === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); try { res.end(fs.readFileSync(ICON)); } catch (e) { res.end(); } }
      else { res.writeHead(404); res.end(); }
    });
    const wss = new WebSocket.Server({ server: srv, maxPayload: 8 * 1024 * 1024 });
    wss.on('connection', (ws, req) => {
      const u = new URL(req.url, 'https://x'); if (u.searchParams.get('k') !== settings.token) { ws.close(4001, 'bad key'); return; }
      ws.pid = (u.searchParams.get('id') || Math.random().toString(36).slice(2)).slice(0, 40); ws.alive = true; ws.on('pong', () => { ws.alive = true; });
      for (const r of [...remotes]) if (r.pid === ws.pid) { remotes.delete(r); try { r.terminate(); } catch (e) {} }   // same phone reconnecting: drop the stale socket
      remotes.add(ws); assignPlayer(ws, (settings.playerPrefs || {})[ws.pid]);
      ws.on('message', m => { let d; try { d = JSON.parse(m); } catch (e) { return; } if (d.t === 'player') { assignPlayer(ws, d.want === 2 ? 2 : 1, true); return; } handleRemote(d, ws); });
      ws.on('close', () => { remotes.delete(ws); notifyRemote(); if (calibOwner === ws) handleRemote({ t: 'calib', step: 'done' }, null); });
    });
    srv.on('error', e => say('The phone remote could not start: ' + e.message, 'error'));
    srv.listen(PORT, '0.0.0.0');
  }
  setInterval(() => { for (const r of [...remotes]) { if (!r.alive) { remotes.delete(r); try { r.terminate(); } catch (e) {} notifyRemote(); continue; } r.alive = false; try { r.ping(); } catch (e) {} } }, 15000);
  function hello(r) { try { r.send(JSON.stringify({ t: 'hello', sens: settings.sens, player: r.player, phones: remotes.size })); } catch (e) {} }
  // one phone = player 1, a second phone = player 2. A phone can ask for a slot; the other phone swaps.
  function assignPlayer(ws, want, explicit) { const others = [...remotes].filter(r => r !== ws); const holder = want ? others.find(r => r.player === want) : null;
    if (want && holder) { if (explicit) { holder.player = ws.player && ws.player !== want ? ws.player : (want === 1 ? 2 : 1); hello(holder); ws.player = want; } else ws.player = want === 1 ? 2 : 1; }
    else if (want) ws.player = want; else { const taken = new Set(others.map(r => r.player)); ws.player = taken.has(1) ? 2 : 1; }
    if (explicit) { settings.playerPrefs = { ...(settings.playerPrefs || {}), [ws.pid]: ws.player }; saveSettings(); }
    remotes.forEach(hello); notifyRemote(); log('remote players', [...remotes].map(r => r.pid.slice(0, 6) + ':P' + r.player).join(' ')); }
  const isP2 = ws => ws && ws.player === 2 && [...remotes].some(r => r !== ws && r.player === 1);
  function notifyRemote() { broadcast('remote', { connected: remotes.size, players: [...remotes].map(r => r.player) }); }
  const VK = { plus: 0xAF, minus: 0xAE, one: 0xB3, two: 0x1B, up: 0x26, down: 0x28, left: 0x25, right: 0x27, enter: 0x0D, tab: 0x09, next: 0xB0, prev: 0xB1 };
  let calibOwner = null, calibTimer = null;
  let gardenMode = {}; ipcMain.on('garden:mode', (e, m) => { gardenMode = { ...gardenMode, ...(m || {}) }; });
  // mouse capture for the garden's mouse-look, asked for from the main process so it counts as a user gesture
  ipcMain.on('garden:lock', (e, on) => { try { if (!garden || garden.isDestroyed()) return; if (on && !garden.isFocused()) garden.focus(); garden.webContents.executeJavaScript(on ? 'new Promise((ok,no)=>{ const c=document.getElementById("c"); const r=c.requestPointerLock(); if(r&&r.then) r.then(()=>ok("locked"),err=>no(String(err))); else ok("requested"); })' : 'document.exitPointerLock()', true).then(r => { if (on) log('pointer lock:', r); }).catch(err => log('pointer lock failed:', err && err.message)); } catch (err) { log('pointer lock error', err.message); } });
  ipcMain.on('garden:dbg', (e, m) => log('garden:', String(m).slice(0, 300)));
  // while the garden is open, both remotes are locked to the screen it is on
  function gameOpen() { return garden && !garden.isDestroyed() && garden.isVisible() && !garden.isMinimized(); }
  function gameRect() { if (gameOpen()) { if (garden.isFullScreen()) return screen.getDisplayMatching(garden.getBounds()).bounds; return garden.getContentBounds(); } return screen.getPrimaryDisplay().bounds; }
  function handleRemote(d, ws) {
    if (isP2(ws)) { // player two never moves your real mouse: everything goes to the garden
      if (garden && !garden.isDestroyed() && garden.isVisible() && /^(down|up|press|aim|move|joy)$/.test(d.t)) garden.webContents.send('p2', d);
      if (/^(aim|move|down|up|press|joy)$/.test(d.t)) return; }
    // player one's stick and d-pad go straight into the garden while it is open (no fake key presses needed)
    if (gameOpen() && (d.t === 'joy' || ((d.t === 'down' || d.t === 'up') && /^(up|down|left|right)$/.test(d.b)))) { garden.webContents.send('p1', d); return; }
    if (gameOpen() && gardenMode.golf && (d.t === 'down' || d.t === 'up') && /^(a|b)$/.test(d.b)) { garden.webContents.send('p1', d); return; }
    if (d.t === 'joy') { const gr = gameRect(), b = allBounds(); if (!cursor) { const p = screen.getCursorScreenPoint(); cursor = { x: p.x, y: p.y }; } const sp = 18; cursor.x = Math.max(b.l, Math.min(b.r, cursor.x + (+d.x || 0) * sp)); cursor.y = Math.max(b.t, Math.min(b.b, cursor.y + (+d.y || 0) * sp)); pointerSeen = Date.now(); return; }
    switch (d.t) {
      case 'move': { const gr = gameRect(), b = gameOpen() ? { l: gr.x, r: gr.x + gr.width - 1, t: gr.y, b: gr.y + gr.height - 1 } : allBounds(); if (!cursor) { const p = screen.getCursorScreenPoint(); cursor = { x: p.x, y: p.y }; }
        cursor.x = Math.max(b.l, Math.min(b.r, cursor.x + (+d.dx || 0))); cursor.y = Math.max(b.t, Math.min(b.b, cursor.y + (+d.dy || 0))); pointerSeen = Date.now(); break; }
      case 'aim': { // absolute: x,y in -1..1 relative to the main monitor
        const pd = gameRect(), g = gameOpen(), b = g ? { l: pd.x, r: pd.x + pd.width - 1, t: pd.y, b: pd.y + pd.height - 1 } : allBounds();
        cursor = { x: Math.round(Math.max(b.l, Math.min(b.r, pd.x + pd.width / 2 + (+d.x || 0) * pd.width / 2))), y: Math.round(Math.max(b.t, Math.min(b.b, pd.y + pd.height / 2 + (+d.y || 0) * pd.height / 2))) };
        pointerSeen = Date.now(); break; }
      case 'calib': { calibStep = d.step && d.step !== 'done' ? d.step : null; calibOwner = calibStep ? ws : null; clearTimeout(calibTimer); if (calibStep) calibTimer = setTimeout(() => handleRemote({ t: 'calib', step: 'done' }, null), 60000); const w = ensurePtrWin(); const pd = gameRect();
        const send = () => { if (w && !w.isDestroyed()) { const o = w.getBounds(); w.webContents.send('calib', { step: d.step, fx: d.fx, fy: d.fy, n: d.n, primary: { x: pd.x - o.x, y: pd.y - o.y, w: pd.width, h: pd.height } }); } };
        if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send(); break; }
      case 'center': { const pd = gameRect(); cursor = { x: pd.x + pd.width / 2, y: pd.y + pd.height / 2 }; pointerSeen = Date.now(); break; }
      case 'down': if (d.b === 'a') mouse.down('left'); else if (d.b === 'b') mouse.down('right'); else if (VK[d.b]) mouse.keyDown(VK[d.b]); break;
      case 'up': if (d.b === 'a') mouse.up('left'); else if (d.b === 'b') mouse.up('right'); else if (VK[d.b]) mouse.keyUp(VK[d.b]); break;
      case 'scroll': mouse.wheel(-(+d.dy || 0) * 3); break;
      case 'press':
        if (d.b === 'home') togglePalette(true);
        else if (d.b === 'sensei') { if (overlay) overlay.webContents.send('summon'); }
        else if (d.b === 'garden') openGarden();
        else if (VK[d.b]) mouse.key(VK[d.b]);
        break;
      case 'sens': settings.sens = Math.max(4, Math.min(40, +d.v || 16)); saveSettings(); break;
      case 'type': togglePalette(true); setTimeout(() => palette && palette.webContents.send('palette:type', String(d.text || '').slice(0, 200)), 150); break;
      case 'listen': if (overlay) overlay.webContents.send('listen', { from: 'phone', state: d.state }); break;
      case 'audio': if (overlay && typeof d.data === 'string' && d.data.length < 8e6) overlay.webContents.send('phone-audio', { data: d.data, mime: d.mime }); break;
    }
  }

  /* ================= IPC ================= */
  ipcMain.on('open', (e, what) => { ({ garden: openGarden, palette: () => togglePalette(true), pair: openPair, settings: openSettings, mind: () => ensureBrain(true) })[what]?.(); });
  ipcMain.on('palette:hide', () => togglePalette(false));
  ipcMain.on('remote:buzz', (e, b) => { const msg = JSON.stringify({ t: 'buzz', p: (b && b.pat) || [20] }); remotes.forEach(r => { if (!b || !b.player || r.player === b.player) { try { r.send(msg); } catch (err) {} } }); });
  ipcMain.handle('remote:players', () => [...remotes].map(r => r.player));
  ipcMain.handle('asset', async (e, rel) => { rel = String(rel || '').replace(/\\/g, '/'); if (!/^assets\/[\w.-]+$/.test(rel)) return null; try { return fs.readFileSync(webPath(rel)); } catch (err) { log('asset', rel, err.message); return null; } });
  ipcMain.handle('catalog', async (e, fresh) => (fresh || !catalog.length) ? await rescan() : catalog);
  ipcMain.on('launch', (e, item) => { launchItem(item); togglePalette(false); });
  ipcMain.on('openExternal', (e, url) => { if (/^(https?|steam|spotify):/i.test(url)) shell.openExternal(url); togglePalette(false); });
  ipcMain.on('key', (e, k) => { if (VK[k]) mouse.key(VK[k]); });
  ipcMain.handle('addFolder', async () => {
    const r = await dialog.showOpenDialog({ title: 'Add a game folder', properties: ['openDirectory', 'multiSelections'] }); if (r.canceled) return settings.customFolders;
    r.filePaths.forEach(p => { if (!settings.customFolders.includes(p)) settings.customFolders.push(p); }); saveSettings(); await rescan(); broadcast('settings', publicSettings()); return settings.customFolders;
  });
  ipcMain.handle('removeFolder', async (e, p) => { settings.customFolders = settings.customFolders.filter(x => x !== p); saveSettings(); await rescan(); broadcast('settings', publicSettings()); return settings.customFolders; });
  ipcMain.handle('settings', () => publicSettings());
  ipcMain.handle('setSetting', (e, k, v) => {
    if (!['overlay', 'voice', 'voiceEngine', 'voiceModel', 'voiceVolume', 'echo', 'autostart', 'sens', 'alwaysOnTop', 'monitors', 'gardenUnloadMin'].includes(k)) return publicSettings();
    settings[k] = v; saveSettings();
    if (k === 'overlay') applyOverlayMode();
    if (k === 'autostart') app.setLoginItemSettings({ openAtLogin: !!v });
    if (k === 'alwaysOnTop') applyOnTop();
    if (k === 'monitors') applyMonitors();
    if (k === 'voiceModel' || (k === 'voiceEngine' && v === 'ghost')) ensureVoice();
    buildTray(); broadcast('settings', publicSettings()); return publicSettings();
  });
  ipcMain.handle('pairInfo', async () => { const url = remoteURL(); return { url, ip: lanIP(), port: PORT, qr: await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#2b2420', light: '#f4ecd8' } }), connected: remotes.size }; });
  ipcMain.handle('newToken', async () => { settings.token = crypto.randomBytes(8).toString('hex'); saveSettings(); remotes.forEach(w => w.close()); return true; });
  ipcMain.handle('voice:synth', async (e, text) => { if (settings.voiceEngine !== 'ghost') return null; try { const b = await synth(text); return b ? new Uint8Array(b) : null; } catch (err) { log('synth failed', err); return null; } });
  ipcMain.handle('voice:setup', async () => ({ ears: await ensureEars(), voice: settings.voiceEngine === 'ghost' ? await ensureVoice() : true, error: earsError }));
  ipcMain.handle('ears:transcribe', async (e, wav, hint) => { try { return await transcribe(wav, hint); } catch (err) { return ''; } });
  ipcMain.handle('ears:ready', async () => earsReady());
  ipcMain.handle('ears:error', async () => earsError);
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('talk', () => { if (overlay && !overlay.isDestroyed()) { if (settings.overlay === 'hidden') { settings.overlay = 'swim'; applyOverlayMode(); } overlay.webContents.send('listen', { from: 'palette' }); } });

  function applyOverlayMode() {
    if (!overlay || overlay.isDestroyed()) return;
    if (settings.overlay === 'hidden') overlay.hide(); else { overlay.showInactive(); overlay.webContents.send('mode', settings.overlay); }
  }

  /* ================= tray ================= */
  const hk = k => (settings.hotkeys[k] || '').replace(/Control/g, 'Ctrl').replace(/CommandOrControl/g, 'Ctrl');
  function summon() { if (!overlay || overlay.isDestroyed()) return; if (settings.overlay === 'hidden') { settings.overlay = 'swim'; saveSettings(); applyOverlayMode(); buildTray(); } overlay.webContents.send('summon'); }
  function buildTray() {
    const icon = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
    if (!tray) { tray = new Tray(icon); tray.setToolTip('Sensei Hakuun'); tray.on('click', () => togglePalette(true)); }
    const set = (k, v) => { settings[k] = v; saveSettings(); };
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Open the Garden   ${hk('garden')}`, click: openGarden },
      { label: `Bring Sensei here   ${hk('summon')}`, click: summon },
      { label: `Search & launch…   ${hk('palette')}`, click: () => togglePalette(true) },
      { label: `Talk to Sensei   ${hk('listen')}`, click: () => overlay && overlay.webContents.send('listen', { from: 'tray' }) },
      { label: 'Connect phone remote', click: openPair },
      { label: 'Settings', click: openSettings },
      { type: 'separator' },
      { label: 'Sensei swims around', type: 'radio', checked: settings.overlay === 'swim', click: () => { set('overlay', 'swim'); applyOverlayMode(); } },
      { label: 'Sensei rests in the corner', type: 'radio', checked: settings.overlay === 'rest', click: () => { set('overlay', 'rest'); applyOverlayMode(); } },
      { label: `Hide Sensei   ${hk('hide')}`, type: 'radio', checked: settings.overlay === 'hidden', click: () => { set('overlay', 'hidden'); applyOverlayMode(); } },
      { type: 'separator' },
      { label: 'Check for updates', click: async () => { const r = await checkUpdates(); afterUpdate(r, true); } },
      { label: `Version ${app.getVersion()} · ui ${(readManifest(webDir()) || {}).version || '?'}`, enabled: false },
      { label: 'Quit', click: () => app.quit() }
    ]));
  }
  function afterUpdate(r, manual) {
    if (r && r.needsShell) { new Notification({ title: 'Sensei Hakuun', body: 'This update needs a fresh download of the app from GitHub.' }).show(); return; }
    if (r && r.coreChanged) { app.relaunch(); app.exit(0); return; }
    if (r) { reloadUI(); setTimeout(() => say(r.notes || 'I have learned something new.', 'update'), 4000); }
    else if (manual) new Notification({ title: 'Sensei Hakuun', body: 'Already up to date.' }).show();
  }

  /* ================= boot ================= */
  createOverlay(); createPalette(); buildTray(); psStart(); startServer(); rescan();
  setTimeout(brainWatch, 1200); setInterval(brainWatch, 40000);
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  const HOTKEY_ACTIONS = {
    palette: () => togglePalette(),
    summon,
    listen: () => { summon(); overlay && overlay.webContents.send('listen', { from: 'hotkey' }); },
    hide: () => { settings.overlay = settings.overlay === 'hidden' ? 'swim' : 'hidden'; saveSettings(); applyOverlayMode(); buildTray(); },
    garden: openGarden
  };
  function registerHotkeys() {
    globalShortcut.unregisterAll(); const failed = [];
    for (const [k, acc] of Object.entries(settings.hotkeys)) { if (!acc || !HOTKEY_ACTIONS[k]) continue; try { if (!globalShortcut.register(acc, HOTKEY_ACTIONS[k])) failed.push(k); } catch (e) { failed.push(k); } }
    return failed;
  }
  registerHotkeys();
  ipcMain.handle('setHotkey', (e, k, acc) => { if (!HOTKEY_ACTIONS[k]) return { ok: false }; const old = settings.hotkeys[k]; settings.hotkeys[k] = acc || '';
    const failed = registerHotkeys(); if (failed.includes(k)) { settings.hotkeys[k] = old; registerHotkeys(); return { ok: false, settings: publicSettings() }; }
    saveSettings(); buildTray(); broadcast('settings', publicSettings()); return { ok: true, settings: publicSettings() }; });
  ipcMain.on('hotkeys:pause', (e, on) => { if (on) globalShortcut.unregisterAll(); else registerHotkeys(); });
  if (settings.voiceEngine === 'ghost') setTimeout(() => { ensureVoice(); }, 8000);
  app.on('second-instance', () => togglePalette(true));
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (ps) try { ps.kill(); } catch (e) {} });
  setInterval(async () => afterUpdate(await checkUpdates(), false), 20 * 60 * 1000);
};
