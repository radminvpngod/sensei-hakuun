// Sensei Hakuun — Windows shell
// The shell stays small. The overlay, launcher, pairing screen and phone remote are web pages in /web,
// fetched from GitHub on start, so new features arrive without reinstalling.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, nativeImage, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const WebSocket = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');

const REPO_RAW = 'https://raw.githubusercontent.com/radminvpngod/sensei-hakuun/main/web/';
const GARDEN_URL = 'https://claude.ai/artifact/EaFRSKcNFcj5TfDwVXGoDE';
const PORT = 47300;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('com.gabriel.senseihakuun');

const UD = app.getPath('userData');
const CACHE = path.join(UD, 'web-cache');
const BUNDLED = path.join(__dirname, 'web');
const SETTINGS = path.join(UD, 'settings.json');

let settings = { customFolders: [], overlay: 'swim', voice: true, autostart: true, sens: 16, token: null };
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }; } catch (e) {}
if (!settings.token) settings.token = crypto.randomBytes(8).toString('hex');
function saveSettings() { try { fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2)); } catch (e) {} }
saveSettings();

/* ---------------- web UI: bundled copy vs. newer copy from GitHub ---------------- */
function readManifest(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) { return null; } }
function webDir() {
  const c = readManifest(CACHE), b = readManifest(BUNDLED);
  if (c && (!b || c.version > b.version)) return CACHE;
  return BUNDLED;
}
const webPath = f => path.join(webDir(), f);

function fetchBuf(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'sensei-hakuun', 'Cache-Control': 'no-cache' }, timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); return resolve(fetchBuf(res.headers.location, redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}
let updating = false;
async function checkUpdates() {
  if (updating) return false; updating = true;
  try {
    const remote = JSON.parse((await fetchBuf(REPO_RAW + 'manifest.json?t=' + Date.now())).toString());
    const cur = readManifest(webDir()) || { version: 0 };
    if (!(remote.version > cur.version)) return false;
    const tmp = CACHE + '-tmp';
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of remote.files) {
      const buf = await fetchBuf(REPO_RAW + f + '?v=' + remote.version);
      const p = path.join(tmp, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(remote));
    fs.rmSync(CACHE, { recursive: true, force: true });
    fs.renameSync(tmp, CACHE);
    return remote;
  } catch (e) { return false; }
  finally { updating = false; }
}
function shellOutdated() {
  const m = readManifest(webDir());
  if (!m || !m.minShell) return false;
  const v = s => s.split('.').map(Number); const a = v(app.getVersion()), b = v(m.minShell);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) < (b[i] || 0)) return true; if ((a[i] || 0) > (b[i] || 0)) return false; }
  return false;
}

/* ---------------- windows ---------------- */
let overlay = null, palette = null, pairWin = null, garden = null, tray = null;
const PRELOAD = path.join(__dirname, 'preload.js');

function createOverlay() {
  const d = screen.getPrimaryDisplay(); const { x, y, width, height } = d.bounds;
  overlay = new BrowserWindow({
    x, y, width, height, transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: PRELOAD, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.loadFile(webPath('overlay.html'));
  overlay.once('ready-to-show', () => { if (settings.overlay !== 'hidden') overlay.showInactive(); });
}
function createPalette() {
  const d = screen.getPrimaryDisplay().workArea;
  palette = new BrowserWindow({
    width: 680, height: 470, x: Math.round(d.x + (d.width - 680) / 2), y: Math.round(d.y + d.height * 0.16),
    frame: false, transparent: true, resizable: false, show: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD }
  });
  palette.loadFile(webPath('palette.html'));
  palette.on('blur', () => { if (palette && palette.isVisible()) palette.hide(); });
}
function togglePalette(show) {
  if (!palette || palette.isDestroyed()) createPalette();
  if (show === false || (show === undefined && palette.isVisible())) { palette.hide(); return; }
  palette.show(); palette.focus(); palette.webContents.send('palette:open');
}
function openPair() {
  if (pairWin && !pairWin.isDestroyed()) { pairWin.show(); pairWin.focus(); return; }
  pairWin = new BrowserWindow({ width: 520, height: 720, title: 'Connect your phone — Sensei', autoHideMenuBar: true, backgroundColor: '#0b0f22', webPreferences: { preload: PRELOAD } });
  pairWin.loadFile(webPath('pair.html'));
}
function openGarden() {
  if (garden && !garden.isDestroyed()) { garden.show(); garden.focus(); return; }
  garden = new BrowserWindow({ width: 1320, height: 840, title: 'Sensei Hakuun — The Garden', autoHideMenuBar: true, backgroundColor: '#0b1026',
    webPreferences: { partition: 'persist:sensei' } });
  // a plain browser user agent, so sign-in pages treat this like Chrome
  garden.webContents.setUserAgent(garden.webContents.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?sensei-hakuun\/\S+/i, ''));
  garden.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com)\//.test(url)) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  garden.loadURL(GARDEN_URL);
}
function reloadUI() {
  [overlay, palette, pairWin].forEach(w => { if (w && !w.isDestroyed()) { const f = w === overlay ? 'overlay.html' : w === palette ? 'palette.html' : 'pair.html'; w.loadFile(webPath(f)); } });
}

/* ---------------- launcher catalog ---------------- */
function regQuery(key, val) {
  return new Promise(r => execFile('reg', ['query', key, '/v', val], { windowsHide: true }, (e, out) => {
    if (e) return r(null); const m = String(out).match(new RegExp(val + '\\s+REG_\\w+\\s+(.+)')); r(m ? m[1].trim() : null);
  }));
}
function walk(dir, depth, out, ext, skip) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 0 && !(skip && skip.test(e.name))) walk(p, depth - 1, out, ext, skip); }
    else if (ext.test(e.name)) out.push(p);
    if (out.length > 4000) return;
  }
}
async function steamGames() {
  const sp = (await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || 'C:/Program Files (x86)/Steam';
  const libs = new Set([path.join(sp, 'steamapps')]);
  try { const vdf = fs.readFileSync(path.join(sp, 'steamapps', 'libraryfolders.vdf'), 'utf8'); for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps')); } catch (e) {}
  const games = [];
  for (const lib of libs) {
    let files = []; try { files = fs.readdirSync(lib); } catch (e) { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const t = fs.readFileSync(path.join(lib, f), 'utf8');
        const id = (t.match(/"appid"\s+"(\d+)"/) || [])[1], name = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
        if (id && name && !/Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR/i.test(name)) games.push({ type: 'steam', name, id, launch: 'steam://rungameid/' + id });
      } catch (e) {}
    }
  }
  return games;
}
function startMenuApps() {
  const dirs = [path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs'), path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs')];
  const out = []; dirs.forEach(d => walk(d, 3, out, /\.(lnk|url)$/i));
  const seen = new Set();
  return out.filter(p => !/uninstall|readme|help|documentation|website|manual|release notes|license/i.test(path.basename(p)))
    .map(p => ({ type: 'app', name: path.basename(p).replace(/\.(lnk|url)$/i, ''), launch: p }))
    .filter(a => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function folderGames() {
  const out = [];
  for (const f of settings.customFolders) {
    const ex = []; walk(f, 3, ex, /\.(exe|lnk|url)$/i, /^(\.|_CommonRedist|redist|DirectX|vcredist|Engine|Binaries\\ThirdParty|__)/i);
    ex.filter(p => !/unins|setup|crash|redist|vc_|dxsetup|helper|report|install|updater|launcherpatch|cefprocess|UnityCrash|BsSndRpt/i.test(path.basename(p)))
      .forEach(p => out.push({ type: 'game', name: path.basename(p).replace(/\.(exe|lnk|url)$/i, ''), where: path.basename(path.dirname(p)), launch: p }));
  }
  return out;
}
let catalog = [];
async function rescan() { try { catalog = [...(await steamGames()), ...folderGames(), ...startMenuApps()]; } catch (e) {} return catalog; }
function launchItem(item) {
  if (!item || !item.launch) return;
  if (/^(steam|https?|spotify|ms-settings):/i.test(item.launch)) shell.openExternal(item.launch);
  else shell.openPath(item.launch);
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('say', { kind: 'launch', name: item.name });
}

/* ---------------- mouse & keys (Windows user32 through one PowerShell process) ---------------- */
let ps = null;
function psStart() {
  if (process.platform !== 'win32' || ps) return;
  ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  ps.stdin.write("Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class SM{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,int d,UIntPtr e);[DllImport(\"user32.dll\")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}'\n");
  ps.on('exit', () => { ps = null; });
  ps.stdin.on('error', () => {});
}
function psRun(cmd) { if (!ps) psStart(); if (ps) { try { ps.stdin.write(cmd + '\n'); } catch (e) {} } }
const Z = '[UIntPtr]::Zero';
const mouse = {
  down: b => psRun(`[SM]::mouse_event(${b === 'right' ? 8 : 2},0,0,0,${Z})`),
  up: b => psRun(`[SM]::mouse_event(${b === 'right' ? 16 : 4},0,0,0,${Z})`),
  wheel: d => psRun(`[SM]::mouse_event(2048,0,0,${Math.round(d)},${Z})`),
  key: vk => psRun(`[SM]::keybd_event(${vk},0,0,${Z});[SM]::keybd_event(${vk},0,2,${Z})`)
};
let cursor = null, lastSent = '', pointerSeen = 0;
function allBounds() {
  const ds = screen.getAllDisplays(); let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  ds.forEach(d => { l = Math.min(l, d.bounds.x); t = Math.min(t, d.bounds.y); r = Math.max(r, d.bounds.x + d.bounds.width); b = Math.max(b, d.bounds.y + d.bounds.height); });
  return { l, t, r: r - 1, b: b - 1 };
}
setInterval(() => {
  if (!cursor) return; const k = Math.round(cursor.x) + ',' + Math.round(cursor.y);
  if (k !== lastSent) { lastSent = k; psRun(`[SM]::SetCursorPos(${Math.round(cursor.x)},${Math.round(cursor.y)})`); }
  if (overlay && !overlay.isDestroyed()) { const o = overlay.getBounds(); overlay.webContents.send('pointer', { x: cursor.x - o.x, y: cursor.y - o.y, on: Date.now() - pointerSeen < 1500 }); }
}, 16);

/* ---------------- phone remote server (HTTPS + WebSocket on your Wi-Fi) ---------------- */
function lanIP() {
  const nets = os.networkInterfaces(); const all = [];
  for (const n of Object.values(nets)) for (const a of n || []) if (a.family === 'IPv4' && !a.internal) all.push(a.address);
  return all.find(a => /^192\.168\./.test(a)) || all.find(a => /^10\./.test(a)) || all.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) || all[0] || '127.0.0.1';
}
function getCert() {
  const p = path.join(UD, 'cert.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
  const pems = selfsigned.generate([{ name: 'commonName', value: 'sensei-hakuun.local' }], { days: 3650, keySize: 2048, algorithm: 'sha256' });
  fs.writeFileSync(p, JSON.stringify(pems)); return pems;
}
let remotes = new Set();
function remoteURL() { return `https://${lanIP()}:${PORT}/?k=${settings.token}`; }
function startServer() {
  const pems = getCert();
  const srv = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname === '/' || u.pathname === '/remote') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      try { res.end(fs.readFileSync(webPath('remote.html'))); } catch (e) { res.end('Remote page missing'); }
    } else if (u.pathname === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); try { res.end(fs.readFileSync(path.join(__dirname, 'icon.png'))); } catch (e) { res.end(); } }
    else { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocket.Server({ server: srv });
  wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'https://x');
    if (u.searchParams.get('k') !== settings.token) { ws.close(4001, 'bad key'); return; }
    remotes.add(ws); notifyRemote();
    ws.send(JSON.stringify({ t: 'hello', sens: settings.sens }));
    ws.on('message', m => { let d; try { d = JSON.parse(m); } catch (e) { return; } handleRemote(d, ws); });
    ws.on('close', () => { remotes.delete(ws); notifyRemote(); });
  });
  srv.on('error', e => { if (overlay) overlay.webContents.send('say', { kind: 'error', text: 'The phone remote could not start: ' + e.message }); });
  srv.listen(PORT, '0.0.0.0');
}
function notifyRemote() {
  const n = remotes.size;
  [overlay, pairWin].forEach(w => { if (w && !w.isDestroyed()) w.webContents.send('remote', { connected: n }); });
}
function handleRemote(d) {
  switch (d.t) {
    case 'move': {
      const b = allBounds();
      if (!cursor) { const p = screen.getCursorScreenPoint(); cursor = { x: p.x, y: p.y }; }
      cursor.x = Math.max(b.l, Math.min(b.r, cursor.x + (+d.dx || 0)));
      cursor.y = Math.max(b.t, Math.min(b.b, cursor.y + (+d.dy || 0)));
      pointerSeen = Date.now(); break;
    }
    case 'center': { const pd = screen.getPrimaryDisplay().bounds; cursor = { x: pd.x + pd.width / 2, y: pd.y + pd.height / 2 }; pointerSeen = Date.now(); break; }
    case 'down': if (d.b === 'a') mouse.down('left'); else if (d.b === 'b') mouse.down('right'); break;
    case 'up': if (d.b === 'a') mouse.up('left'); else if (d.b === 'b') mouse.up('right'); break;
    case 'scroll': mouse.wheel(-(+d.dy || 0) * 3); break;
    case 'press': {
      const map = { plus: 0xAF, minus: 0xAE, one: 0xB3, two: 0x1B, up: 0x26, down: 0x28, left: 0x25, right: 0x27, enter: 0x0D, tab: 0x09, next: 0xB0, prev: 0xB1 };
      if (d.b === 'home') togglePalette(true);
      else if (d.b === 'sensei') { if (overlay) overlay.webContents.send('summon'); }
      else if (d.b === 'garden') openGarden();
      else if (map[d.b]) mouse.key(map[d.b]);
      break;
    }
    case 'sens': settings.sens = Math.max(4, Math.min(40, +d.v || 16)); saveSettings(); break;
    case 'type': { // text typed on the phone goes to the palette
      togglePalette(true); setTimeout(() => palette && palette.webContents.send('palette:type', String(d.text || '').slice(0, 200)), 150); break;
    }
  }
}

/* ---------------- IPC ---------------- */
ipcMain.on('overlay:interactive', (e, on) => { if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('open', (e, what) => { if (what === 'garden') openGarden(); else if (what === 'palette') togglePalette(true); else if (what === 'pair') openPair(); });
ipcMain.on('palette:hide', () => togglePalette(false));
ipcMain.handle('catalog', async (e, fresh) => (fresh || !catalog.length) ? await rescan() : catalog);
ipcMain.on('launch', (e, item) => { launchItem(item); togglePalette(false); });
ipcMain.on('openExternal', (e, url) => { if (/^(https?|steam|spotify):/i.test(url)) shell.openExternal(url); togglePalette(false); });
ipcMain.handle('addFolder', async () => {
  const r = await dialog.showOpenDialog({ title: 'Add a game folder', properties: ['openDirectory', 'multiSelections'] });
  if (r.canceled) return settings.customFolders;
  r.filePaths.forEach(p => { if (!settings.customFolders.includes(p)) settings.customFolders.push(p); });
  saveSettings(); await rescan(); return settings.customFolders;
});
ipcMain.handle('removeFolder', async (e, p) => { settings.customFolders = settings.customFolders.filter(x => x !== p); saveSettings(); await rescan(); return settings.customFolders; });
ipcMain.handle('settings', () => ({ ...settings, token: undefined, version: app.getVersion(), web: (readManifest(webDir()) || {}).version }));
ipcMain.handle('setSetting', (e, k, v) => {
  if (!['overlay', 'voice', 'autostart', 'sens'].includes(k)) return settings;
  settings[k] = v; saveSettings();
  if (k === 'overlay') applyOverlayMode();
  if (k === 'autostart') app.setLoginItemSettings({ openAtLogin: !!v });
  return settings;
});
ipcMain.handle('pairInfo', async () => {
  const url = remoteURL();
  return { url, ip: lanIP(), port: PORT, qr: await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#2b2420', light: '#f4ecd8' } }), connected: remotes.size };
});
ipcMain.handle('newToken', async () => { settings.token = crypto.randomBytes(8).toString('hex'); saveSettings(); remotes.forEach(w => w.close()); return true; });
ipcMain.on('quit', () => app.quit());

function applyOverlayMode() {
  if (!overlay || overlay.isDestroyed()) return;
  if (settings.overlay === 'hidden') overlay.hide(); else { overlay.showInactive(); overlay.webContents.send('mode', settings.overlay); }
  buildTray();
}

/* ---------------- tray ---------------- */
function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  if (!tray) { tray = new Tray(icon); tray.setToolTip('Sensei Hakuun'); tray.on('click', () => togglePalette(true)); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open the Garden', click: openGarden },
    { label: 'Ask Sensei / launch…   Ctrl+Shift+Space', click: () => togglePalette(true) },
    { label: 'Connect phone remote', click: openPair },
    { type: 'separator' },
    { label: 'Sensei swims around', type: 'radio', checked: settings.overlay === 'swim', click: () => { settings.overlay = 'swim'; saveSettings(); applyOverlayMode(); } },
    { label: 'Sensei rests in the corner', type: 'radio', checked: settings.overlay === 'rest', click: () => { settings.overlay = 'rest'; saveSettings(); applyOverlayMode(); } },
    { label: 'Hide Sensei   Ctrl+Shift+H', type: 'radio', checked: settings.overlay === 'hidden', click: () => { settings.overlay = 'hidden'; saveSettings(); applyOverlayMode(); } },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: !!settings.autostart, click: m => { settings.autostart = m.checked; saveSettings(); app.setLoginItemSettings({ openAtLogin: m.checked }); } },
    { label: 'Check for updates', click: async () => { const r = await checkUpdates(); if (r) reloadUI(); new Notification({ title: 'Sensei Hakuun', body: r ? `Updated to v${r.version}: ${r.notes || 'new features'}` : 'Already up to date.' }).show(); } },
    { label: `Version ${app.getVersion()} · ui ${(readManifest(webDir()) || {}).version || '?'}`, enabled: false },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

/* ---------------- boot ---------------- */
app.whenReady().then(async () => {
  await Promise.race([checkUpdates(), new Promise(r => setTimeout(r, 6000))]);
  createOverlay(); createPalette(); buildTray(); psStart(); startServer(); rescan();
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  globalShortcut.register('Control+Shift+Space', () => togglePalette());
  globalShortcut.register('Control+Shift+H', () => { settings.overlay = settings.overlay === 'hidden' ? 'swim' : 'hidden'; saveSettings(); applyOverlayMode(); });
  globalShortcut.register('Control+Shift+G', openGarden);
  if (shellOutdated()) new Notification({ title: 'Sensei Hakuun', body: 'A new version of the app itself is available on GitHub. Most updates install on their own, but this one needs a fresh download.' }).show();
  setInterval(async () => { const r = await checkUpdates(); if (r) { reloadUI(); if (overlay) setTimeout(() => overlay.webContents.send('say', { kind: 'update', text: r.notes || '' }), 4000); } }, 20 * 60 * 1000);
});
app.on('second-instance', () => togglePalette(true));
app.on('window-all-closed', e => { /* keep running in the tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (ps) try { ps.kill(); } catch (e) {} });
