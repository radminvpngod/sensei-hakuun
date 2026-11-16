// Sensei Hakuun — the ghost koi, shared by the desktop overlay and future windows.
export function buildSensei(THREE) {
  const C = h => new THREE.Color(h);
  const T = { value: 0 };
  const gm = new THREE.DataTexture(new Uint8Array([105,105,105,255,170,170,170,255,225,225,225,255,255,255,255,255]), 4, 1, THREE.RGBAFormat);
  gm.minFilter = gm.magFilter = THREE.NearestFilter; gm.needsUpdate = true;
  const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: gm, ...o });

  const ghostMat = (base, rim, alpha, depthWrite = true) => new THREE.ShaderMaterial({
    transparent: true, depthWrite,
    uniforms: { uBase: { value: C(base) }, uRim: { value: C(rim) }, uA: { value: alpha }, uT: T },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uBase,uRim; uniform float uA,uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f=pow(1.-abs(dot(normalize(vN),vec3(0.,0.,1.))),2.); float sh=.5+.5*sin(vP.x*6.+vP.y*4.-uT*1.6);
        vec3 c=mix(uBase,uRim,f)*(1.+.12*sh); float a=clamp(uA+f*.45,0.,1.); gl_FragColor=vec4(c,a);
      #include <colorspace_fragment>
      }`
  });
  const wispMat = (alpha = .8, phase = 0, amp = .25, color = '#eafaff') => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: T, uP: { value: phase }, uAmp: { value: amp }, uA: { value: alpha }, uC: { value: C(color) } },
    vertexShader: `uniform float uT,uP,uAmp; varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; float t=uv.x; p.y=p.y*(1.-t*.85)+sin(t*6.-uT*3.+uP)*uAmp*t; p.z+=cos(t*4.5-uT*2.2+uP)*uAmp*.7*t; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform float uA; uniform vec3 uC; varying vec2 vUv; void main(){ float a=pow(1.-vUv.x,1.4)*(1.-pow(abs(vUv.y-.5)*2.,2.))*uA; gl_FragColor=vec4(uC,a*.85);
      #include <colorspace_fragment>
      }`
  });
  const ribbon = new THREE.PlaneGeometry(1, 1, 28, 1); ribbon.translate(.5, 0, 0);
  const wisp = (len, w, a, ph, amp, col) => { const m = new THREE.Mesh(ribbon, wispMat(a, ph, amp, col)); m.scale.set(len, w, 1); return m; };

  const root = new THREE.Group(); const rig = new THREE.Group(); root.add(rig);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), ghostMat('#eef6fc', '#9fdcff', .62)); body.scale.set(1.55, .8, .66); rig.add(body);
  const tailBody = new THREE.Mesh(new THREE.ConeGeometry(.62, 1.6, 32, 1, true), ghostMat('#f2f9ff', '#b7e6ff', .45, false)); tailBody.rotation.z = Math.PI / 2; tailBody.position.x = -1.75; tailBody.scale.set(1, 1, .85); rig.add(tailBody);
  [[-.45, .55, .15, .48], [.35, .6, -.1, .38]].forEach(([x, y, z, r]) => { const p = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), ghostMat('#ffd6cc', '#ffffff', .35, false)); p.scale.set(r, r * .4, r * .85); p.position.set(x, y, z); rig.add(p); });
  const robeG = new THREE.Group(); robeG.scale.set(1, .84, .7); robeG.position.x = -.05; rig.add(robeG);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(1.0, .97, 1.2, 40, 1, true), ghostMat('#e9eef9', '#c6d4ff', .55, false)); robe.material.side = THREE.DoubleSide; robe.rotation.z = Math.PI / 2; robeG.add(robe);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, .06, 8, 48), new THREE.MeshBasicMaterial({ color: C('#3c4f8f'), transparent: true, opacity: .85 })); collar.rotation.y = Math.PI / 2; collar.position.x = .6; robeG.add(collar);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(1.02, .09, 8, 48), new THREE.MeshBasicMaterial({ color: C('#d8b26a'), transparent: true, opacity: .8 })); sash.rotation.y = Math.PI / 2; sash.position.x = .02; robeG.add(sash);
  const tail = new THREE.Group(); tail.position.x = -2.4; rig.add(tail);
  [[3.6, 1.1, .75, 0, .35, 0], [3.0, .8, .6, 1.5, .3, .45], [3.0, .8, .6, 3, .3, -.45], [4.4, .55, .5, 2, .45, .15], [4.0, .5, .45, 4, .4, -.2]].forEach(([l, w, a, ph, amp, ang]) => { const p = wisp(l, w, a, ph, amp); p.rotation.y = Math.PI; p.rotation.z = ang; tail.add(p); });
  const dorsal = wisp(1.8, .9, .55, 1, .12); dorsal.position.set(.4, .62, 0); dorsal.rotation.set(0, Math.PI, -.35); rig.add(dorsal);
  const pecs = [-1, 1].map(sd => { const g = new THREE.Group(); g.position.set(.5, -.45, sd * .5); const w = wisp(1.4, .6, .6, sd * 2, .18); w.rotation.set(sd * .6, Math.PI * .85, -.9); g.add(w); rig.add(g); return g; });
  for (let i = 0; i < 4; i++) { const w = wisp(2.2 + i * .3, .45, .45, i * 1.3, .3); w.position.set(-.6 + i * .35, -.55, (i - 1.5) * .2); w.rotation.set(0, Math.PI * .5 + (i - 1.5) * .2, -1.35); rig.add(w); }
  const eyes = [], hi = [];
  [-1, 1].forEach(sd => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1b2233 })); e.position.set(1.2, .16, sd * .44); rig.add(e); eyes.push(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); h.position.set(1.27, .2, sd * .53); rig.add(h); hi.push(h);
    const brow = wisp(.75, .16, .95, sd, .05, '#ffffff'); brow.position.set(1.18, .36, sd * .43); brow.rotation.set(0, Math.PI * .9, .35); rig.add(brow);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.1, .022, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x7d8fa8 })); mouth.position.set(1.6, -.08, 0); mouth.rotation.set(0, Math.PI / 2, Math.PI); rig.add(mouth);
  const beard = new THREE.Group(); beard.position.set(1.5, -.12, 0); rig.add(beard);
  [[2.0, .22, 0, 0], [2.4, .18, .8, .18], [2.2, .18, 1.6, -.18], [1.7, .14, 2.4, .32], [1.8, .14, 3.1, -.3]].forEach(([l, w, ph, z]) => { const b = wisp(l, w, .95, ph, .16, '#ffffff'); b.rotation.z = -Math.PI / 2 + .25; b.position.z = z; beard.add(b); });
  const hat = new THREE.Group(); hat.position.set(.78, .8, 0); hat.rotation.z = -.28; rig.add(hat);
  hat.add(new THREE.Mesh(new THREE.ConeGeometry(1.05, .5, 40, 1, true), new THREE.MeshToonMaterial({ color: '#dcc08a', gradientMap: gm, side: THREE.DoubleSide })));
  for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 - i * .32, .018, 4, 48), toon('#9a7440')); ring.rotation.x = Math.PI / 2; ring.position.y = -.25 + i * .155; hat.add(ring); }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), toon('#8d6a36')); knob.position.y = .27; hat.add(knob);

  let nextBlink = 2, blink = 0;
  function update(t, dt, opts = {}) {
    T.value = t;
    const talk = opts.talking ? 1 : 0;
    rig.position.y = Math.sin(t * 1.1) * .2;
    rig.rotation.z = Math.sin(t * .7) * .05 + (opts.boop || 0) * .15 * Math.sin(t * 22);
    rig.rotation.x = Math.sin(t * .5) * .05;
    tail.rotation.y = Math.sin(t * 1.8) * .3 + talk * Math.sin(t * 7) * .1;
    pecs.forEach((p, i) => p.rotation.x = Math.sin(t * 2.6 + i * Math.PI) * .35);
    beard.rotation.z = Math.sin(t * 1.3) * .08; beard.rotation.x = Math.sin(t * .9) * .06;
    mouth.scale.y = talk ? .6 + .6 * Math.abs(Math.sin(t * 11)) : 1;
    if (t > nextBlink) { blink = .15; nextBlink = t + 2.5 + Math.random() * 3.5; }
    const closed = blink > 0 || (opts.eyesClosed && !talk); if (blink > 0) blink -= dt;
    eyes.forEach(e => e.scale.y = closed ? .12 : 1); hi.forEach(h => h.visible = !closed);
  }
  return { root, rig, update };
}
