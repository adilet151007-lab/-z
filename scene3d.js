// scene3d.js
// Полноценная 3D-сцена на Three.js с OrbitControls.
// Четыре острова-региона, реагирующие на культурный ресурс и экономику.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { REGIONS, CRISIS_THRESHOLD } from "./shared-engine.js";

function rng(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createScene(canvas, opts = {}) {
  const interactive = opts.interactive !== false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x061018, 0.012);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 16, 24);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.enabled = interactive;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0x2b4a66, 0x1a1020, 0.65));
  const sun = new THREE.DirectionalLight(0xbfe0ff, 1.1);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const bay = new THREE.Mesh(
    new THREE.CircleGeometry(22, 64),
    new THREE.MeshStandardMaterial({ color: 0x0c2a3a, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.85 })
  );
  bay.rotation.x = -Math.PI / 2;
  bay.position.y = -0.6;
  bay.receiveShadow = true;
  scene.add(bay);

  const gridHelper = new THREE.PolarGridHelper(22, 4, 1, 64, 0x15485c, 0x0c2733);
  gridHelper.position.y = -0.58;
  scene.add(gridHelper);

  function stdMat(color, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9, metalness: 0.05 }, extra || {}));
  }
  function castRecv(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

  const GREY = new THREE.Color(0x5d6670);
  const islands = REGIONS.map((meta, i) => buildIsland(meta, i));

  function buildIsland(meta, i) {
    const group = new THREE.Group();
    const angle = (i / REGIONS.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 9.5;
    group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    scene.add(group);

    const r = rng(i * 17 + 5);
    const baseGeo = new THREE.CylinderGeometry(3.4, 3.9, 1.3, 14, 1);
    const pos = baseGeo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const an = Math.atan2(z, x);
      const f = 1 + 0.1 * Math.sin(an * 3 + i) + 0.06 * Math.sin(an * 5 + i * 2);
      pos.setX(k, x * f); pos.setZ(k, z * f);
    }
    baseGeo.computeVertexNormals();
    const regionColor = new THREE.Color(meta.color);
    const topMat = stdMat(regionColor.clone());
    const sideMat = stdMat(0x5a4530);
    const body = castRecv(new THREE.Mesh(baseGeo, [sideMat, topMat, sideMat]));
    group.add(body);

    const treeMat = stdMat(regionColor.clone().lerp(new THREE.Color(0x163a1f), 0.55));
    const trunkMat = stdMat(0x4a3420);
    for (let k = 0; k < 9; k++) {
      const an = r() * Math.PI * 2, d = 1.6 + r() * 1.5;
      const t = new THREE.Group();
      const trunk = castRecv(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5), trunkMat));
      trunk.position.y = 0.15;
      const leaf = castRecv(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), treeMat));
      leaf.position.y = 0.6;
      t.add(trunk, leaf);
      t.position.set(Math.cos(an) * d, 0.65, Math.sin(an) * d);
      t.scale.setScalar(0.7 + r() * 0.5);
      group.add(t);
    }

    const monuments = new THREE.Group();
    const monGeo = new THREE.Group();
    const bannerColor = new THREE.Color(meta.glow);
    const banner = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: bannerColor, emissive: bannerColor, emissiveIntensity: 0.9, roughness: 0.3 })
    );
    banner.position.set(0, 3.0, 0);
    banner.visible = false;
    group.add(banner);

    const fogMat = stdMat(0x3a3f45, { transparent: true, opacity: 0 });
    const fogGroup = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + (k % 2) * 0.3, 0), fogMat);
      puff.position.set(Math.cos(k * 1.1) * 1.6, 2.6, Math.sin(k * 1.1) * 1.6);
      fogGroup.add(puff);
    }
    group.add(fogGroup);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.0, 4.25, 48),
      new THREE.MeshBasicMaterial({ color: bannerColor, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    const sprite = makeLabelSprite(meta.name, meta.color);
    sprite.position.set(0, 4.2, 0);
    group.add(sprite);

    return { meta, group, topMat, treeMat, fogGroup, fogMat, banner, ring, monuments, sprite, shownEco: 100, shownY: 0, nMon: -1 };
  }

  function makeLabelSprite(text, color) {
    const cvs = document.createElement("canvas");
    cvs.width = 512; cvs.height = 128;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "rgba(8,16,22,0.78)";
    roundRect(ctx, 4, 24, 504, 80, 18); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    roundRect(ctx, 4, 24, 504, 80, 18); ctx.stroke();
    ctx.fillStyle = "#EAF6FA";
    ctx.font = "700 46px Rajdhani, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(5, 1.25, 1);
    return sp;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function monumentMesh(regionColor) {
    const g = new THREE.Group();
    const base = castRecv(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.25, 10), stdMat(0xd8cdb0)));
    const dome = castRecv(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(regionColor)));
    dome.position.y = 0.37;
    g.add(base, dome);
    return g;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let focusTarget = null;
  function focusRegion(regionId) {
    const isl = islands.find(x => x.meta.id === regionId);
    if (!isl) return;
    focusTarget = isl.group.position.clone();
  }

  let latestState = null, selectedRegion = null;
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (latestState) applyState(latestState, selectedRegion);
    if (focusTarget) {
      controls.target.lerp(focusTarget, 0.06);
      if (controls.target.distanceTo(focusTarget) < 0.05) focusTarget = null;
    }
    islands.forEach(isl => {
      isl.fogGroup.children.forEach((p, k) => {
        p.position.y = 2.6 + Math.sin(performance.now() / 900 + k) * 0.12;
        p.rotation.y += dt * 0.15;
      });
      isl.ring.material.opacity += ((isl.ringTargetOpacity || 0) - isl.ring.material.opacity) * 0.08;
    });
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function update(state, selectedRegionId) {
    latestState = state;
    selectedRegion = selectedRegionId;
  }
  function applyState(state, selectedRegionId) {
    sun.color.setHex(state.regions.some(r => r.economy < CRISIS_THRESHOLD) ? 0xffb199 : 0xbfe0ff);
    state.regions.forEach(r => {
      const isl = islands.find(x => x.meta.id === r.id);
      if (!isl) return;
      isl.shownEco += (r.economy - isl.shownEco) * 0.05;
      const k = isl.shownEco / 100;
      isl.topMat.color.copy(GREY).lerp(new THREE.Color(isl.meta.color), k);
      isl.treeMat.color.copy(new THREE.Color(0x3a3f33)).lerp(new THREE.Color(isl.meta.color).lerp(new THREE.Color(0x163a1f), 0.55), k);
      isl.fogMat.opacity = Math.max(0, (1 - k) * 1.0 - 0.05);
      isl.fogGroup.visible = isl.fogMat.opacity > 0.02;
      isl.banner.visible = r.points >= 100;
      const targetY = Math.max(-0.6, Math.min(0.9, (k - 0.5) * 1.6 + (r.points / 400)));
      isl.shownY += (targetY - isl.shownY) * 0.06;
      isl.group.position.y = isl.shownY;
      const monCount = Math.min(4, Math.floor(r.points / 100));
      if (monCount !== isl.nMon) {
        isl.nMon = monCount;
        while (isl.monuments.children.length) isl.monuments.remove(isl.monuments.children[0]);
        for (let k2 = 0; k2 < monCount; k2++) {
          const ang = k2 * 1.6;
          const m = monumentMesh(new THREE.Color(isl.meta.color));
          m.position.set(Math.cos(ang) * 1.7, 0.78, Math.sin(ang) * 1.7);
          isl.monuments.add(m);
        }
        isl.group.add(isl.monuments);
      }
      isl.ringTargetOpacity = r.economy < CRISIS_THRESHOLD ? 0.9 : (r.id === selectedRegionId) ? 0.85 : 0;
      isl.ring.material.color.set(r.economy < CRISIS_THRESHOLD ? "#ff4b45" : isl.meta.glow);
    });
  }

  return { scene, camera, controls, renderer, update, focusRegion, resize };
}
