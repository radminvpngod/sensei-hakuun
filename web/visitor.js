// A friend from the garden visits your desktop: walks along the bottom of your main screen, plays, hums, says hello.
// Once a day (a few minutes after Sensei starts), or any time from Sensei's menu → 友 Friend.
const FRIENDS = {
  mochi: { name: "Mochi", kind: "rabbit", fur: "#f4efe6", robe: "#d98aa0", sash: "#7a3a4a", inst: "shamisen", fx: "♪",
    lines: ["Sensei says you work too hard. I brought a song instead.", "Your desktop is very tidy. Mine is full of mochi.", "Do you want to hear a song? You are going to hear a song.", "The moon is almost full. I can feel it in my ears."] },
  hoshi: { name: "Hoshi", kind: "owl", fur: "#8a6a4a", robe: "#3d4a7a", sash: "#d8b26a", inst: "koto", fx: "✦",
    lines: ["Hoo. Your posture. Fix it.", "I came to look at your stars. You have very few. Open a window.", "Sensei and I argued about go again. I won. He says otherwise."] },
  kuma: { name: "Kuma", kind: "bear", fur: "#6a4a32", robe: "#4f6a3a", sash: "#c9a24a", inst: "taiko", fx: "◍",
    lines: ["I made you a bowl. It's invisible. It's a very modern bowl.", "Is this where you work? It's warm. I could nap here.", "Hide and seek? I'll hide behind the clock."] },
  suzu: { name: "Suzu", kind: "crane", fur: "#ffffff", robe: "#e9e4d8", sash: "#c43c28", inst: "flute", fx: "♪",
    lines: ["Drink some water. Cranes know about water.", "Your tea is too hot. Everyone's tea is too hot.", "I'll play softly. You keep working."] },
  hana: { name: "Hana", kind: "fox", fur: "#e07a3a", robe: "#6aa07a", sash: "#f2d264", inst: "bells", fx: "❀",
    lines: ["I rearranged nothing on your desktop. Probably.", "This screen needs flowers. Here, have some.", "Sensei misses you when you're gone. He won't say it, so I will."] } };
const V = { on: false, id: null, x: 0, dir: 1, t: 0, until: 0, pause: 0, hop: 0, fx: [], next: 0, startAt: 0 };
const vc = document.createElement("canvas"); vc.width = 140; vc.height = 190; vc.id = "visitor";
vc.style.cssText = "position:absolute;left:0;top:0;width:140px;height:190px;pointer-events:auto;display:none;cursor:pointer;filter:drop-shadow(0 0 12px rgba(200,230,255,.45))";
const vb = document.createElement("div"); vb.style.cssText = "position:absolute;max-width:260px;padding:10px 14px;border-radius:14px;background:rgba(247,240,222,.96);color:#2b2420;font:14px/1.4 'Yu Mincho','MS Mincho',Georgia,serif;box-shadow:0 8px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .4s;pointer-events:none";
document.body.appendChild(vc); document.body.appendChild(vb);
const vg = vc.getContext("2d"); let actx = null;
const lay = () => window.__senseiLayout || { origin: { x: 0, y: 0 }, primary: { x: 0, y: 0, w: screen.availWidth, h: screen.availHeight } };
const today = () => new Date().toLocaleDateString("en-CA");
function pickFriend() { let arrived = []; try { const st = JSON.parse(localStorage.getItem("senseiState") || "null"); arrived = (st && st.companions && st.companions.arrived) || []; } catch (e) {}
  const pool = arrived.length ? arrived : Object.keys(FRIENDS); return pool[Math.floor(Math.random() * pool.length)]; }
function say(txt, ms = 6500) { vb.textContent = txt; vb.style.opacity = "1"; clearTimeout(vb._t); vb._t = setTimeout(() => vb.style.opacity = "0", ms); }
function play(inst) { try { actx = actx || new AudioContext(); const t = actx.currentTime, sc = [0, 2, 4, 7, 9, 12], base = { flute: 523, koto: 392, taiko: 80, bells: 1046 }[inst] || 330;
  for (let i = 0; i < 5; i++) { const o = actx.createOscillator(), g = actx.createGain(), tt = t + i * (inst === "taiko" ? .3 : .22); o.type = inst === "flute" || inst === "taiko" ? "sine" : "triangle"; o.frequency.setValueAtTime(base * 2 ** (sc[Math.floor(Math.random() * sc.length)] / 12), tt); if (inst === "taiko") o.frequency.exponentialRampToValueAtTime(40, tt + .3);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.05, tt + .01); g.gain.exponentialRampToValueAtTime(.0001, tt + (inst === "bells" ? 1.4 : .6)); o.connect(g); g.connect(actx.destination); o.start(tt); o.stop(tt + 1.5); } } catch (e) {} }
export function startVisit(id) { const f = id || pickFriend(); const F = FRIENDS[f]; if (!F) return; const P = lay().primary; Object.assign(V, { on: true, id: f, x: P.x + P.w * .25, dir: 1, t: 0, until: performance.now() + 40 * 60e3, pause: 0, next: performance.now() + 9000 });
  vc.style.display = "block"; try { localStorage.setItem("visitDay", today()); } catch (e) {}
  let arrived = false; try { arrived = ((JSON.parse(localStorage.getItem("senseiState") || "null") || {}).companions || {}).arrived?.includes(f); } catch (e) {}
  setTimeout(() => say(arrived ? `${F.name} here! Sensei said I could visit your desktop for a while.` : `Hello. I'm ${F.name}, a friend of Sensei's. He told me about you. Maybe I'll move into the garden one day.`, 8000), 600); }
export function endVisit() { V.on = false; vc.style.display = "none"; vb.style.opacity = "0"; }
export function visitorHit() { if (!V.on) return null; const o = lay().origin, P = lay().primary; return { x: Math.round(V.x - o.x), y: Math.round(P.y + P.h - 95 - o.y), r: 70 }; }
vc.addEventListener("click", () => { if (!V.on) return; const F = FRIENDS[V.id]; V.hop = 1; V.pause = 4; play(F.inst); say(F.lines[Math.floor(Math.random() * F.lines.length)]); });
vc.addEventListener("dblclick", () => { if (!V.on) return; say(`${FRIENDS[V.id].name} waves goodbye and floats back to the garden.`, 3500); setTimeout(endVisit, 2500); });
function draw(F, step) { const g = vg; g.clearRect(0, 0, 140, 190); const cx = 70, by = 150 - V.hop * 26 + Math.sin(V.t * 2) * 4;
  // ghostly robe with a wavy hem
  g.save(); g.globalAlpha = .82; const grd = g.createLinearGradient(0, by - 70, 0, by + 30); grd.addColorStop(0, F.robe); grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.beginPath(); g.moveTo(cx - 24, by - 58);
  g.quadraticCurveTo(cx - 40, by - 10, cx - 34, by + 22); for (let k = 0; k <= 6; k++) g.lineTo(cx - 34 + k * 11.3, by + 22 + Math.sin(V.t * 5 + k) * 5 * (k % 2 ? 1 : -1)); g.quadraticCurveTo(cx + 40, by - 10, cx + 24, by - 58); g.closePath(); g.fill();
  g.fillStyle = F.sash; g.fillRect(cx - 27, by - 30, 54, 8); g.restore();
  // head and ears
  g.save(); g.globalAlpha = .9; g.fillStyle = F.fur; g.strokeStyle = "rgba(40,30,30,.6)"; g.lineWidth = 2; g.beginPath(); g.arc(cx, by - 76, 26, 0, Math.PI * 2); g.fill(); g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); if (F.kind === "rabbit") g.ellipse(cx + s * 11, by - 116, 7, 20, s * .2, 0, Math.PI * 2); else if (F.kind === "crane") { g.moveTo(cx + s * 3, by - 100); g.lineTo(cx + s * 9, by - 112); g.lineTo(cx + s * 13, by - 98); } else { g.moveTo(cx + s * 12, by - 94); g.lineTo(cx + s * 22, by - 116); g.lineTo(cx + s * 26, by - 88); } g.fill(); g.stroke(); }
  if (F.kind === "crane") { g.fillStyle = "#c43c28"; g.beginPath(); g.arc(cx, by - 101, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#1d1a1a"; const blink = Math.sin(V.t * .7) > .985 ? .2 : 1; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 9 + V.dir * 3, by - 78, F.kind === "owl" ? 5 : 3, (F.kind === "owl" ? 5 : 3.4) * blink, 0, 0, Math.PI * 2); g.fill(); } g.restore();
  // floating notes / petals / stars
  V.fx.forEach(f => { g.globalAlpha = Math.max(0, 1 - f.t / 2.4); g.fillStyle = F.fx === "❀" ? "#f4b6c8" : F.fx === "✦" ? "#fff2b0" : "#ffffff"; g.font = "20px serif"; g.fillText(F.fx, f.x, f.y); }); g.globalAlpha = 1; }
let lastT = performance.now();
function loop(now) { requestAnimationFrame(loop); const dt = Math.min(.1, (now - lastT) / 1000); if (dt < 1 / 30) return; lastT = now;
  if (!V.on) { if (!V.startAt) { let seen = ""; try { seen = localStorage.getItem("visitDay") || ""; } catch (e) {} V.startAt = seen === today() ? -1 : now + (3 + Math.random() * 6) * 60e3; } if (V.startAt > 0 && now > V.startAt) { V.startAt = -1; startVisit(); } return; }
  if (now > V.until) { say(`${FRIENDS[V.id].name}: Time to head back. Come visit the garden.`, 4000); setTimeout(endVisit, 3000); V.until = Infinity; }
  const F = FRIENDS[V.id], P = lay().primary, o = lay().origin; V.t += dt; V.hop = Math.max(0, V.hop - dt * 2.5);
  if (V.pause > 0) { V.pause -= dt; if (Math.random() < dt * 2) V.fx.push({ x: 55 + Math.random() * 30, y: 40, t: 0 }); }
  else { V.x += V.dir * 38 * dt; if (V.x > P.x + P.w - 120) V.dir = -1; if (V.x < P.x + 120) V.dir = 1; if (Math.random() < dt * .08) { V.pause = 5 + Math.random() * 8; play(F.inst); } }
  V.fx.forEach(f => { f.t += dt; f.y -= 22 * dt; f.x += Math.sin(f.t * 3) * .4; }); V.fx = V.fx.filter(f => f.t < 2.4);
  if (now > V.next) { V.next = now + (150 + Math.random() * 180) * 1000; say(F.lines[Math.floor(Math.random() * F.lines.length)]); }
  const lx = V.x - o.x - 70, ly = P.y + P.h - 190 - o.y; vc.style.transform = `translate3d(${lx.toFixed(1)}px,${ly}px,0) scaleX(${V.dir < 0 ? -1 : 1})`;
  vb.style.left = Math.max(10, lx - 60) + "px"; vb.style.top = (ly - 70) + "px"; draw(F, dt); }
requestAnimationFrame(loop);
