// «Ты всё ещё полон решимости» — переносимая 3D-сцена (Three.js, ~8 с, прозрачный фон).
// Не создаёт WebGLRenderer, requestAnimationFrame, кнопок и не загружает Three.js.
export const durationMs = 8000;
export const captionAtMs = 6000;
export const captionText = 'Ты всё ещё полон решимости';

export function createAnimation({ THREE, reducedMotion }) {
  const D = durationMs / 1000, PI = Math.PI, K = 2 * Math.tan(35 * PI / 360);
  const cl = x => Math.min(1, Math.max(0, x)), mix = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x); };
  const ease = x => 1 - Math.pow(1 - x, 3);
  let sd = 7; const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  let asp = 9 / 16, px = 0, py = 0, tpx = 0, tpy = 0;

  const scene = new THREE.Scene(); scene.background = null;       // прозрачный фон: интерфейс игры виден
  const camera = new THREE.PerspectiveCamera(35, asp, 0.1, 80);
  const rig = new THREE.Group(), cry = new THREE.Group(); scene.add(rig); rig.add(cry);
  const key = new THREE.DirectionalLight(0xffffff, 0.9), rim = new THREE.DirectionalLight(0xffb870, 0.55);
  key.position.set(2, 3, 4); rim.position.set(-3, 1, -2);
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x2a1418, 0.75), key, rim);

  // мягкое свечение без DOM: текстура из данных
  const gd = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = Math.max(0, 1 - Math.hypot(x - 31.5, y - 31.5) / 32), i = (y * 64 + x) * 4;
    gd[i] = gd[i + 1] = gd[i + 2] = 255; gd[i + 3] = Math.round(255 * a * a);
  }
  const glowTex = new THREE.DataTexture(gd, 64, 64, THREE.RGBAFormat);
  glowTex.magFilter = glowTex.minFilter = THREE.LinearFilter; glowTex.needsUpdate = true;

  // кристалл-сердце: гранёное, две формы (до и после)
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.05);
  shape.bezierCurveTo(-0.25, -0.75, -1.15, -0.25, -1.15, 0.42);
  shape.bezierCurveTo(-1.15, 0.95, -0.55, 1.15, 0, 0.62);
  shape.bezierCurveTo(0.55, 1.15, 1.15, 0.95, 1.15, 0.42);
  shape.bezierCurveTo(1.15, -0.25, 0.25, -0.75, 0, -1.05);
  const off = new THREE.Vector3(); let FZ = 0;
  const mkGeo = (cs, bs, bsz) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.18, bevelSize: bsz, bevelSegments: bs, curveSegments: cs });
    g.computeBoundingBox(); g.boundingBox.getCenter(off); FZ = g.boundingBox.max.z - off.z; g.translate(-off.x, -off.y, -off.z); return g;
  };
  const mOld = new THREE.MeshStandardMaterial({ color: 0x4a5075, emissive: 0x151833, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.15, flatShading: true, transparent: true, opacity: 0, depthWrite: false });
  const mNew = new THREE.MeshStandardMaterial({ color: 0x8a3347, emissive: 0xff9a3c, emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.2, flatShading: true, transparent: true, opacity: 0, depthWrite: false });
  const oldM = new THREE.Mesh(mkGeo(4, 2, 0.12), mOld), newM = new THREE.Mesh(mkGeo(10, 3, 0.15), mNew);
  oldM.renderOrder = newM.renderOrder = 1; cry.add(oldM, newM);

  // трещины: тонкая светящаяся жила + мягкое гало
  const V = (x, y, z) => new THREE.Vector3(x - off.x, y - off.y, z);
  const jag = (x, y, a, len, n) => { const p = [[x, y]]; for (let i = 0; i < n; i++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; p.push([x, y]); } return p; };
  const mkTube = (pts, r, mat, closed) => {
    const c = new THREE.CatmullRomCurve3(pts, closed), ts = pts.length * 5, g = new THREE.TubeGeometry(c, ts, r, 5, closed), m = new THREE.Mesh(g, mat);
    m.userData = { ts, st: 30 }; return m;
  };
  const grow = (m, u) => { m.geometry.setDrawRange(0, Math.floor(m.userData.ts * cl(u)) * m.userData.st); m.visible = u > 0.001; };
  const cRed = new THREE.Color(0xff5a3c), cGold = new THREE.Color(0xffd25a), tmp = new THREE.Color();
  const strikes = [[-0.85, 0.72, -0.75, 0.9], [1.0, 0.15, 3.5, 1.7], [0.12, -0.62, 1.75, 2.5]].map(([x, y, a, ts]) => {
    const main = jag(x, y, a, 1.15, 6), paths = [main, jag(main[2][0], main[2][1], a + 0.8, 0.5, 3), jag(main[4][0], main[4][1], a - 0.9, 0.45, 3)];
    const mc = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0, depthWrite: false }), mh = mc.clone();
    const parts = paths.map((p, i) => {
      const pts = p.map(q => V(q[0], q[1], FZ + 0.012)), core = mkTube(pts, 0.016, mc), halo = mkTube(pts, 0.05, mh);
      core.renderOrder = 3; halo.renderOrder = 2; cry.add(halo, core); return { core, halo, d: i ? 0.1 : 0 };
    });
    const at = V(x, y, FZ + 0.03), dir = new THREE.Vector2(-at.x, -at.y).normalize();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.15, 40), new THREE.MeshBasicMaterial({ color: 0xffe8cf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(at); ring.renderOrder = 4;
    const sp = new Float32Array(14 * 3), sv = []; for (let i = 0; i < 14; i++) { const q = rnd() * 6.28, v = 0.6 + rnd() * 0.8; sv.push([Math.cos(q) * v, Math.sin(q) * v, 0.3 + rnd() * 0.4]); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const shards = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffe3b0, size: 0.06, transparent: true, opacity: 0, depthWrite: false })); shards.renderOrder = 4; shards.frustumCulled = false;
    cry.add(ring, shards);
    return { ts, mc, mh, parts, at, dir, ring, shards, sp, sv };
  });

  // золотой контур новой формы
  const rp = []; shape.getPoints(36).forEach(p => { const l = rp[rp.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 1e-3) rp.push(p); });
  if (Math.hypot(rp[0].x - rp[rp.length - 1].x, rp[0].y - rp[rp.length - 1].y) < 1e-3) rp.pop();
  const mRim = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0, depthWrite: false });
  const rimM = mkTube(rp.map(p => V(p.x, p.y, FZ + 0.012)), 0.022, mRim, true); rimM.renderOrder = 3; rimM.userData.st = 30; cry.add(rimM);

  // красная точка внутри, свечение за ней
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
  core.position.set(0, 0.05, 0); cry.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3030, transparent: true, opacity: 0, depthWrite: false }));
  glow.position.copy(core.position); glow.renderOrder = -1; cry.add(glow);

  // десять тонких золотых шагов в глубину
  const steps = []; for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.012, 6, 72), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0, depthWrite: false }));
    m.position.z = -(1.2 + i * 0.8); m.renderOrder = -2; rig.add(m); steps.push(m);
  }
  // тихие золотые искры в финале
  const mp = new Float32Array(36 * 3); for (let i = 0; i < 36; i++) { const q = rnd() * 6.28, r = 1.4 + rnd() * 0.6; mp[i * 3] = Math.cos(q) * r; mp[i * 3 + 1] = -1 + rnd() * 2.4; mp[i * 3 + 2] = Math.sin(q) * r * 0.6; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffd25a, size: 0.045, transparent: true, opacity: 0, depthWrite: false })); rig.add(motes);

  const T0 = 3.3, GAP = 0.24;
  function apply(t, dt) {
    const ms = reducedMotion ? 0 : 1, kz = sm(0, D, t), hF = mix(4.0, 3.3, kz), w = mix(3.9, 3.1, kz);
    const dist = Math.max(w / (asp * K), hF / K);
    camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    rig.position.y = 0.15 * K * dist;                              // объект выше центра, подпись снизу свободна
    px += (tpx - px) * Math.min(1, dt * 4); py += (tpy - py) * Math.min(1, dt * 4);

    let f = 0, pulse = 0;
    for (let i = 0; i < 10; i++) { const Ti = T0 + GAP * i; f += sm(Ti, Ti + 0.22, t) / 10; if (t > Ti) pulse += Math.exp(-(t - Ti) * 8); }
    const fi = sm(0, 0.9, t), p = sm(5.55, 6.3, t), dim = mix(0.6, 0.12, sm(2.5, 3.1, t)) + 0.88 * f;

    let kx = 0, ky = 0, kr = 0;
    strikes.forEach(s => {
      const tau = t - s.ts;
      if (tau >= 0 && tau < 1) { const e = Math.exp(-tau * 6) * Math.cos(tau * 26) * 0.2; kx += s.dir.x * e; ky += s.dir.y * e; kr -= s.dir.x * e * 0.5; }
      const fl = tau >= 0 ? Math.exp(-tau * 6) : 0, b = cl(dim + 0.9 * fl);
      s.parts.forEach(q => { const u = ease(cl((tau - q.d) / 0.25)); grow(q.core, u); grow(q.halo, u); });
      tmp.copy(cRed).lerp(cGold, f); s.mc.color.copy(tmp); s.mh.color.copy(tmp); s.mc.opacity = b; s.mh.opacity = cl(b * 0.35 * (1 + f));
      const rt = cl(tau / 0.5); s.ring.visible = tau >= 0 && rt < 1; s.ring.scale.setScalar(1 + 8 * ease(rt)); s.ring.material.opacity = 0.8 * (1 - rt);
      const st = cl(tau / 0.8); s.shards.visible = tau >= 0 && st < 1; s.shards.material.opacity = 1 - st;
      for (let i = 0; i < 14; i++) for (let k = 0; k < 3; k++) s.sp[i * 3 + k] = s.at.getComponent(k) + s.sv[i][k] * Math.max(0, tau) * 0.8;
      s.shards.geometry.attributes.position.needsUpdate = true;
      s.flash = fl;
    });
    cry.position.set(kx * ms, (ky + 0.03 * Math.sin(t * 1.3)) * ms, 0);
    cry.rotation.set((py * 0.15 + 0.05 * Math.sin(t * 0.8)) * ms, (px * 0.3 + 0.18 * Math.sin(t * 0.6)) * ms, kr * ms);
    cry.scale.setScalar(1 + 0.015 * pulse * ms);

    const fl = strikes.reduce((a, s) => a + s.flash, 0);
    mOld.opacity = 0.72 * fi * (1 - p); mOld.emissive.setHex(0x151833).lerp(tmp.setHex(0x7a4a14), f); mOld.emissiveIntensity = 0.6 + 0.6 * f + 0.8 * fl;
    oldM.scale.setScalar(mix(1, 0.9, p));
    mNew.opacity = 0.78 * p; newM.scale.setScalar(mix(0.93, 1.02, ease(p))); mNew.emissiveIntensity = 0.25 + 0.2 * (1 - p) * f;
    grow(rimM, ease(sm(5.5, 6.5, t))); mRim.opacity = sm(5.5, 6.0, t);

    const beat = Math.pow(Math.max(0, Math.sin(t * 5)), 6) * (1 - sm(5.6, 6.2, t)) * sm(2.9, 3.3, t);
    tmp.setHex(0xff2a2a).lerp(new THREE.Color(0xffc15a), f);
    core.material.color.copy(tmp); core.material.opacity = sm(2.6, 3.2, t); core.scale.setScalar((0.07 + 0.12 * f) * (1 + 0.25 * beat));
    glow.material.color.copy(tmp); glow.material.opacity = 0.5 * sm(2.6, 3.2, t) + 0.2 * f; glow.scale.setScalar(mix(0.9, 3.2, f) * (1 + 0.1 * beat));

    steps.forEach((m, i) => {
      const tau = t - (T0 + GAP * i);
      m.material.opacity = tau < 0 ? 0 : (0.25 + 0.75 * Math.exp(-tau * 5)) * mix(1, 0.35, sm(6.2, 7.2, t));
      m.scale.setScalar(1 + (tau < 0 ? 0 : 0.2 * Math.exp(-tau * 6)));
    });
    motes.material.opacity = 0.8 * sm(6, 7, t); motes.rotation.y = t * 0.15 * ms;
  }
  apply(reducedMotion ? D : 0, 0);
  return {
    scene, camera,
    update(timeSeconds, deltaSeconds) { apply(reducedMotion ? D : Math.min(timeSeconds, D), deltaSeconds || 0); },
    resize(width, height) { asp = width / height; camera.aspect = asp; camera.updateProjectionMatrix(); },
    setPointer(x, y) { tpx = x; tpy = -y; }
  };
}
