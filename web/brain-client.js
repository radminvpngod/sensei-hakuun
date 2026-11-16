// Shared by every Sensei page inside the Windows app.
// 1) window.claude.use("sample" | "db"): Sensei's mind, answered by claude.ai through your plan (via the app).
// 2) window.senseiVoice: his ghost voice — a natural voice made on your PC, then deepened, doubled and echoed.
(function () {
  const S = window.sensei; if (!S) return;

  /* ---------------- mind ---------------- */
  let seq = 0; const streams = {};
  S.on('brain:stream', d => { const s = streams[d.id]; if (!s) return;
    if (d.text != null && s.onText) { try { s.onText({ text: d.text, delta: '' }); } catch (e) {} }
    if (d.done) { delete streams[d.id]; d.error ? s.rej(d.error) : s.res(d.result); } });
  const toData = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  async function call(kind, input, opts = {}) {
    const id = 'q' + (++seq) + '_' + Date.now();
    const images = opts.images && opts.images.length ? await Promise.all(opts.images.map(toData)) : null;
    return new Promise((res, rej) => { streams[id] = { res, rej, onText: opts.onText };
      S.invoke('brain:start', { id, kind, input, opts: { modelTier: opts.modelTier, images } }).then(ok => { if (!ok && streams[id]) { /* error arrives on the stream */ } })
        .catch(e => { delete streams[id]; rej({ code: 'unavailable', message: String(e) }); }); });
  }
  const sample = (input, opts) => call('text', input, opts).then(t => ({ text: String(t || ''), truncated: false }));
  sample.json = (input, opts) => call('json', input, opts);
  sample.limits = async () => ({ images: true });
  const snap = (id, data) => ({ id, exists: data != null, data: () => data == null ? undefined : data, metadata: { fromCache: false, hasPendingWrites: false } });
  const db = {
    doc(p) { const id = p.split('/').pop(); return { id, path: p,
      async get() { const r = await S.invoke('brain:db', { op: 'get', path: p }); if (r && r.error) throw { code: 'unavailable', message: r.error }; return snap(id, r ? r.data : null); },
      async set(data) { const r = await S.invoke('brain:db', { op: 'set', path: p, data }); if (r && r.error) throw { code: 'unavailable', message: r.error }; },
      async update(data) { return this.set(data); },
      onSnapshot(next) { this.get().then(next).catch(() => {}); return () => {}; } }; },
    collection(c) { const mk = o => ({ path: c,
      orderBy: (f, d) => mk({ ...o, orderBy: f, dir: d || 'asc' }), limit: n => mk({ ...o, limit: n }), where: () => mk(o),
      async get() { const r = await S.invoke('brain:db', { op: 'list', coll: c, ...o }); const docs = Array.isArray(r) ? r.map(x => snap(x.id, x.data)) : []; return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; },
      onSnapshot(next, err) { let live = true; const tick = () => { if (!live) return; this.get().then(s => live && next(s)).catch(e => err && err({ code: 'unavailable', message: String(e) })); };
        tick(); const iv = setInterval(tick, 10 * 60 * 1000); return () => { live = false; clearInterval(iv); }; },
      doc: id => db.doc(c + '/' + id) }); return mk({}); }
  };
  window.claude = { use: async name => name === 'sample' ? sample : name === 'db' ? db : null };

  /* ---------------- ghost voice ---------------- */
  let ac = null, fx = null, cur = null, settings = { voice: true, voiceVolume: .9, echo: .55 };
  S.invoke('settings').then(s => { if (s) settings = s; }).catch(() => {});
  S.on('settings', s => { if (s) { settings = s; if (fx) { fx.vol.gain.value = settings.voiceVolume ?? .9; setEcho(); } } });
  function setEcho() { const e = settings.echo ?? .55; fx.fb.gain.value = .22 + e * .28; fx.echoOut.gain.value = .15 + e * .45; fx.verbOut.gain.value = .12 + e * .5; }
  function graph() {
    if (fx) return fx; ac = ac || new AudioContext();
    const vol = ac.createGain(); vol.gain.value = settings.voiceVolume ?? .9; vol.connect(ac.destination);
    const input = ac.createGain();
    const low = ac.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = 5;
    const air = ac.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 5200; air.gain.value = -3;
    input.connect(low); low.connect(air);
    const dry = ac.createGain(); dry.gain.value = .82; air.connect(dry); dry.connect(vol);
    // ghostly doubling: a second, slightly wavering copy of the voice
    const ch = ac.createDelay(.1); ch.delayTime.value = .022; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .27; lg.gain.value = .006; lfo.connect(lg); lg.connect(ch.delayTime); lfo.start();
    const chg = ac.createGain(); chg.gain.value = .38; air.connect(ch); ch.connect(chg); chg.connect(vol);
    // echo across the garden
    const echo = ac.createDelay(2); echo.delayTime.value = .36; const fb = ac.createGain(); const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2200;
    echo.connect(ef); ef.connect(fb); fb.connect(echo); const echoOut = ac.createGain(); echo.connect(echoOut); echoOut.connect(vol); air.connect(echo);
    // temple reverb
    const len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const verb = ac.createConvolver(); verb.buffer = ir; const verbOut = ac.createGain(); air.connect(verb); verb.connect(verbOut); verbOut.connect(vol);
    fx = { vol, input, fb, echoOut, verbOut }; setEcho(); return fx;
  }
  function breath(dur) { // a faint wind under his words
    const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .7;
    const g = ac.createGain(); const t = ac.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.018, t + .6); g.gain.setValueAtTime(.018, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    s.connect(bp); bp.connect(g); g.connect(fx.vol); s.start(t); s.stop(t + dur + 1.4);
  }
  function bowl() { const t = ac.currentTime; [[221, .05, 6], [596, .025, 4], [1111, .012, 3]].forEach(([f, v, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(fx.vol); g.connect(fx.input); o.start(t); o.stop(t + d); }); }
  function stop() { try { if (cur) cur.stop(); } catch (e) {} cur = null; try { speechSynthesis.cancel(); } catch (e) {} }
  async function speak(text, cb = {}) {
    if (settings.voice === false || !text) return;
    stop();
    const clean = String(text).replace(/[぀-ヿ㐀-鿿]+/g, '').replace(/\(\s*\)/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim(); if (!clean) return;
    let wav = null; if (settings.voiceEngine === 'ghost') { try { wav = await S.invoke('voice:synth', clean); } catch (e) {} }
    if (wav && wav.byteLength > 1000) {
      try {
        graph(); if (ac.state === 'suspended') await ac.resume();
        const buf = await ac.decodeAudioData(wav.buffer ? wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) : wav);
        const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = .9; src.detune.value = -120; src.connect(fx.input);
        if (cb.bowl !== false) bowl(); breath(buf.duration / .9);
        src.onended = () => { if (cur === src) cur = null; cb.onend && cb.onend(); };
        cur = src; cb.onstart && cb.onstart(); src.start(ac.currentTime + (cb.bowl !== false ? .35 : 0)); return;
      } catch (e) {}
    }
    try { const u = new SpeechSynthesisUtterance(clean); const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      u.voice = vs.find(v => /Daniel|UK English Male|George|David|Guy|Mark|James|Ryan|Male/i.test(v.name)) || vs[0] || null; u.pitch = .6; u.rate = .82;
      u.onstart = () => cb.onstart && cb.onstart(); u.onend = u.onerror = () => cb.onend && cb.onend(); speechSynthesis.speak(u); } catch (e) {}
  }
  window.senseiVoice = { speak, stop };
})();
