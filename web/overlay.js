import { visitorHit, startVisit } from "./visitor.js";
import * as THREE from "./vendor/three.module.min.js";
import { buildSensei } from "./sensei-model.js";
const S = window.sensei || { send(){}, invoke: async()=>({}), on(){} };
const $ = s => document.querySelector(s);
const CX = 230, CY = 300;                       // where Sensei sits inside his little window

/* ---------- renderer: small, 1x, capped frame rate ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $("#c"), alpha: true, antialias: true, powerPreference: "low-power" });
renderer.setPixelRatio(1); renderer.setSize(460, 460, false); renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-CX, 460 - CX, CY, CY - 460, -2000, 2000);
scene.add(new THREE.AmbientLight(0xffffff, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(200, 300, 500); scene.add(dl);
const sensei = buildSensei(THREE); scene.add(sensei.root); sensei.root.scale.setScalar(44);

let settings = (await S.invoke("settings")) || {};
let mode = settings.overlay || "swim";
S.on("settings", s => { if (s) { settings = s; } });
let L = { origin: { x: 0, y: 0 }, rects: [{ x: 0, y: 0, w: screen.availWidth, h: screen.availHeight }], primary: { x: 0, y: 0, w: screen.availWidth, h: screen.availHeight } };
let placed = false;
const pos = { x: screen.availWidth - 220, y: screen.availHeight - 150 }, target = { ...pos };
let facing = -1, nextWander = 0, clock = 0, last = performance.now(), talking = false, boop = 0, listening = false;
S.on("layout", l => { L = l; window.__senseiLayout = l; if (!placed) { pos.x = L.primary.x + L.primary.w - 220; pos.y = L.primary.y + L.primary.h - 150; placed = true; } pickTarget(); });

function pickTarget(){
  if (mode === "rest"){ target.x = L.primary.x + L.primary.w - 200; target.y = L.primary.y + L.primary.h - 140; return; }
  const r = L.rects[Math.floor(Math.random() * L.rects.length)] || L.primary, e = Math.random();
  if (e < .45) { target.x = r.x + 180 + Math.random() * (r.w - 360); target.y = r.y + r.h - 140 - Math.random() * r.h * .2; }
  else if (e < .75) { target.x = r.x + (Math.random() < .5 ? 170 : r.w - 170); target.y = r.y + 200 + Math.random() * (r.h - 360); }
  else { target.x = r.x + 180 + Math.random() * (r.w - 360); target.y = r.y + 230 + Math.random() * 80; }
  nextWander = clock + 18 + Math.random() * 30;
}
const modeLbl = () => { $("#modeLbl").textContent = mode === "rest" ? "Swim" : "Rest"; };
S.on("mode", m => { mode = m; modeLbl(); pickTarget(); }); modeLbl();
function summon(){ target.x = L.primary.x + L.primary.w / 2; target.y = L.primary.y + L.primary.h / 2 + 60; nextWander = clock + 45; if (mode === "rest") mode = "swim"; }
S.on("summon", () => { summon(); say(pick(["You called, my student?", "Hm. I am here.", "Yes, yes. I came as fast as a ghost fish can."]), 4000, true); });

/* ---------- hover & menu: the app tells us when the cursor is over Sensei ---------- */
let menuOpen = false; const mouse = { x: -999, y: -999 }; let hovering = false;
const local = () => ({ x: pos.x - L.origin.x, y: pos.y - L.origin.y });
S.on("hover", h => { hovering = h; document.body.style.cursor = h ? "pointer" : ""; });
addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
const onSensei = () => { const p = local(); return Math.hypot(mouse.x - p.x, mouse.y - (p.y + bobY)) < 85; };
addEventListener("mousedown", e => { if (e.target.closest(".mbtn") || e.target.id === "visitor") return; if (onSensei() || (hovering && !menuOpen)) { boop = 1; toggleMenu(); } else if (menuOpen) toggleMenu(false); });
function toggleMenu(f){ menuOpen = f ?? !menuOpen; $("#menu").classList.toggle("open", menuOpen); if (menuOpen) { layoutMenu(); $("#bubble").classList.remove("show"); bubbleT = 0; } sendHit(true); }
function layoutMenu(){ const bs = [...document.querySelectorAll(".mbtn")]; const n = bs.length, R = 108;
  bs.forEach((b, i) => { const a = -Math.PI / 2 + (i - (n - 1) / 2) * .62; b.style.left = Math.cos(a) * R + "px"; b.style.top = Math.sin(a) * R + "px"; }); }
document.querySelectorAll(".mbtn").forEach(b => b.addEventListener("click", () => {
  const a = b.dataset.a; toggleMenu(false);
  if (a === "talk") listen();
  else if (a === "garden") { say("I will meet you by the pond.", 3500); S.send("open", "garden"); }
  else if (a === "palette") S.send("open", "palette");
  else if (a === "settings") S.send("open", "settings");
  else if (a === "friend") { say("I'll send a friend over.", 3000); setTimeout(() => startVisit(), 1200); }
  else if (a === "mode") { mode = mode === "rest" ? "swim" : "rest"; modeLbl(); S.invoke("setSetting", "overlay", mode); pickTarget(); say(mode === "rest" ? "I will rest here. Call if you need me." : "Ah. Time to stretch the fins.", 3500); }
}));

/* ---------- speech ---------- */
let bubbleT = 0; const pick = a => a[Math.floor(Math.random() * a.length)];
function say(text, ms = 7000, aloud = false){
  $("#btxt").textContent = text; $("#bar").style.display = "none"; $("#bubble").classList.add("show"); bubbleT = clock + ms / 1000;
  if (aloud && window.senseiVoice) senseiVoice.speak(text, { onstart: () => talking = true, onend: () => talking = false });
}
S.on("say", d => {
  if (d.kind === "launch") say(pick([`${d.name}. Go well. Remember to blink.`, `Ah, ${d.name}. I will watch from up here.`, `${d.name}. Play with a calm mind.`]), 5000, true);
  else if (d.kind === "update") say("I have learned something new while you were away. " + (d.text || ""), 9000, true);
  else if (d.text) say(d.text, d.kind === "setup" ? 15000 : 9000);
});
S.on("setup-progress", p => { $("#bar").style.display = "block"; $("#barI").style.width = Math.round(p.p * 100) + "%"; bubbleT = clock + 15; $("#bubble").classList.add("show"); });
const WISDOM = ["Still water reflects the moon. Rest your eyes a moment.", "The koi does not hurry the current. It reads it.", "A bow that is always drawn will break. Stretch your back, my student.", "Drink some water. Ghosts cannot, so do it for both of us."];
const hr = new Date().getHours();
setTimeout(() => say(hr < 5 ? "Awake at this hour? The lantern and I keep strange company." : hr < 11 ? "Good morning, Gabriel-san. The pond is still. Let us begin." : hr < 17 ? "Afternoon, my student. I will float nearby." : hr < 21 ? "Evening. The castle lights itself. So should you." : "Night has come. I am only… resting. Certainly not playing games.", 8000, true), 2500);
const sessionStart = Date.now(); let lastNudge = Date.now();
setInterval(() => { if ((Date.now() - lastNudge) / 60000 > 75) { lastNudge = Date.now(); const hrs = Math.round((Date.now() - sessionStart) / 36e5 * 10) / 10;
  say(hrs >= 2 ? `${hrs} hours at the screen. Stand. Stretch. Look at something far away.` : pick(WISDOM), 9000, true); } }, 60000);
S.on("remote", r => { if (r.connected) say("Ah, the phone remote. Point it at me. Gently.", 5000); });

/* ---------- ears: listen, transcribe on your PC, then act ---------- */
let rec = null;
async function listen(){
  if (listening) { stopListening(); return; }
  if (!(await S.invoke("ears:ready"))) { say("Let me open my ears first. This happens only once…", 15000); const r = await S.invoke("voice:setup"); if (!r || !r.ears) { say("My ears would not open" + (r && r.error ? ": " + r.error : ".") + " Settings → Voice commands → Show log has the details.", 12000); return; } }
  listening = true; $("#ring").classList.add("on"); say("…I am listening.", 20000);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ac = new AudioContext(); const src = ac.createMediaStreamSource(stream); const proc = ac.createScriptProcessor(2048, 1, 1); const chunks = [];
    let spoke = false, quietFor = 0, speechT = 0, floor = .006, n = 0; const t0 = performance.now();
    proc.onaudioprocess = e => { if (!rec) return; const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); let sum = 0; for (let i = 0; i < d.length; i += 2) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / (d.length / 2)), dt = d.length / ac.sampleRate; n++;
      if (n < 6) floor = Math.max(floor, rms * .9); else if (!spoke) floor = floor * .97 + rms * .03;
      const thr = Math.max(.012, floor * 2.8);
      if (rms > thr) { speechT += dt; if (speechT > .12) spoke = true; quietFor = 0; } else { quietFor += dt; }
      const el = (performance.now() - t0) / 1000; if ((spoke && quietFor > .95) || el > 12 || (!spoke && el > 6)) stopListening(); };
    src.connect(proc); proc.connect(ac.destination);
    rec = { stream, ac, proc, chunks, rate: ac.sampleRate, spoke: () => spoke };
  } catch (e) { listening = false; $("#ring").classList.remove("on"); say("I cannot hear you. Is a microphone connected?", 6000); }
}
async function stopListening(){
  listening = false; $("#ring").classList.remove("on");
  if (!rec) return; const r = rec; rec = null;
  try { r.proc.disconnect(); r.stream.getTracks().forEach(t => t.stop()); r.ac.close(); } catch (e) {}
  if (!r.spoke()) { say("…only silence. That is also an answer.", 4000); return; }
  const len = r.chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(len); let o = 0; r.chunks.forEach(c => { all.set(c, o); o += c.length; });
  await hear(all, r.rate);
}
// trim silence, normalise loudness, then resample cleanly to 16 kHz for whisper
function prep(data, rate){ let peak = 0; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const thr = peak * .08, win = Math.round(rate * .02); let a = 0, b = data.length - 1;
  while (a < data.length - win) { let m = 0; for (let i = a; i < a + win; i++) m = Math.max(m, Math.abs(data[i])); if (m > thr) break; a += win; }
  while (b > a + win) { let m = 0; for (let i = b - win; i < b; i++) m = Math.max(m, Math.abs(data[i])); if (m > thr) break; b -= win; }
  a = Math.max(0, a - Math.round(rate * .25)); b = Math.min(data.length, b + Math.round(rate * .3));
  const g = peak > 0 ? Math.min(8, .85 / peak) : 1; const ratio = rate / 16000, n = Math.floor((b - a) / ratio), out = new Float32Array(n + Math.round(16000 * .3));
  for (let i = 0; i < n; i++) { const s0 = a + i * ratio, i0 = Math.floor(s0); let acc = 0, c = 0; for (let k = i0; k < Math.min(b, i0 + Math.ceil(ratio)); k++) { acc += data[k]; c++; } out[i] = c ? acc / c * g : 0; }
  return out; }
let vocab = "";
async function buildVocab(){ try { catalog = catalog || await S.invoke("catalog"); } catch (e) {} const names = (catalog || []).filter(g => g.type !== "app").slice(0, 60).map(g => g.name);
  vocab = "Sensei, open, launch, play, YouTube, Steam, garden, settings, volume up, volume down, pause, next song, come here, " + names.join(", "); }
async function hear(samples, rate){
  say("Hm…", 20000);
  if (!vocab) await buildVocab();
  const pcm = prep(samples, rate); const text = await S.invoke("ears:transcribe", toWav16k(pcm, 16000), vocab);
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || /^\W*$/.test(clean)) { say("The wind took your words. Say it once more.", 5000); return; }
  $("#btxt") && ($("#btxt").textContent = "“" + clean + "”");
  await act(clean);
}
function toWav16k(data, rate){ const ratio = rate / 16000, n = Math.floor(data.length / ratio), out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, data[Math.floor(i * ratio)])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Uint8Array(out.buffer); }
S.on("listen", () => { summon(); listen(); });
S.on("phone-audio", async d => { try { const bin = atob(d.data.split(",").pop()); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ac = new AudioContext(); const buf = await ac.decodeAudioData(u8.buffer); ac.close(); summon(); await hear(buf.getChannelData(0), buf.sampleRate); } catch (e) { say("Your phone's voice was too faint for me.", 5000); } });

/* ---------- commands ---------- */
let catalog = null;
const norm = x => String(x).toLowerCase().replace(/[™®©:'’.\-_]/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b){ const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
function score(name, q){ name = norm(name); q = norm(q); if (!q) return 0; if (name === q) return 6; if (name.startsWith(q)) return 4.5; if (name.includes(q)) return 3.6;
  const nw = name.split(" "), qw = q.split(" "); let hit = 0; for (const w of qw) { let best = 0; for (const v of nw) { const d = lev(w, v), L = Math.max(w.length, v.length); best = Math.max(best, 1 - d / L, v.startsWith(w) && w.length > 2 ? .9 : 0); } hit += best; }
  const whole = 1 - lev(q.replace(/ /g, ""), name.replace(/ /g, "")) / Math.max(q.length, name.length);
  return Math.max(hit / qw.length * 3.2, whole * 3.4); }
async function findApp(q){ catalog = catalog || await S.invoke("catalog"); let best = null, bs = 0; for (const g of catalog) { const s = score(g.name, q) + (g.type !== "app" ? .25 : 0); if (s > bs) { bs = s; best = g; } } return bs >= 2.4 ? best : null; }
const SITES = { soundcloud: "https://soundcloud.com", spotify: "https://open.spotify.com", "youtube music": "https://music.youtube.com", netflix: "https://www.netflix.com", twitch: "https://www.twitch.tv", discord: "https://discord.com/app", twitter: "https://x.com", x: "https://x.com", reddit: "https://www.reddit.com", gmail: "https://mail.google.com", email: "https://mail.google.com", google: "https://www.google.com", "google drive": "https://drive.google.com", drive: "https://drive.google.com", github: "https://github.com", claude: "https://claude.ai", chatgpt: "https://chatgpt.com", tradingview: "https://www.tradingview.com", "trading view": "https://www.tradingview.com", instagram: "https://www.instagram.com", tiktok: "https://www.tiktok.com", amazon: "https://www.amazon.com", maps: "https://maps.google.com", "google maps": "https://maps.google.com", weather: "https://weather.com", notion: "https://www.notion.so", crunchyroll: "https://www.crunchyroll.com", hulu: "https://www.hulu.com", "disney plus": "https://www.disneyplus.com", "prime video": "https://www.primevideo.com", wikipedia: "https://www.wikipedia.org", pinterest: "https://www.pinterest.com", facebook: "https://www.facebook.com", linkedin: "https://www.linkedin.com", "apple music": "https://music.apple.com" };
function siteFor(q){ q = norm(q).replace(/^(the|my)\s+/, "").replace(/\s+(website|site|dot com|\.com)$/, ""); if (SITES[q]) return SITES[q]; let best = null, bs = 0; for (const k of Object.keys(SITES)) { const sc = score(k, q); if (sc > bs) { bs = sc; best = k; } } if (bs >= 3) return SITES[best];
  if (/^[a-z0-9-]+(\.[a-z]{2,})+$/.test(q.replace(/ dot /g, ".").replace(/\s/g, ""))) return "https://" + q.replace(/ dot /g, ".").replace(/\s/g, ""); return null; }
const FILL = /\b(please|for me|can you|could you|would you|i want to|i wanna|let's|lets|go ahead and|the game|game|app|application|real quick|now)\b/g;
async function act(raw){
  const t = norm(raw).replace(/^(hey|okay|ok|hi|yo)\s+/, "").replace(/^(sensei|sense a|sensay|sense eye|sen say)\s*/, "").trim();
  const q0 = t.replace(FILL, " ").replace(/\s+/g, " ").trim(); let m;
  if ((m = q0.match(/^(?:open|launch|start|run|boot|fire up|load)\s+(?:up\s+)?(.+)$/)) || (m = q0.match(/^(?:play)\s+(.+)$/))) {
    const q = m[1].replace(/^(the|my|some)\s+/, "").replace(/\s+on (steam|my pc|the computer)$/, "");
    if (/^(the )?garden$/.test(q)) { say("Come. The pond is waiting.", 4000, true); return S.send("open", "garden"); }
    if (/^settings?$/.test(q)) return S.send("open", "settings");
    if (/^youtube$/.test(q)) { say("YouTube. Do not fall in too deep.", 4000, true); return S.send("openExternal", "https://www.youtube.com"); }
    if ((m = q.match(/^(.+?)\s+on youtube$/))) { say(`Searching YouTube for ${m[1]}.`, 4000, true); return S.send("openExternal", "https://www.youtube.com/results?search_query=" + encodeURIComponent(m[1])); }
    const g = await findApp(q); if (g) { say(`Opening ${g.name}.`, 3500, true); S.send("launch", g); return; }
    const site = siteFor(q); if (site) { say(`Opening ${q.replace(/\b\w/g, c => c.toUpperCase())}.`, 3500, true); return S.send("openExternal", site); }
    if (/^play/.test(q0)) { say(`Playing ${q}.`, 4000, true); return S.send("openExternal", "https://music.youtube.com/search?q=" + encodeURIComponent(q)); }
    // not a game and not a site I know: take him to the best match on the web
    say(`I could not find ${q} on your PC, so I will find it on the web.`, 4500, true); return S.send("openExternal", "https://duckduckgo.com/?q=" + encodeURIComponent("! " + q));
  }
  if ((m = q0.match(/^(?:search\s+)?youtube\s+(?:for\s+)?(.+)$/)) || (m = q0.match(/^(?:watch|search for|look up)\s+(.+?)(?:\s+on youtube)?$/))) { say(`Searching YouTube for ${m[1]}.`, 4000, true); return S.send("openExternal", "https://www.youtube.com/results?search_query=" + encodeURIComponent(m[1])); }
  if (/\b(volume up|louder|turn it up|turn up)\b/.test(t)) { for (let i = 0; i < 5; i++) S.send("key", "plus"); return say("Louder.", 2000); }
  if (/\b(volume down|quieter|turn it down|turn down|lower)\b/.test(t)) { for (let i = 0; i < 5; i++) S.send("key", "minus"); return say("Softer.", 2000); }
  if (/^(pause|resume|stop the music|play pause|stop)( the)?( music| song)?$/.test(t)) { S.send("key", "one"); return say("Hm.", 1500); }
  if (/^(next|skip)( song| track| one)?$/.test(t)) { S.send("key", "next"); return; }
  if (/^(previous|go back|last)( song| track)?$/.test(t)) { S.send("key", "prev"); return; }
  if (/^(hide|go away|disappear|leave me)/.test(t)) { say("I will be in the tray. Call me with your hotkey.", 3000, true); setTimeout(() => S.invoke("setSetting", "overlay", "hidden"), 3000); return; }
  if (/^(rest|sit down|go to (the )?corner)/.test(t)) { mode = "rest"; modeLbl(); S.invoke("setSetting", "overlay", "rest"); pickTarget(); return say("Resting.", 2500, true); }
  if (/^(come here|come back|swim|follow)/.test(t)) { summon(); return say("Here I am.", 2500, true); }
  if (/what time is it|what's the time|whats the time/.test(t)) { const d = new Date(); return say(`It is ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Time flows like the stream. Do not chase it.`, 6000, true); }
  if (/^(connect (my )?phone|remote)$/.test(t)) return S.send("open", "pair");
  // not a known phrase: let the mind decide whether it was a command or a question
  if (/\b(open|launch|start|play|run|put on|youtube|music|song|volume|skip)\b/.test(t)) { if (await route(raw)) return; }
  return ask(raw);
}
async function route(raw){ try { say("Hm…", 15000); const sample = await window.claude.use("sample"); catalog = catalog || await S.invoke("catalog");
    const names = catalog.filter(g => g.type !== "app").slice(0, 80).map(g => g.name).join(" | ");
    const v = await Promise.race([sample.json(`A voice command was transcribed (it may contain mishearings): "${raw}". Installed games: ${names}. Decide what the user wants. Return JSON {"action":"launch"|"youtube"|"music"|"volume_up"|"volume_down"|"pause"|"next"|"garden"|"none","query":"game name exactly as listed, or search words"}.`, { modelTier: "quick", cache: false }), new Promise((_, r) => setTimeout(() => r(new Error("slow")), 9000))]);
    if (!v || v.action === "none") return false;
    if (v.action === "launch") { const g = await findApp(v.query || ""); if (g) { say(`Opening ${g.name}.`, 3500, true); S.send("launch", g); return true; } return false; }
    if (v.action === "youtube") { S.send("openExternal", "https://www.youtube.com/results?search_query=" + encodeURIComponent(v.query || "")); say(`Searching YouTube for ${v.query}.`, 4000, true); return true; }
    if (v.action === "music") { S.send("openExternal", "https://music.youtube.com/search?q=" + encodeURIComponent(v.query || "")); say(`Playing ${v.query}.`, 4000, true); return true; }
    if (v.action === "volume_up") { for (let i = 0; i < 5; i++) S.send("key", "plus"); return true; } if (v.action === "volume_down") { for (let i = 0; i < 5; i++) S.send("key", "minus"); return true; }
    if (v.action === "pause") { S.send("key", "one"); return true; } if (v.action === "next") { S.send("key", "next"); return true; } if (v.action === "garden") { S.send("open", "garden"); return true; }
  } catch (e) {} return false; }
async function ask(q){
  say("…", 30000);
  try {
    const sample = await window.claude.use("sample");
    const prompt = `You are Sensei Hakuun (白雲), a ghost-koi sensei: a calm, warm, gently mischievous old master who speaks like a temple monk, in short measured sentences with images of water, stone and wind. You float on Gabriel's Windows desktop as his companion. He just said aloud to you: "${q}". It is ${new Date().toLocaleString()}. Answer in 1–3 short sentences meant to be spoken aloud. Be accurate and honest; if you do not know, say so. Plain text only.`;
    const r = await Promise.race([sample(prompt, { onText: ({ text }) => { $("#btxt").textContent = text; } }), new Promise((_, rj) => setTimeout(() => rj({ code: "slow" }), 40000))]);
    say(r.text.trim(), 14000, true);
  } catch (e) { say(e && (e.code === "mind_asleep" || e.code === "slow" || e.code === "unavailable") ? "My mind is asleep. Open Settings → Sensei's mind and press Sign in, once. Commands like “open YouTube” still work without it." : "…the wind took my thoughts. Ask once more.", 10000, true); }
}

/* ---------- loop: full frame rate while moving/talking, 30 fps when idle; only a 460px square is drawn ---------- */
let acc = 0, bobY = 0, lastHit = "";
const stage = $("#stage");
function sendHit(force){ const p = local(); const h = { x: Math.round(p.x), y: Math.round(p.y + bobY), r: menuOpen ? 150 : 82 }; const v = visitorHit(); const k = h.x + "," + h.y + "," + h.r + (v ? "|" + v.x + "," + v.y : ""); if (force || k !== lastHit) { lastHit = k; S.send("overlay:hit", v ? [h, v] : h); } }
setInterval(() => sendHit(false), 120);
function frame(now){
  requestAnimationFrame(frame);
  const moving = Math.hypot(target.x - pos.x, target.y - pos.y) > 2;
  const busy = moving || talking || listening || boop > 0 || menuOpen;
  acc += (now - last) / 1000; last = now; if (!busy && acc < 1 / 30) return;
  const dt = Math.min(.1, acc); acc = 0; clock += dt; boop = Math.max(0, boop - dt * 1.5);
  if (clock > nextWander && !menuOpen) pickTarget();
  const dx = target.x - pos.x, dy = target.y - pos.y, d = Math.hypot(dx, dy), speed = mode === "rest" ? 160 : 46;
  if (d > 2 && !menuOpen) { const st = Math.min(d, speed * dt); pos.x += dx / d * st; pos.y += dy / d * st; if (Math.abs(dx) > 6) facing = dx > 0 ? 1 : -1; }
  bobY = Math.sin(clock * 1.1) * 6;
  const p = local(); stage.style.transform = `translate3d(${(p.x - CX).toFixed(1)}px,${(p.y - CY + bobY).toFixed(1)}px,0)`;
  sendHit(false);
  const want = facing > 0 ? -.45 : Math.PI + .45; sensei.root.rotation.y += (want - sensei.root.rotation.y) * Math.min(1, dt * 2.5);
  sensei.update(clock, dt, { talking, boop });
  if (bubbleT && clock > bubbleT) { $("#bubble").classList.remove("show"); bubbleT = 0; }
  renderer.render(scene, cam);
}
requestAnimationFrame(frame);

/* ---------- now and then, an old monk's hum ---------- */
{ const HUMS = ["Hmm…", "Hmmm…", "Hmm… the wind is early today.", "Hmm. Interesting.", "Hmmm… something stirs beneath the water.", "Hm… patience.", "Hmmm… I have seen this before. In another century.", "Hm… do you hear that? …No? Good."];
  const next = () => setTimeout(() => { try { if (!menuOpen && !listening && mode !== "hidden") say(HUMS[Math.floor(Math.random() * HUMS.length)], 4500); } catch (e) {} next(); }, (9 + Math.random() * 9) * 60000);
  next(); }
