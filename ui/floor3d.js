/* Tolerance workspace app: the factory floor in 3D. Same data as the 2D floor (/api/ws/twin), drawn as a lit scene:
   stations with procedural machines, a status light on each, parts that travel along the flows, a camera that flies to the event. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer, RenderPass, NormalPass, EffectPass, SSAOEffect, BloomEffect, DepthOfFieldEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect } from 'postprocessing';

const A = window.A, { $, esc, api, fmt } = A;
const W = 30, D = 17;                                   // world size of the floor (x by z)
const COL = { body: 0x2b3038, panel: 0xc9d0d8, dark: 0x14171b, amber: 0xf2b84b, red: 0xef6b57, mid: 0x7d8791 };
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const kindOf = s => { const n = (s.name + ' ' + (s.asset || '')).toLowerCase();
  if (/inspect|aoi|\bspi\b|\bict\b|\bfct\b|test|quality/.test(n)) return 'inspect';
  if (/agv|vehicle|forklift|\bamr\b/.test(n)) return 'agv';
  if (/\bwh\d|warehouse|store|rack|stock/.test(n)) return 'warehouse';
  if (/\bc\d\b|conveyor|belt/.test(n)) return 'conveyor';
  if (/\btr\b|transfer|robot|arm|gantry/.test(n)) return 'transfer';
  return 'machine'; };

A.pages.floor3d = async page => {
  page.classList.add('full');
  let tw = await api('/ws/twin');
  if (!tw.has_data) { page.innerHTML = `<div class="floor"><div class="fempty"><h2>Your factory floor in 3D</h2><p class="sub">Connect a machine state log and every machine appears here.</p><a class="btn" href="#/data">Connect data</a></div></div>`; return; }
  page.innerHTML = `<div class="f3d" id="f3d"><canvas id="c3"></canvas><div id="l3"></div>
    <div class="ftool glass"><div class="seg"><a href="#/floor">2D</a><a class="on" href="#/floor3d">3D</a><a href="#/map">Systems</a></div><span class="dim" style="font-size:11.5px">drag to orbit · scroll to zoom · click a machine</span></div>
    <div class="alert3 glass" id="al3"></div><div class="card3 glass" id="cd3"></div><div class="hint3" id="h3"></div></div>`;
  const host = $('#f3d'), canvas = $('#c3');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { host.innerHTML = '<div class="fempty"><h2>3D needs WebGL</h2><p class="sub">This browser could not start WebGL. Use the 2D floor.</p><a class="btn" href="#/floor">Open 2D floor</a></div>'; return; }
  const lite = /lite=1/.test(location.search);
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c0f); scene.fog = new THREE.Fog(0x0b0c0f, 38, 80);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 140);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = .07; controls.maxPolarAngle = 1.38; controls.minDistance = 4; controls.maxDistance = 46;
  const OVER = { pos: new THREE.Vector3(15, 17, 19), tgt: new THREE.Vector3(0, 0, 1.2) };
  camera.position.copy(OVER.pos); controls.target.copy(OVER.tgt);

  // light
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-10, 22, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 60 }); key.shadow.bias = -0.0004; key.shadow.radius = 5; scene.add(key);
  scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x15171b, 0.35));

  // composer
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: lite ? 0 : 4 });
  composer.addPass(new RenderPass(scene, camera));
  let dof = null;
  if (!lite) {
    const normal = new NormalPass(scene, camera); composer.addPass(normal);
    composer.addPass(new EffectPass(camera, new SSAOEffect(camera, normal.texture, { samples: 10, rings: 5, radius: .09, intensity: 2.2, bias: .03, distanceScaling: true, worldDistanceThreshold: 28, worldDistanceFalloff: 8, worldProximityThreshold: .8, worldProximityFalloff: .4 })));
    dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 26, worldFocusRange: 14, bokehScale: 1.4, resolutionScale: .5 });
    composer.addPass(new EffectPass(camera, dof));
  }
  composer.addPass(new EffectPass(camera, new BloomEffect({ intensity: 1.15, luminanceThreshold: 0.82, luminanceSmoothing: .18, mipmapBlur: true, radius: .7 })));
  composer.addPass(new EffectPass(camera, new VignetteEffect({ offset: .32, darkness: .55 }), new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })));

  // floor slab with a faint grid
  const gc = document.createElement('canvas'); gc.width = 2048; gc.height = Math.round(2048 * D / W); const g = gc.getContext('2d');
  g.fillStyle = '#16191e'; g.fillRect(0, 0, gc.width, gc.height); g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1.5;
  for (let x = 0; x <= W; x += 1) { g.beginPath(); g.moveTo(x / W * gc.width, 0); g.lineTo(x / W * gc.width, gc.height); g.stroke(); }
  for (let z = 0; z <= D; z += 1) { g.beginPath(); g.moveTo(0, z / D * gc.height); g.lineTo(gc.width, z / D * gc.height); g.stroke(); }
  const gtex = new THREE.CanvasTexture(gc); gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = 8;
  const slab = new THREE.Mesh(new RoundedBoxGeometry(W + 1.4, .5, D + 1.4, 3, .22), [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial(i === 2 ? { map: gtex, roughness: .32, metalness: .15 } : { color: 0x1c2026, roughness: .6, metalness: .3 })));
  slab.position.y = -.26; slab.receiveShadow = true; scene.add(slab);

  // materials
  const M = { body: new THREE.MeshStandardMaterial({ color: COL.body, roughness: .42, metalness: .65 }), panel: new THREE.MeshStandardMaterial({ color: COL.panel, roughness: .34, metalness: .12 }),
    dark: new THREE.MeshStandardMaterial({ color: COL.dark, roughness: .55, metalness: .4 }), pad: new THREE.MeshStandardMaterial({ color: 0x222831, roughness: .4, metalness: .35 }), crate: [0x6b7280, 0x8a93a0, 0x59616d].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: .1 })),
    glowAmber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, .35), toneMapped: false }), glowWhite: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.9), toneMapped: false }) };
  const rb = (w, h, d, r = .05) => new RoundedBoxGeometry(w, h, d, 3, r);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return m; };

  // machine builders: each returns {g, tick(t, busy)}
  const BUILD = {
    warehouse() { const g = new THREE.Group(); const idle = [];
      for (const dz of [-.8, .8]) { for (const [x, zz] of [[-1.2, -.35], [1.2, -.35], [-1.2, .35], [1.2, .35]]) g.add(mesh(rb(.08, 2.3, .08, .02), M.body, x, 1.2, dz + zz));
        for (let l = 0; l < 3; l++) { g.add(mesh(rb(2.5, .06, .8, .02), M.panel, 0, .55 + l * .75, dz)); for (let k = 0; k < 4; k++) if (Math.random() > .18) g.add(mesh(rb(.45, .38, .5, .03), M.crate[(k + l) % 3], -.85 + k * .58, .8 + l * .75, dz)); } }
      return { g, tick() { } }; },
    conveyor() { const g = new THREE.Group(); g.add(mesh(rb(3.8, .32, 1.05, .06), M.body, 0, .3, 0)); const belt = mesh(rb(3.6, .06, .86, .02), M.dark, 0, .5, 0, false); g.add(belt);
      for (const s of [-1, 1]) g.add(mesh(rb(3.8, .16, .06, .02), M.panel, 0, .56, s * .5));
      const strips = []; for (let i = 0; i < 12; i++) { const s = mesh(rb(.05, .02, .8, .01), M.glowWhite, 0, .54, 0, false); s.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .55, .62), toneMapped: false }); g.add(s); strips.push(s); }
      const boxes = [0, 1, 2].map(i => { const b = mesh(rb(.5, .36, .5, .04), M.crate[i % 3], 0, .74, 0); g.add(b); return b; });
      return { g, tick(t, busy, dt) { const v = busy ? .9 : 0; this.o = ((this.o || 0) + v * dt) % .6; strips.forEach((s, i) => s.position.x = -1.8 + ((i * .3 + this.o) % 3.6)); boxes.forEach((b, i) => { b.visible = true; const u = ((i / 3) + (this.p = ((this.p || 0) + (busy ? .0007 : 0)) % 1)) % 1; b.position.x = -1.5 + u * 3; }); } }; },
    transfer() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.75, .9, .4, 40), M.body, 0, .22, 0)); const a1 = new THREE.Group(); a1.position.y = .45; g.add(a1);
      a1.add(mesh(new THREE.CylinderGeometry(.32, .32, .5, 28), M.panel, 0, .25, 0)); const l1 = mesh(rb(1.5, .26, .3, .08), M.panel, .7, .55, 0); a1.add(l1); const a2 = new THREE.Group(); a2.position.set(1.35, .55, 0); a1.add(a2);
      a2.add(mesh(rb(1.25, .22, .24, .07), M.body, .55, 0, 0)); a2.add(mesh(new THREE.CylinderGeometry(.1, .1, .5, 16), M.dark, 1.1, -.25, 0)); const led = mesh(new THREE.SphereGeometry(.07, 12, 12), M.glowAmber, 1.1, -.55, 0, false); a2.add(led);
      return { g, tick(t, busy) { const k = busy ? 1 : .15; a1.rotation.y = Math.sin(t * .9) * .9 * k; a2.rotation.y = Math.sin(t * 1.4 + 1) * .7 * k; } }; },
    agv() { const g = new THREE.Group(); const car = new THREE.Group(); car.add(mesh(rb(1.5, .38, .95, .1), M.panel, 0, .32, 0)); car.add(mesh(rb(1.1, .14, .8, .06), M.body, 0, .58, 0));
      for (const [x, z] of [[-.55, -.5], [.55, -.5], [-.55, .5], [.55, .5]]) { const w = mesh(new THREE.CylinderGeometry(.16, .16, .12, 20), M.dark, x, .17, z); w.rotation.x = Math.PI / 2; car.add(w); }
      car.add(mesh(rb(.06, .06, .5, .02), M.glowWhite, .76, .38, 0, false)); const beacon = mesh(new THREE.SphereGeometry(.08, 12, 12), M.glowAmber, -.3, .75, 0, false); car.add(beacon); g.add(car);
      return { g, tick(t, busy) { const u = busy ? Math.sin(t * .5) : Math.sin(.9 * .5); car.position.x = u * 1.4; car.rotation.y = Math.cos(t * .5) > 0 ? 0 : Math.PI; if (!busy) car.rotation.y = 0; } }; },
    inspect() { const g = new THREE.Group(); g.add(mesh(rb(2.2, .3, 1.6, .06), M.body, 0, .3, 0)); g.add(mesh(rb(1.6, .06, 1.1, .03), M.panel, 0, .5, 0));
      for (const s of [-1, 1]) g.add(mesh(rb(.12, 1.5, .12, .03), M.body, s * 1.15, 1.0, 0)); g.add(mesh(rb(2.5, .2, .24, .05), M.body, 0, 1.8, 0)); const bar = mesh(rb(.04, .04, 1.2, .01), M.glowWhite, 0, 1.62, 0, false); g.add(bar);
      const cam = mesh(rb(.3, .24, .3, .05), M.panel, 0, 1.55, 0); g.add(cam); const board = mesh(rb(.9, .04, .6, .01), new THREE.MeshStandardMaterial({ color: 0x1f6b4f, roughness: .5, metalness: .3 }), 0, .56, 0); g.add(board);
      return { g, tick(t, busy) { const x = busy ? Math.sin(t * 1.3) * .8 : 0; bar.position.x = x; cam.position.x = x; } }; },
    machine() { const g = new THREE.Group(); g.add(mesh(rb(2.4, 1.4, 1.6, .1), M.body, 0, .75, 0)); g.add(mesh(rb(1.3, .6, .06, .02), new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: .15, metalness: .5 }), 0, .95, .82));
      g.add(mesh(rb(1.6, .1, 1.0, .03), M.panel, 0, 1.5, 0)); const lamp = mesh(new THREE.SphereGeometry(.09, 12, 12), M.glowAmber, .9, 1.62, .6, false); g.add(lamp); return { g, tick() { } }; } };

  // stations
  const stations = new Map(), flowsG = new THREE.Group(), carriers = [], rings = []; scene.add(flowsG);
  const wpos = s => new THREE.Vector3((s.x - .5) * (W - 6), 0, (s.y - .5) * (D - 4));
  const stateCol = st => st === 'failed' ? COL.red : st === 'busy' ? 0xdfe6ee : st === 'idle' ? 0x56606c : 0x3a414a;
  let sig = '', prev = {}, flyT = null, selected = null, userT = 0;

  function labelFor(s) { const el = document.createElement('div'); el.className = 'l3i'; el.dataset.id = s.id; el.innerHTML = `<i class="s ${s.state}"></i><b>${esc(s.name)}</b>`; $('#l3').appendChild(el); return el; }
  function build() {
    stations.forEach(o => { scene.remove(o.group); }); stations.clear(); $('#l3').innerHTML = ''; rings.splice(0).forEach(r => scene.remove(r.m));
    tw.stations.forEach(s => {
      const p = wpos(s), kind = kindOf(s), grp = new THREE.Group(); grp.position.copy(p);
      const pad = mesh(rb(4.6, .16, 3.6, .08), M.pad, 0, .02, 0); pad.userData.sid = s.id; grp.add(pad);
      const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(stateCol(s.state)), toneMapped: false }); const edge = mesh(rb(4.5, .035, .05, .01), edgeMat, 0, .115, 1.78, false); grp.add(edge);
      const edge2 = edge.clone(); edge2.position.z = -1.78; edge2.material = edgeMat; grp.add(edge2);
      const m = BUILD[kind](); m.g.position.y = .1; grp.add(m.g);
      const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(stateCol(s.state)), toneMapped: false }); const pole = mesh(new THREE.CylinderGeometry(.03, .03, 2.6, 8), M.dark, 1.9, 1.4, -1.5, false); const beacon = mesh(new THREE.SphereGeometry(.14, 16, 16), beaconMat, 1.9, 2.8, -1.5, false); grp.add(pole, beacon);
      const light = new THREE.PointLight(COL.red, 0, 7, 1.6); light.position.set(0, 2.4, 0); grp.add(light);
      scene.add(grp);
      const swMark = (s.sw_alerts || []).length ? mesh(new THREE.TorusGeometry(.26, .04, 8, 28), M.glowAmber, 1.9, 3.2, -1.5, false) : null; if (swMark) { swMark.rotation.x = Math.PI / 2; grp.add(swMark); }
      stations.set(s.id, { s, group: grp, pad, edgeMat, beaconMat, beacon, light, m, kind, label: labelFor(s), pos: p, mark: swMark });
    });
    // flows: a strip on the floor and parts that travel along it
    flowsG.clear(); carriers.length = 0;
    tw.flows.filter(f => f.status !== 'rejected').forEach(f => {
      const a = stations.get(f.a), b = stations.get(f.b); if (!a || !b) return;
      const pa = a.pos.clone().setY(.2), pb = b.pos.clone().setY(.2), mid = pa.clone().lerp(pb, .5).setY(.2);
      const curve = new THREE.CatmullRomCurve3([pa, mid, pb]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .035, 6, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, .78, .25), toneMapped: false, transparent: true, opacity: f.status === 'suggested' ? .35 : .8 })); flowsG.add(tube);
      for (let i = 0; i < 3; i++) { const part = mesh(rb(.34, .24, .34, .05), M.crate[i % 3], 0, .35, 0); flowsG.add(part); carriers.push({ part, curve, off: i / 3, from: f.a }); }
    });
    const ev = tw.stations.map(s => s.id + s.x.toFixed(2) + s.y.toFixed(2) + s.name).join('|'); sig = ev + tw.flows.map(f => f.id + f.status).join('|');
  }
  function applyStates() {
    tw.stations.forEach(s => { const o = stations.get(s.id); if (!o) return; o.s = s; const c = new THREE.Color(stateCol(s.state)); if (s.state === 'failed' || s.state === 'busy') c.multiplyScalar(1.6); o.edgeMat.color.copy(c); o.beaconMat.color.copy(c);
      o.label.querySelector('.s').className = 's ' + s.state; });
  }
  function toast(t) { const el = $('#h3'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 4200); }

  // camera moves
  function flyTo(pos, tgt, ms = 1300) { flyT = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: pos.clone(), t1: tgt.clone() }; }
  function focus(id) {
    const o = stations.get(id); if (!o) return; selected = id; const t = o.pos.clone().add(new THREE.Vector3(0, .9, 0)); flyTo(t.clone().add(new THREE.Vector3(5.2, 3.6, 6.4)), t, 1200); card(o.s);
  }
  function overview() { selected = null; flyTo(OVER.pos, OVER.tgt, 1200); $('#cd3').classList.remove('on'); }
  function card(s) {
    const el = $('#cd3'); el.classList.add('on');
    el.innerHTML = `<div class="row sb"><b style="font-size:15px">${esc(s.name)}</b><button class="x" id="cx3">×</button></div><div class="row" style="gap:14px;margin:6px 0 2px"><span class="big3 ${s.state}"><i class="s ${s.state}"></i>${esc(s.state)}</span>${s.p_fail != null ? `<span class="dim">${Math.round(s.p_fail * 100)}% chance of a failure in 4 h</span>` : ''}</div>
      <div class="dim" style="font-size:12px">${s.failures != null ? s.failures + ' failures seen · ' : ''}${(s.binds || []).map(b => esc(b.table)).join(', ') || 'no data bound'}</div>${(s.sw_alerts || []).length ? `<div class="gp" style="margin-top:6px">${s.sw_alerts.length} software alert${s.sw_alerts.length === 1 ? '' : 's'} on a linked system</div>` : ''}
      <div class="row" style="margin-top:8px"><a class="btn g sm" href="#/floor">Live view in 2D</a></div>`;
    $('#cx3').onclick = overview;
  }
  function alertBar() {
    const f = tw.stations.filter(s => s.state === 'failed'), el = $('#al3'); if (!f.length) { el.classList.remove('on'); return; }
    el.classList.add('on'); el.innerHTML = f.map(s => `<button data-id="${esc(s.id)}"><i class="s failed"></i><b>${esc(s.name)}</b> failed</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => focus(b.dataset.id));
  }

  // input
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; userT = performance.now(); });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; } down = null;
    const r = canvas.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects([...stations.values()].map(o => o.group), true).find(h => { let n = h.object; while (n) { if (n.parent === scene) return [...stations.values()].some(o => o.group === n); n = n.parent; } return false; });
    if (hit) { let n = hit.object; while (n.parent !== scene) n = n.parent; const id = [...stations.entries()].find(([k, o]) => o.group === n)[0]; focus(id); } else if (selected) overview();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && A.route === 'floor3d') overview(); });

  function size() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(size).observe(host); size(); build(); applyStates(); alertBar();

  // data polling: states change the lights; a new failure sends the camera there
  const poll = async () => {
    if (A.route !== 'floor3d') return;
    try {
      const n = await api('/ws/twin'); tw = n; const s2 = n.stations.map(s => s.id + s.x.toFixed(2) + s.y.toFixed(2) + s.name).join('|') + n.flows.map(f => f.id + f.status).join('|');
      if (s2 !== sig) { build(); }
      applyStates(); alertBar();
      n.stations.forEach(s => { if (s.state === 'failed' && prev[s.id] && prev[s.id] !== 'failed' && performance.now() - userT > 2500) { toast(`${s.name} failed. Flying to it.`); focus(s.id); } prev[s.id] = s.state; });
      if (selected && stations.get(selected)) card(stations.get(selected).s);
    } catch (e) { }
  };
  tw.stations.forEach(s => prev[s.id] = s.state); const iv = setInterval(poll, 3000);

  // loop
  const clock = new THREE.Clock(), v3 = new THREE.Vector3();
  function frame() {
    if (A.route !== 'floor3d' || !host.isConnected) { clearInterval(iv); renderer.dispose(); composer.dispose(); return; }
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    if (flyT) { const k = Math.min(1, (performance.now() - flyT.t0) / flyT.ms), e = easeIO(k); camera.position.lerpVectors(flyT.p0, flyT.p1, e); controls.target.lerpVectors(flyT.t0v, flyT.t1, e); if (k >= 1) flyT = null; }
    controls.update();
    if (dof) { const d = camera.position.distanceTo(controls.target); dof.cocMaterial.worldFocusDistance = d; dof.cocMaterial.worldFocusRange = Math.max(6, d * .9); }
    stations.forEach(o => { const busy = o.s.state === 'busy', failed = o.s.state === 'failed'; o.m.tick(t, busy, dt);
      const pulse = failed ? .6 + .4 * Math.sin(t * 5) : busy ? .85 + .15 * Math.sin(t * 2) : .7; o.beacon.scale.setScalar(failed ? 1 + .25 * Math.sin(t * 5) : 1); o.light.intensity = failed ? 14 * (.5 + .5 * Math.sin(t * 5)) : 0; o.beaconMat.color.setScalar(1); o.beaconMat.color.copy(new THREE.Color(stateCol(o.s.state))).multiplyScalar(failed ? 1.9 * pulse + .5 : busy ? 1.3 : .8);
      if (o.mark) o.mark.rotation.z = t * 1.4;
      v3.copy(o.pos).add(new THREE.Vector3(0, 3.7, 0)).project(camera); const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1; o.label.style.display = vis ? 'flex' : 'none'; o.label.style.transform = `translate(-50%,-100%) translate(${(v3.x * .5 + .5) * host.clientWidth}px,${(-v3.y * .5 + .5) * host.clientHeight}px)`; });
    carriers.forEach(c => { const src = stations.get(c.from); const run = src && src.s.state === 'busy'; c.u = ((c.u ?? c.off) + (run ? dt * .09 : 0)) % 1; c.part.position.copy(c.curve.getPointAt(c.u)); c.part.position.y = .38; c.part.visible = true; });
    composer.render(dt);
  }
  frame();
};
