import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { REGIONS, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor } from "./game-config.js";
import { GEOGRAPHY } from "./region-geography.js";

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const pointOnMap = (lon, lat) => [(lon - 67) * 1.91, -(lat - 47.6) * 2.8];
const palettes = {
  saryarka: { low: 0x727d47, high: 0xc1b581, wall: 0x5b4935, roof: 0x527b75, stone: 0xe1cba2 },
  jetisu: { low: 0x427e62, high: 0x99ad93, wall: 0x425b55, roof: 0x337d8a, stone: 0xe3e0c6 },
  mangystau: { low: 0xb99b6c, high: 0xf2dbb3, wall: 0x82614c, roof: 0xa26548, stone: 0xebd8ba },
  turkistan: { low: 0x939257, high: 0xc1b47d, wall: 0x755e45, roof: 0x268c9a, stone: 0xd2ae7c }
};
function polygonContains(polygon, x, z) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function heightAt(id, x, z, data) {
  const bump = (a, b, radius, h) => h * Math.exp(-((x - a) ** 2 + (z - b) ** 2) / radius ** 2);
  let h = .62 + .07 * Math.sin(x * 2.9) * Math.cos(z * 2.4) + .04 * Math.sin(x * 6 + z * 3);
  if (id === "saryarka") h += bump(-.2, -2.9, 2.9, 1.1) + bump(16.2, -4.8, 3.1, 1.4) + bump(6, -6, 3.8, .6);
  if (id === "jetisu") h += bump(27.2, 7.8, 2.2, 3.4) + bump(25.7, 5.8, 1.8, 2.2) + bump(28.7, 4.7, 1.8, 2.7);
  if (id === "mangystau") h += Math.floor((bump(-24.5, 14.8, 3, 2.2) + bump(-22.4, 7.5, 2.3, 1.2)) * 5) / 5;
  if (id === "turkistan") h += bump(5.7, 8.9, 2.2, 2.1) + bump(6.1, 12.3, 1.7, 1.3);
  const d = Math.hypot(x - data.city[0], z - data.city[1]);
  return THREE.MathUtils.lerp(.71, h, smooth(data.cityRadius * .94, data.cityRadius * 1.38, d));
}
function reliefGeometry(polygon, id, data) {
  const contour = polygon.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []), vertices = [], colors = [];
  const low = new THREE.Color(palettes[id].low), high = new THREE.Color(palettes[id].high), snow = new THREE.Color(0xe7f0ed);
  function vertex(v) {
    const h = heightAt(id, v.x, v.y, data), color = low.clone().lerp(high, clamp((h - .55) / 2.3, 0, 1));
    if (id === "jetisu" && h > 2.5) color.lerp(snow, smooth(2.5, 3.4, h));
    vertices.push(v.x - data.city[0], h, v.y - data.city[1]);
    color.multiplyScalar(.96 + .07 * Math.sin(v.x * 5 + v.y * 3));
    colors.push(color.r, color.g, color.b);
  }
  function subdivide(a, b, c, depth) {
    const longest = Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a));
    if (longest > .65 && depth < 7) {
      const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
      subdivide(a, ab, ca, depth + 1); subdivide(ab, b, bc, depth + 1);
      subdivide(ca, bc, c, depth + 1); subdivide(ab, bc, ca, depth + 1);
    } else {
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) { vertex(a); vertex(c); vertex(b); }
      else { vertex(a); vertex(b); vertex(c); }
    }
  }
  for (const face of faces) subdivide(...face.map(i => contour[i]), 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
function wallGeometry(polygon, id, data) {
  const vertices = [];
  for (let i = 1; i < polygon.length; i++) {
    const a = polygon[i - 1], b = polygon[i], ah = heightAt(id, ...a, data), bh = heightAt(id, ...b, data);
    const ax = a[0] - data.city[0], az = a[1] - data.city[1], bx = b[0] - data.city[0], bz = b[1] - data.city[1];
    vertices.push(ax, ah, az, bx, bh, bz, ax, -1.0, az, bx, bh, bz, bx, -1.0, bz, ax, -1.0, az);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
  return geo;
}
function lineFor(points, color, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
function labelSprite() {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(7.3, 1.825, 1); sprite.renderOrder = 20;
  return { sprite, canvas, texture, key: "" };
}
function paintLabel(label, meta, points, economy) {
  const key = `${points}:${economy}`; if (label.key === key) return; label.key = key;
  const ctx = label.canvas.getContext("2d"), done = points >= RESOURCE_CAP, crisis = economy < CRISIS_THRESHOLD;
  const color = crisis ? "#ff7468" : done ? "#ffe2a1" : meta.glow;
  ctx.clearRect(0, 0, 768, 192); ctx.fillStyle = "rgba(5,18,25,.93)"; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(4, 4, 760, 180, 24); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "700 42px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(meta.name + (done ? "  ✦" : ""), 384, 65);
  ctx.fillStyle = "#d8e8e7"; ctx.font = "25px sans-serif";
  ctx.fillText(`${points} / 1000   ·   ${economy}%   ·   ${developmentFor(points).name}`, 384, 113);
  ctx.fillStyle = "#203c43"; ctx.fillRect(40, 143, 688, 7); ctx.fillStyle = color; ctx.fillRect(40, 143, 688 * points / RESOURCE_CAP, 7);
  label.texture.needsUpdate = true;
}

export function createScene(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07151e); scene.fog = new THREE.FogExp2(0x07151e, .004);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 320);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .075; controls.minDistance = 8; controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * .455; controls.minPolarAngle = .15; controls.enabled = opts.interactive !== false;
  controls.target.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xc7eaff, 0x3e3825, 2.1));
  const sun = new THREE.DirectionalLight(0xffedce, 3.2); sun.position.set(-24, 45, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 30, bottom: -30, near: 1, far: 110 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .035; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x79baff, 1.2); rim.position.set(25, 12, 28); scene.add(rim);
  const grid = new THREE.GridHelper(130, 65, 0x285765, 0x15333f); grid.position.y = -2.05;
  grid.material.transparent = true; grid.material.opacity = .26; scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), new THREE.MeshStandardMaterial({ color: 0x081b25, roughness: .8, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.1; floor.receiveShadow = true; scene.add(floor);

  // The dark provinces give the four playable regions their real location within Kazakhstan.
  const contextMat = new THREE.MeshStandardMaterial({ color: 0x183842, roughness: .94, metalness: .08 });
  for (const province of GEOGRAPHY.context) for (const polygon of province.polygons) {
    const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .65, bevelEnabled: false, curveSegments: 1 }); geo.rotateX(-Math.PI / 2); geo.translate(0, -.85, 0);
    const mesh = new THREE.Mesh(geo, contextMat); mesh.receiveShadow = true; scene.add(mesh);
    scene.add(lineFor(polygon.map(([x, z]) => new THREE.Vector3(x, -.17, z)), 0x547584, .35));
  }
  for (const polygon of GEOGRAPHY.country) scene.add(lineFor(polygon.map(([x, z]) => new THREE.Vector3(x, -.12, z)), 0x8dbbc1, .65));
  function water(lon, lat, rx, rz, rotation = 0) {
    const [x, z] = pointOnMap(lon, lat), mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x186c83, emissive: 0x08394d, emissiveIntensity: .4, metalness: .5, roughness: .25, transparent: true, opacity: .84 }));
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rotation; mesh.scale.set(rx, rz, 1); mesh.position.set(x, -.06, z); scene.add(mesh);
  }
  water(50.5, 44, 3.1, 10, .13); water(74.8, 46.2, 5.1, .5, -.12);

  const materials = {};
  const material = (key, color, extra = {}) => materials[key] ||= new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .05, ...extra });
  const box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 4), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12), dome = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  // Each construction stage is merged by material: hundreds of houses use few draw calls.
  function batch() {
    const entries = new Map();
    return {
      add(geometry, mat, x, y, z, sx, sy, sz, rotation = 0) {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(sx, sy, sz));
        const geo = geometry.clone().applyMatrix4(matrix);
        if (!entries.has(mat)) entries.set(mat, []); entries.get(mat).push(geo);
      },
      finish() {
        const group = new THREE.Group();
        for (const [mat, geos] of entries) {
          const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
          const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
        }
        return group;
      }
    };
  }
  const surfaces = [], regions = [];
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const meta = REGIONS[ri], data = GEOGRAPHY.regions.find(r => r.id === meta.id), palette = palettes[meta.id];
    const group = new THREE.Group(); group.position.set(data.city[0], 0, data.city[1]); scene.add(group);
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, metalness: .03, emissive: meta.color, emissiveIntensity: .025 });
    const sideMat = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1, side: THREE.DoubleSide });
    const borders = [];
    for (const polygon of data.polygons) {
      const terrain = new THREE.Mesh(reliefGeometry(polygon, meta.id, data), topMat); terrain.castShadow = true; terrain.receiveShadow = true;
      terrain.userData.regionId = meta.id; surfaces.push(terrain); group.add(terrain);
      group.add(new THREE.Mesh(wallGeometry(polygon, meta.id, data), sideMat));
      const border = lineFor(polygon.map(([x, z]) => new THREE.Vector3(x - data.city[0], heightAt(meta.id, x, z, data) + .045, z - data.city[1])), meta.glow, .65);
      group.add(border); borders.push(border);
    }
    const random = rng(ri * 203 + 19), townRadius = data.cityRadius * .86, unit = townRadius / 3.8;
    const stone = material(`stone${ri}`, palette.stone), roof = material(`roof${ri}`, palette.roof, { roughness: .4, metalness: .25 });
    const white = material("white", 0xe5e2cf), dark = material("dark", 0x263d47), gold = material("gold", 0xe6bc5b, { metalness: .65, roughness: .3 });
    const glass = material("glass", 0x417e93, { metalness: .5, roughness: .24 });
    const windowMat = material("window", 0xffe5a2, { emissive: 0xffce76, emissiveIntensity: .6 });
    const road = material("road", 0x566064), pavement = material("pavement", 0xada48c), green = material("green", 0x446e4d);
    const stages = [], lots = [];
    for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
      if (!gx || !gz) continue;
      lots.push({ x: gx * unit * .78, z: gz * unit * .78, order: Math.hypot(gx, gz) + random() * .28 });
    }
    lots.sort((a, b) => a.order - b.order);
    const footY = .74;
    for (let si = 1; si <= 5; si++) {
      const b = batch(), from = developmentFor([0, 0, 100, 250, 500, 750][si]).buildings, to = [0, 4, 12, 24, 42, 64][si];
      for (let k = from; k < to; k++) {
        const lot = lots[k], x = lot.x, z = lot.z, size = unit * .48;
        const floors = si <= 2 ? 1 : si === 3 ? 2 : si === 4 ? 3 + (k % 2) : 4 + (k % 4);
        const h = unit * (.28 * floors + .12), w = size * (.85 + random() * .2), depth = size * (.9 + random() * .15);
        b.add(box, pavement, x, footY + .025, z, unit * .65, .05, unit * .65);
        b.add(box, k % 3 ? stone : white, x, footY + h / 2, z, w, h, depth);
        if (floors <= 2) b.add(cone, roof, x, footY + h + unit * .13, z, w * .77, unit * .26, depth * .77, Math.PI / 4);
        else {
          b.add(box, roof, x, footY + h + unit * .035, z, w * 1.08, unit * .07, depth * 1.08);
          b.add(box, glass, x + w * .505, footY + h * .55, z, unit * .015, h * .78, depth * .68);
        }
        for (let f = 0; f < floors; f++) for (const side of [-1, 1]) {
          b.add(box, windowMat, x + side * w * .23, footY + unit * .15 + f * unit * .28, z + depth * .505, unit * .075, unit * .095, unit * .018);
          b.add(box, windowMat, x + side * w * .23, footY + unit * .15 + f * unit * .28, z - depth * .505, unit * .075, unit * .095, unit * .018);
        }
      }
      const extent = townRadius * [.0, .45, .58, .72, .9, 1.04][si];
      if (si === 1 || si === 3 || si === 5) {
        b.add(box, road, 0, footY + .015, 0, extent * 2, .022, unit * .22);
        b.add(box, road, 0, footY + .018, 0, unit * .22, .022, extent * 2);
        for (let k = -4; k <= 4; k++) if (Math.abs(k * unit * .4) < extent) b.add(box, gold, k * unit * .4, footY + .032, 0, unit * .12, .012, unit * .025);
      }
      if (si === 2) {
        const x = -unit * .95, z = -unit * .05;
        b.add(cylinder, pavement, x, footY + unit * .07, z, unit * .53, unit * .14, unit * .53);
        b.add(box, stone, x, footY + unit * .3, z, unit * .55, unit * .5, unit * .5);
        b.add(dome, roof, x, footY + unit * .55, z, unit * .38, unit * .44, unit * .38);
        b.add(cylinder, gold, x, footY + unit * 1.03, z, unit * .025, unit * .13, unit * .025);
      }
      if (si === 3) {
        b.add(box, pavement, 0, footY + .04, 0, unit * 1.1, .06, unit * 1.1);
        b.add(cylinder, stone, 0, footY + unit * .17, 0, unit * .23, unit * .25, unit * .23);
        b.add(cylinder, glass, 0, footY + unit * .4, 0, unit * .16, unit * .2, unit * .16);
        b.add(box, green, unit * .88, footY + .03, 0, unit * .62, .04, unit * .5);
      }
      if (si === 4) {
        for (const x of [-unit * .95, unit * .95]) {
          b.add(box, stone, x, footY + unit * .22, unit * 3.1, unit * .7, unit * .44, unit * .5);
          b.add(cone, roof, x, footY + unit * .55, unit * 3.1, unit * .52, unit * .25, unit * .4, Math.PI / 4);
        }
        for (const side of [-1, 1]) b.add(box, road, side * unit * 2.72, footY + .01, 0, unit * .15, .025, townRadius * 1.6);
      }
      if (si === 5) {
        // A region-specific skyline completes the city at exactly 1000 resources.
        const x = unit * .48, z = -unit * .18;
        if (meta.id === "turkistan") {
          b.add(box, stone, x, footY + unit * .45, z, unit * .92, unit * .9, unit * .7);
          b.add(dome, roof, x, footY + unit * .9, z, unit * .45, unit * .57, unit * .45);
          for (const side of [-1, 1]) {
            b.add(cylinder, stone, x + side * unit * .6, footY + unit * .65, z, unit * .09, unit * 1.3, unit * .09);
            b.add(cone, roof, x + side * unit * .6, footY + unit * 1.4, z, unit * .13, unit * .22, unit * .13);
          }
        } else if (meta.id === "saryarka") {
          b.add(cylinder, white, x, footY + unit * .85, z, unit * .13, unit * 1.7, unit * .13);
          b.add(dome, gold, x, footY + unit * 1.65, z, unit * .34, unit * .48, unit * .34);
        } else {
          for (let k = 0; k < 3; k++) {
            const height = unit * (1.2 + k * .45);
            b.add(box, k === 1 ? glass : white, x + (k - 1) * unit * .32, footY + height / 2, z, unit * .27, height, unit * .35);
            b.add(box, gold, x + (k - 1) * unit * .32, footY + height, z, unit * .29, unit * .06, unit * .37);
          }
        }
      }
      const stage = b.finish(); stage.visible = false; stage.scale.y = .001;
      group.add(stage); stages.push(stage);
    }
    // Vegetation and pale rock formations are permanent parts of the landscape.
    const nature = batch();
    for (let k = 0; k < 140; k++) {
      const x = THREE.MathUtils.lerp(data.bounds[0], data.bounds[2], random()), z = THREE.MathUtils.lerp(data.bounds[1], data.bounds[3], random());
      if (!data.polygons.some(p => polygonContains(p, x, z)) || Math.hypot(x - data.city[0], z - data.city[1]) < data.cityRadius * 1.3) continue;
      const h = heightAt(meta.id, x, z, data), scale = .1 + random() * .13;
      if (meta.id === "mangystau") {
        nature.add(cylinder, stone, x - data.city[0], h + scale, z - data.city[1], scale * .7, scale * 2.8, scale * .65);
      } else if (h < 2.3) {
        nature.add(cone, green, x - data.city[0], h + scale * 1.5, z - data.city[1], scale, scale * 3, scale);
      }
    }
    group.add(nature.finish());
    const label = labelSprite(); label.sprite.position.set(0, 3.5, -townRadius - 1); group.add(label.sprite);
    const stem = lineFor([new THREE.Vector3(0, 1, -townRadius - 1), new THREE.Vector3(0, 2.8, -townRadius - 1)], meta.glow, .75); group.add(stem);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.2), new THREE.MeshStandardMaterial({ color: meta.glow, emissive: meta.glow, emissiveIntensity: 1.2, metalness: .5, roughness: .2 }));
    beacon.position.set(0, 2.6, -townRadius - 1); group.add(beacon);
    const victoryRing = new THREE.Mesh(new THREE.RingGeometry(townRadius * 1.12, townRadius * 1.15, 96), new THREE.MeshBasicMaterial({ color: 0xffdc8c, transparent: true, opacity: .75, side: THREE.DoubleSide }));
    victoryRing.rotation.x = -Math.PI / 2; victoryRing.position.y = .83; victoryRing.visible = false; group.add(victoryRing);
    const fogMat = new THREE.MeshStandardMaterial({ color: 0x762c32, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
    const fog = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(townRadius * .34, 1), fogMat);
      puff.scale.set(1.7, .4, 1); puff.position.set(Math.cos(k * 1.6) * townRadius * .65, 1.5, Math.sin(k * 1.6) * townRadius * .65); fog.add(puff);
    }
    fog.visible = false; group.add(fog);
    regions.push({ meta, data, group, topMat, sideMat, stages, borders, label, beacon, stem, victoryRing, fog, fogMat, stage: 0, economy: 100, points: 0, targetY: 0, targetColor: new THREE.Color(1, 1, 1), topTint: new THREE.Color(1, 1, 1) });
  }
  const hud = document.createElement("div"); hud.className = "map-tools";
  const homeButton = document.createElement("button"); homeButton.type = "button"; homeButton.textContent = "↗ Вся карта"; homeButton.title = "Вернуть общий вид Казахстана";
  hud.append(homeButton); canvas.parentElement.append(hud);
  let selected = null, cameraTween = null, disposed = false, frame = 0, initial = true;
  function moveCamera(target, distance) {
    cameraTween = { target, position: target.clone().add(new THREE.Vector3(0, distance * .79, distance * .71)) };
  }
  function overview() {
    selected = null;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2), distance = Math.max(44, 44 / (Math.tan(halfFov) * camera.aspect));
    moveCamera(new THREE.Vector3(0, 0, 0), Math.min(138, distance));
  }
  homeButton.addEventListener("click", overview);
  function focusRegion(id) {
    const region = regions.find(r => r.meta.id === id); if (!region) return;
    selected = id;
    const width = region.data.bounds[2] - region.data.bounds[0], depth = region.data.bounds[3] - region.data.bounds[1];
    const target = new THREE.Vector3(region.data.city[0], .6, region.data.city[1]);
    const distance = Math.max(14, Math.max(width / Math.max(.8, camera.aspect), depth * .9) * 1.65);
    moveCamera(target, distance);
  }
  const stopTween = () => { cameraTween = null; };
  controls.addEventListener("start", stopTween);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down = null;
  const onDown = e => { down = [e.clientX, e.clientY]; };
  const onUp = e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rect = canvas.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(surfaces, false)[0];
    if (hit) focusRegion(hit.object.userData.regionId); down = null;
  };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (selected) focusRegion(selected); else overview();
    if (initial && cameraTween) { camera.position.copy(cameraTween.position); controls.target.copy(cameraTween.target); cameraTween = null; initial = false; }
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function update(state, selectedRegionId) {
    for (const r of state.regions) {
      const region = regions.find(item => item.meta.id === r.id); if (!region) continue;
      region.points = clamp(r.points, 0, RESOURCE_CAP); region.economy = r.economy;
      region.stage = developmentFor(region.points).index;
      region.targetY = .1 + region.points / RESOURCE_CAP * .9 - (1 - r.economy / 100) * 1.45;
      const crisis = r.economy < CRISIS_THRESHOLD;
      region.targetColor.set(crisis ? 0x634048 : 0xffffff).multiplyScalar(crisis ? 1 : .6 + r.economy / 250);
      region.topMat.emissive.set(crisis ? 0xc33532 : region.points === RESOURCE_CAP ? 0xdcb864 : region.meta.color);
      region.topMat.emissiveIntensity = crisis ? .18 : .025 + region.points / RESOURCE_CAP * .085;
      for (const border of region.borders) { border.material.color.set(crisis ? 0xff655b : region.points === RESOURCE_CAP ? 0xffdf94 : region.meta.glow); border.material.opacity = region.meta.id === selectedRegionId || crisis || region.points === RESOURCE_CAP ? .95 : .5; }
      region.victoryRing.visible = region.points === RESOURCE_CAP;
      paintLabel(region.label, region.meta, region.points, r.economy);
    }
  }
  const clock = new THREE.Clock(), reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animate() {
    if (disposed) return; frame = requestAnimationFrame(animate);
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime, rate = reduceMotion ? 1 : 1 - Math.exp(-dt * 5);
    if (cameraTween) {
      camera.position.lerp(cameraTween.position, rate); controls.target.lerp(cameraTween.target, rate);
      if (camera.position.distanceTo(cameraTween.position) < .02) cameraTween = null;
    }
    for (const region of regions) {
      region.group.position.y = THREE.MathUtils.lerp(region.group.position.y, region.targetY, rate);
      region.topTint.lerp(region.targetColor, rate); region.topMat.color.copy(region.topTint);
      for (let i = 0; i < region.stages.length; i++) {
        const stage = region.stages[i], target = i < region.stage ? 1 : .001;
        stage.scale.y = THREE.MathUtils.lerp(stage.scale.y, target, rate); stage.visible = stage.scale.y > .012;
      }
      region.beacon.rotation.y += reduceMotion ? 0 : dt * .55; region.beacon.position.y = 2.6 + (reduceMotion ? 0 : Math.sin(t * 1.7) * .12);
      const opacity = region.economy < CRISIS_THRESHOLD ? (1 - region.economy / 100) * .32 : 0;
      region.fogMat.opacity = THREE.MathUtils.lerp(region.fogMat.opacity, opacity, rate); region.fog.visible = region.fogMat.opacity > .01;
      region.fog.children.forEach((p, i) => { p.position.y = 1.5 + (reduceMotion ? 0 : Math.sin(t * .45 + i) * .12); });
    }
    controls.update(); renderer.render(scene, camera);
  }
  animate();
  function dispose() {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
    canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp); hud.remove();
    const geometries = new Set(), mats = new Set(), textures = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) { mats.add(mat); if (mat.map) textures.add(mat.map); } });
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose()); renderer.dispose();
    box.dispose(); cone.dispose(); cylinder.dispose(); dome.dispose();
  }
  return { scene, camera, controls, renderer, update, focusRegion, overview, resize, dispose };
}
