// Sensei Hakuun — bootstrap shell.
// This file almost never changes. Everything else (core.js and the pages in /web) is downloaded from
// GitHub on start, so new features and fixes arrive without re-downloading the app.
const electron = require('electron');
const { app, Notification } = electron;
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const SHELL_API = 2;            // bump only when the shell itself must change
const REPO_RAW = 'https://raw.githubusercontent.com/radminvpngod/sensei-hakuun/main/web/';

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.setAppUserModelId('com.gabriel.senseihakuun');
  const UD = app.getPath('userData');
  const CACHE = path.join(UD, 'web-cache');
  const BUNDLED = path.join(__dirname, 'web');

  const readManifest = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) { return null; } };
  const usable = m => m && (m.shellApi || 1) <= SHELL_API;
  function webDir() {
    const c = readManifest(CACHE), b = readManifest(BUNDLED);
    if (usable(c) && (!b || c.version > b.version)) return CACHE;
    return BUNDLED;
  }
  function fetchBuf(url, redirects = 5) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'sensei-hakuun', 'Cache-Control': 'no-cache' }, timeout: 20000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); return resolve(fetchBuf(new URL(res.headers.location, url).toString(), redirects - 1)); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
    });
  }
  let updating = false;
  async function checkUpdates() {
    if (updating) return false; updating = true;
    try {
      const remote = JSON.parse((await fetchBuf(REPO_RAW + 'manifest.json?t=' + Date.now())).toString());
      const cur = readManifest(webDir()) || { version: 0 };
      if (!(remote.version > cur.version)) return false;
      if (!usable(remote)) return { needsShell: true, ...remote };
      const tmp = CACHE + '-tmp'; fs.rmSync(tmp, { recursive: true, force: true });
      for (const f of remote.files) {
        const buf = await fetchBuf(REPO_RAW + f + '?v=' + remote.version);
        const p = path.join(tmp, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
      }
      fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(remote));
      const hash = d => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(d, 'core.js'))).digest('hex'); } catch (e) { return ''; } };
      const coreChanged = hash(tmp) !== hash(webDir());
      fs.rmSync(CACHE, { recursive: true, force: true }); fs.renameSync(tmp, CACHE);
      return { ...remote, coreChanged };
    } catch (e) { return false; }
    finally { updating = false; }
  }

  app.whenReady().then(async () => {
    const first = await Promise.race([checkUpdates(), new Promise(r => setTimeout(() => r(false), 6000))]);
    let core;
    try { core = require(path.join(webDir(), 'core.js')); }
    catch (e) { core = require(path.join(BUNDLED, 'core.js')); }
    core({
      electron, app, SHELL_API, REPO_RAW, shellDir: __dirname,
      webDir, webPath: f => path.join(webDir(), f), readManifest, checkUpdates, fetchBuf,
      deps: { WebSocket: require('ws'), selfsigned: require('selfsigned'), QRCode: require('qrcode') }
    });
    if (first && first.needsShell) new Notification({ title: 'Sensei Hakuun', body: 'A new version of the app itself is on GitHub. Please download it once more.' }).show();
  });
}
