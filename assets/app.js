import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { CONFIG } from "./config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IN = 25.4;

/* =====================================================================
   DADOS DOS MODELOS (mm, eixo da roda = Z, igual aos scripts CadQuery)
   ===================================================================== */
const MODELS = {
  perf: {
    id: "perf", file: "models/mission-flor-18-bmw-m4.glb",
    name: "Mission Flor Performance", eyebrow: "Aro 18″ · BMW M4 G82",
    lead: "Face profundamente côncava com raios em Y geométricos em formato de flor, dimensionada para a plataforma BMW CLAR / G82.",
    readout: ["18″", "9,5J · 5×112 · CB 66,6"],
    inch: 18, rimW: 9.5 * IN, rSeat: 9 * IN, rFlange: 9 * IN + 17.3, rWell: 207, zMount: 9.5 * IN / 2 - 35,
    tire: { w: 265, h: 93, label: "265/35 R18" },
    brake: { hatR: 86, rin: 120, rr: 188, T: 32, zOff: 38, calCenter: 120, calHalf: 27 },
    specs: [
      ["Diâmetro do aro", "18 polegadas", "457,2 mm"],
      ["Largura da tala", "9.5J", "18×9.5J"],
      ["Furação (PCD)", "5×112 mm", "Parafusos M14 cônicos"],
      ["Cubo central", "66,6 mm", "Plataforma BMW CLAR / G82", true],
      ["Perfil de construção", "Profundamente côncavo", "Raios em Y geométricos em formato de flor"],
      ["Materiais", "Alumínio forjado", "Barril interno e detalhes em fibra de carbono real"],
      ["Offset de referência", "ET 35", "Valor do modelo CAD; definido por aplicação"],
    ],
    compatCol: 2,
  },
  compact: {
    id: "compact", file: "models/mission-flor-16-compact.glb",
    name: "Mission Flor Compact", eyebrow: "Aro 16″ · Fitment universal",
    lead: "Seis pétalas angulares inspiradas na Porsche Mission, com furação dupla para atender mais de uma plataforma.",
    readout: ["16″", "7,0J · 4×100 / 5×114,3 · CB 67,1"],
    inch: 16, rimW: 7 * IN, rSeat: 8 * IN, rFlange: 8 * IN + 17.3, rWell: 182, zMount: 7 * IN / 2 - 35,
    tire: { w: 205, h: 113, label: "205/55 R16" },
    brake: { hatR: 62, rin: 96, rr: 152, T: 26, zOff: 38, calCenter: 120, calHalf: 30 },
    specs: [
      ["Diâmetro do aro", "16 polegadas", "406,4 mm"],
      ["Largura da tala", "7.0J", "16×7J"],
      ["Furação (PCD)", "Multi-padrão", "4×100 mm / 5×114,3 mm"],
      ["Cubo central", "67,1 mm", "Aceita anel de centragem", true],
      ["Raios", "6 pétalas angulares", "Geometria inspirada na Porsche Mission"],
      ["Detalhe exclusivo", "Inserções em fibra de carbono usinada", "Calota central com emblema floral Rosa Magenta"],
      ["Offset de referência", "ET 35", "Valor do modelo CAD; definido por aplicação"],
    ],
    compatCol: 3,
  },
};
const FINISHES = {
  alu:      { label: "Alumínio natural", color: 0xc9ccd1, rough: 0.27, metal: 1 },
  graphite: { label: "Grafite fosco",    color: 0x3a3d43, rough: 0.46, metal: 1 },
  bronze:   { label: "Bronze acetinado", color: 0x8d6b47, rough: 0.34, metal: 1 },
};
const LIGHTS = {
  studio: { exposure: 1.0, key: [0xffffff, 0.7], env: 1.0 },
  cyber:  { exposure: 1.05, key: [0x66e6ff, 0.6], env: 1.15 },
  sunset: { exposure: 1.0, key: [0xffb15c, 0.8], env: 1.05 },
};
const state = { model: "perf", light: "studio", finish: "alu", brake: false, carbon: false, tire: false, spin: false };

/* =====================================================================
   RENDERER / CENA
   ===================================================================== */
const stageEl = $("#stage");
const canvas = $("#gl");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  $("#nogl").hidden = false; $("#loader").classList.add("is-done");
  console.error(e);
}
if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(0.55, 0.12, 1.25);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, rotateSpeed: 0.7, zoomSpeed: 0.7, panSpeed: 0.6, minDistance: 0.4, maxDistance: 3.2, screenSpacePanning: true, autoRotateSpeed: 1.1 });

  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(2, 3, 4); scene.add(key);

  /* ---------- ambientes (HDR procedural via PMREM) ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};
  function panel(s, w, h, pos, look, rgb, k) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.lookAt(...look); s.add(m);
  }
  function buildEnv(kind) {
    const s = new THREE.Scene();
    const wall = { studio: 0x232427, cyber: 0x03050a, sunset: 0x140b07 }[kind];
    s.add(new THREE.Mesh(new THREE.BoxGeometry(16, 9, 16), new THREE.MeshBasicMaterial({ color: wall, side: THREE.BackSide })));
    const o = [0, 0, 0];
    if (kind === "studio") {
      panel(s, 9, 9, [0, 4.4, 0], o, [1, 1, 1], 5);
      panel(s, 2.2, 7, [-7.5, 0.5, 1], o, [1, 1, 1], 9);
      panel(s, 2.2, 7, [7.5, 0.5, 2], o, [0.9, 0.95, 1], 5);
      panel(s, 10, 1.6, [0, -1, -7.8], o, [1, 1, 1], 3.5);
      panel(s, 8, 2, [0, 0.5, 7.8], o, [1, 1, 1], 1.6);
    } else if (kind === "cyber") {
      panel(s, 1.2, 8, [-7.5, 0.5, 1.5], o, [0, 0.9, 1], 14);
      panel(s, 1.2, 8, [7.5, 0.5, 1.5], o, [1, 0.06, 0.5], 14);
      panel(s, 10, 0.6, [0, 4.4, 0], o, [1, 1, 1], 4);
      panel(s, 12, 0.5, [0, -3, -7.8], o, [0, 0.8, 1], 6);
      panel(s, 6, 3, [0, 0.5, 7.8], o, [0.5, 0.2, 1], 1.2);
    } else {
      panel(s, 9, 7, [-6.5, -0.5, -5], o, [1, 0.52, 0.14], 12);
      panel(s, 8, 8, [0, 4.4, 0], o, [1, 0.82, 0.55], 3);
      panel(s, 2.5, 7, [7.5, 0.5, 2], o, [0.55, 0.2, 0.75], 3.2);
      panel(s, 8, 2, [0, 0.5, 7.8], o, [1, 0.7, 0.4], 1.4);
    }
    return pmrem.fromScene(s, 0.03).texture;
  }
  function setLight(name) {
    state.light = name;
    envCache[name] ||= buildEnv(name);
    scene.environment = envCache[name];
    const L = LIGHTS[name];
    renderer.toneMappingExposure = L.exposure;
    key.color.set(L.key[0]); key.intensity = L.key[1];
    allMats.forEach((m) => (m.envMapIntensity = L.env));
    stageEl.dataset.light = name;
    $$("#lightSeg button").forEach((b) => { const on = b.dataset.light === name; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
  }

  /* ---------- materiais ---------- */
  function carbonTextures() {
    const N = 256, cell = 32, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d");
    g.fillStyle = "#050506"; g.fillRect(0, 0, N, N);
    for (let j = 0; j < N / cell; j++) for (let i = 0; i < N / cell; i++) {
      const warp = ((i + j) & 3) < 2;
      const x = i * cell, y = j * cell;
      const grad = warp ? g.createLinearGradient(x, 0, x + cell, 0) : g.createLinearGradient(0, y, 0, y + cell);
      const hi = warp ? "#4a4d54" : "#3a3d43";
      grad.addColorStop(0, "#08080a"); grad.addColorStop(0.5, hi); grad.addColorStop(1, "#08080a");
      g.fillStyle = grad; g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      g.strokeStyle = "rgba(255,255,255,.04)"; g.lineWidth = 1;
      for (let k = 6; k < cell; k += 6) { g.beginPath(); if (warp) { g.moveTo(x + k, y); g.lineTo(x + k, y + cell); } else { g.moveTo(x, y + k); g.lineTo(x + cell, y + k); } g.stroke(); }
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    const bump = new THREE.CanvasTexture(c);
    [map, bump].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; });
    return { map, bump };
  }
  const ct = carbonTextures();
  const mat = {
    metal: new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.27, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    insert: new THREE.MeshPhysicalMaterial({ color: 0x8e9197, metalness: 1, roughness: 0.5 }),
    carbon: new THREE.MeshPhysicalMaterial({ map: ct.map, bumpMap: ct.bump, bumpScale: 1.2, color: 0xffffff, metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.07 }),
    cap: new THREE.MeshPhysicalMaterial({ color: 0xc8006c, metalness: 0.1, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.1 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0x0636b8, metalness: 0.1, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.88, metalness: 0 }),
    rotorEdge: new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 1, roughness: 0.42, side: THREE.DoubleSide }),
  };
  const allMats = Object.values(mat);

  function rotorTexture(def) {
    const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"), k = S / 2 / def.rr;
    g.fillStyle = "#777a80"; g.fillRect(0, 0, S, S);
    for (let r = def.hatR * k; r < S / 2; r += 1.6) { g.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`; g.beginPath(); g.arc(S / 2, S / 2, r, 0, 7); g.stroke(); }
    g.fillStyle = "#101012";
    const rings = 3, pitch = (def.rr - def.rin - 16) / (rings - 1);
    for (let ri = 0; ri < rings; ri++) {
      const rr = def.rin + 8 + ri * pitch, n = Math.round((2 * Math.PI * rr) / 26);
      for (let i = 0; i < n; i++) {
        const a = (i + (ri % 2) * 0.5) / n * Math.PI * 2;
        g.beginPath(); g.arc(S / 2 + Math.cos(a) * rr * k, S / 2 + Math.sin(a) * rr * k, 3.3 * k, 0, 7); g.fill();
      }
    }
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2;
    g.beginPath(); g.arc(S / 2, S / 2, def.rin * k, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function labelTexture() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 256;
    const g = c.getContext("2d"); g.textAlign = "center"; g.fillStyle = "#f5f7fa";
    g.font = "700 78px Montserrat, Arial, sans-serif"; g.fillText("MISSION", 256, 118);
    g.font = "500 30px Montserrat, Arial, sans-serif"; g.fillText("F L O R   P E R F O R M A N C E", 256, 168);
    g.fillStyle = "#e5007d"; g.fillRect(96, 192, 320, 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }

  /* ---------- freio (disco ventilado + caliper azul) ---------- */
  function buildBrake(def) {
    const b = def.brake, g = new THREE.Group(), zm = def.zMount;
    const zr0 = zm + b.zOff, zr1 = zr0 + b.T;
    const rotorFace = new THREE.MeshStandardMaterial({ map: rotorTexture(b), metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide });
    const ringGeo = new THREE.RingGeometry(b.hatR, b.rr, 128);
    const f0 = new THREE.Mesh(ringGeo, rotorFace); f0.position.z = zr0; g.add(f0);
    const f1 = new THREE.Mesh(ringGeo, rotorFace); f1.position.z = zr1; g.add(f1);
    const cyl = (r, z0, z1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, 96, 1, true).rotateX(Math.PI / 2), mat.rotorEdge); m.position.z = (z0 + z1) / 2; return m; };
    g.add(cyl(b.rr, zr0, zr1), cyl(b.hatR, zm + 1, zr0));
    const flange = new THREE.Mesh(new THREE.RingGeometry(34, b.hatR, 64), mat.rotorEdge); flange.position.z = zm + 1; g.add(flange);

    const bt = 2.5;
    const sector = (r0, r1, half) => { const s = new THREE.Shape(); s.absarc(0, 0, r1, -half, half, false); s.absarc(0, 0, r0, half, -half, true); s.closePath(); return s; };
    const part = (r0, r1, za, zb, half) => {
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sector(r0, r1, half), { depth: zb - za - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 4, curveSegments: 28 }), mat.caliper);
      m.position.z = za + bt; return m;
    };
    const cal = new THREE.Group(), h = (b.calHalf * Math.PI) / 180;
    cal.add(part(b.rin - 6, b.rr + 9, zr0 - 34, zr0 - 3, h));
    cal.add(part(b.rin - 6, b.rr + 9, zr1 + 3, zr1 + 34, h));
    cal.add(part(b.rr + 1, b.rr + 9.5, zr0 - 34, zr1 + 34, h));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(72, 36), new THREE.MeshBasicMaterial({ map: labelTexture(), transparent: true, toneMapped: false }));
    const lr = (b.rin + b.rr) / 2 + 2; lab.position.set(lr, 0, zr0 - 34 - 2.6 - 0.2); lab.rotation.z = Math.PI / 2; lab.rotation.y = 0;
    lab.scale.set(-1, 1, 1);
    cal.add(lab);
    cal.rotation.z = (b.calCenter * Math.PI) / 180;
    g.add(cal);
    return g;
  }

  /* ---------- pneu ---------- */
  function buildTire(def) {
    const { w, h } = def.tire, rS = def.rSeat, rF = def.rFlange, rOut = rS + h, zh = def.rimW / 2;
    const half = [[rF - 5, zh - 2], [rF + 3, zh + 4], [rS + 0.36 * h, w / 2], [rS + 0.72 * h, (w / 2) * 0.93], [rOut - 7, (w / 2) * 0.66], [rOut - 0.5, (w / 2) * 0.34], [rOut, 0]];
    const all = [new THREE.Vector2(half[0][0], -half[0][1])];
    for (let i = 1; i < half.length; i++) all.push(new THREE.Vector2(half[i][0], -half[i][1]));
    for (let i = half.length - 2; i >= 0; i--) all.push(new THREE.Vector2(half[i][0], half[i][1]));
    const spl = new THREE.SplineCurve(all).getPoints(120);
    const geo = new THREE.LatheGeometry(spl, 160); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat.rubber); m.position.z = zh; m.material.side = THREE.DoubleSide;
    return m;
  }

  /* ---------- montagem da roda a partir do GLB ---------- */
  function genUV(geo, mode, def) {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2), T = 20;
    for (let i = 0; i < p.count; i += 3) {
      if (mode === "planar") {
        for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = p.getX(i + k) / T; uv[(i + k) * 2 + 1] = p.getY(i + k) / T; }
      } else {
        const th = [0, 1, 2].map((k) => Math.atan2(p.getY(i + k), p.getX(i + k)));
        for (let k = 1; k < 3; k++) { const d = th[k] - th[0]; if (d > Math.PI) th[k] -= 2 * Math.PI; else if (d < -Math.PI) th[k] += 2 * Math.PI; }
        for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = (th[k] * def.rWell) / T; uv[(i + k) * 2 + 1] = p.getZ(i + k) / T; }
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  function buildWheel(def, gltfScene) {
    const content = new THREE.Group();
    const parts = {};
    gltfScene.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.name.toLowerCase().includes("insert") ? "insert" : o.name.toLowerCase().includes("barrel") ? "barrel" : o.name.toLowerCase().includes("cap") ? "cap" : "metal";
      let geo = toCreasedNormals(o.geometry, 0.55);
      if (n === "insert") genUV(geo, "planar", def);
      if (n === "barrel") genUV(geo, "cyl", def);
      const m = new THREE.Mesh(geo, n === "cap" ? mat.cap : n === "insert" ? mat.insert : mat.metal);
      parts[n] = m; content.add(m);
    });
    content.position.z = -def.rimW / 2;
    const brake = buildBrake(def); brake.visible = state.brake; content.add(brake);
    const tire = buildTire(def); tire.visible = state.tire; content.add(tire);
    const root = new THREE.Group(); root.add(content);
    root.rotation.y = Math.PI; // face frontal (Z=0) volta para a câmera
    root.userData.base = 0.001; root.scale.setScalar(0.001);
    root.visible = false; scene.add(root);
    return { def, root, parts, brake, tire };
  }

  const gltf = new GLTFLoader();
  const loaded = {}, built = {};
  function load(def, onProgress) {
    loaded[def.id] ||= new Promise((res, rej) => gltf.load(def.file, (g) => { const w = buildWheel(def, g.scene); built[def.id] = w; res(w); }, onProgress, rej));
    return loaded[def.id];
  }

  /* ---------- sombra de contato ---------- */
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.45, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  /* ---------- tweens ---------- */
  const tweens = [];
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function tween(ms, step, done) { const t = { t0: performance.now(), ms, step, done }; tweens.push(t); return t; }
  function runTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i], k = Math.min(1, (now - t.t0) / t.ms);
      t.step(ease(k));
      if (k >= 1) { tweens.splice(i, 1); t.done && t.done(); }
    }
  }

  /* ---------- câmera ---------- */
  const VIEWS = { front: [0, 90], three: [38, 80], side: [90, 90], rear: [180, 90] };
  function visRadius() { const d = MODELS[state.model]; return (state.tire ? d.rSeat + d.tire.h : d.rFlange) / 1000; }
  function fitDist() {
    const asp = camera.aspect, t = Math.tan((camera.fov * Math.PI) / 360);
    return (visRadius() * 1.18) / (t * Math.min(asp, 1)) * 1.3;
  }
  let viewTween = null;
  function goView(az, pol, dist) {
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const toTheta = (az * Math.PI) / 180, toPhi = (pol * Math.PI) / 180, toR = dist ?? fitDist();
    let dth = toTheta - from.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    controls.autoRotate = false;
    const tgt0 = controls.target.clone();
    if (viewTween) tweens.splice(tweens.indexOf(viewTween), 1);
    viewTween = tween(900, (e) => {
      const s = new THREE.Spherical(from.radius + (toR - from.radius) * e, from.phi + (toPhi - from.phi) * e, from.theta + dth * e);
      controls.target.lerpVectors(tgt0, new THREE.Vector3(), e);
      camera.position.setFromSpherical(s).add(controls.target);
      camera.lookAt(controls.target);
    }, () => { controls.autoRotate = state.spin; viewTween = null; });
    $$("#viewSeg button").forEach((x) => x.classList.remove("is-on"));
  }

  /* ---------- estado → cena ---------- */
  const cur = () => built[state.model];
  const wheels = [];
  function applyFinish() {
    const f = FINISHES[state.finish];
    mat.metal.color.setHex(f.color); mat.metal.roughness = f.rough;
    mat.insert.color.setHex(f.color).multiplyScalar(0.62); mat.insert.roughness = f.rough + 0.22;
    $$("#swatches .sw").forEach((b) => { const on = b.dataset.finish === state.finish; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
    $("#qFinish").value = state.finish;
  }
  function applyToggles() {
    wheels.forEach((w) => {
      w.brake.visible = state.brake; w.tire.visible = state.tire;
      if (w.parts.insert) w.parts.insert.material = state.carbon ? mat.carbon : mat.insert;
      if (w.parts.barrel) w.parts.barrel.material = state.carbon ? mat.carbon : mat.metal;
    });
    [["#tBrake", state.brake], ["#tCarbon", state.carbon], ["#tTire", state.tire], ["#tSpin", state.spin]].forEach(([s, v]) => $(s).setAttribute("aria-pressed", v));
    controls.autoRotate = state.spin && !viewTween;
    const sy = -visRadius();
    shadow.position.y = sy + 0.002; shadow.scale.setScalar(visRadius() * 3.4);
  }

  /* ---------- troca de modelo ---------- */
  let swapping = false;
  async function selectModel(id, first = false) {
    if (swapping || (state.model === id && !first)) return;
    swapping = true;
    const prev = first ? null : cur();
    state.model = id;
    renderPanel(first);
    const nextP = load(MODELS[id]);
    const w = await nextP; if (!wheels.includes(w)) wheels.push(w);
    applyToggles();
    const base = 0.001;
    const finishIn = () => {
      w.root.visible = true; w.root.scale.setScalar(base * 0.9);
      tween(700, (e) => { w.root.scale.setScalar(base * (0.9 + 0.1 * e)); w.root.rotation.z = (1 - e) * -0.5; }, () => { swapping = false; });
      goView(...(viewKey ? VIEWS[viewKey] : [camera ? currentAz() : 38, 80]), fitDist());
    };
    if (prev) tween(220, (e) => prev.root.scale.setScalar(base * (1 - 0.1 * e)), () => { prev.root.visible = false; finishIn(); });
    else finishIn();
  }
  let viewKey = null;
  const currentAz = () => (new THREE.Spherical().setFromVector3(camera.position).theta * 180) / Math.PI;

  /* ---------- painel ---------- */
  function renderPanel(first) {
    const d = MODELS[state.model];
    $("#mEyebrow").textContent = d.eyebrow; $("#mName").textContent = d.name; $("#mLead").textContent = d.lead;
    $("#specs").innerHTML = d.specs.map(([k, v, n, hub], i) => `<div class="spec${hub ? " is-hub" : ""}" style="--i:${i}"><dt>${k}</dt><dd><strong>${v}</strong>${n ? `<em>${n}</em>` : ""}</dd></div>`).join("");
    $("#readout").innerHTML = `<b>${d.readout[0]}</b>${d.readout[1]}`;
    $$(".tab").forEach((t) => { const on = t.dataset.model === state.model; t.classList.toggle("is-on", on); t.setAttribute("aria-selected", on); });
    $("#tabInd").style.transform = state.model === "perf" ? "translateX(0)" : "translateX(100%)";
    $("#qModel").value = state.model;
    $("#tBrake").lastChild.textContent = state.model === "perf" ? "Freio M-Performance" : "Freio com caliper azul";
    $("#specs").closest(".panel-body").scrollTop = 0;
  }

  /* ---------- resize / loop ---------- */
  function resize() {
    const r = stageEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl); resize();
  let onScreen = true;
  new IntersectionObserver(([e]) => (onScreen = e.isIntersecting), { threshold: 0 }).observe(stageEl);
  function loop(now) {
    requestAnimationFrame(loop);
    if (!onScreen) return;
    runTweens(now);
    controls.update();
    renderer.render(scene, camera);
  }

  /* ---------- UI ---------- */
  $$("#lightSeg button").forEach((b) => b.addEventListener("click", () => setLight(b.dataset.light)));
  $$("#viewSeg button").forEach((b) => b.addEventListener("click", () => { viewKey = b.dataset.view; goView(...VIEWS[viewKey]); b.classList.add("is-on"); }));
  $$(".tab").forEach((t) => t.addEventListener("click", () => selectModel(t.dataset.model)));
  $$("#swatches .sw").forEach((b) => b.addEventListener("click", () => { state.finish = b.dataset.finish; applyFinish(); }));
  const flip = (k, id) => $(id).addEventListener("click", () => { state[k] = !state[k]; applyToggles(); if (k === "tire") goView(...(viewKey ? VIEWS[viewKey] : [currentAz(), 80]), fitDist()); });
  flip("brake", "#tBrake"); flip("carbon", "#tCarbon"); flip("tire", "#tTire"); flip("spin", "#tSpin");
  const hint = $("#hint"); canvas.addEventListener("pointerdown", () => { hint.classList.add("is-gone"); viewKey = null; $$("#viewSeg button").forEach((x) => x.classList.remove("is-on")); controls.autoRotate = state.spin; if (viewTween) { tweens.splice(tweens.indexOf(viewTween), 1); viewTween = null; } }, { passive: true });
  window.addEventListener("keydown", (e) => { if (e.target.closest("input,textarea,select")) return; const m = { 1: "perf", 2: "compact" }[e.key]; if (m) selectModel(m); });

  /* ---------- API p/ PDF ---------- */
  window.__mf = { state, MODELS, FINISHES, snapshot() { renderer.render(scene, camera); return canvas; } };

  /* ---------- boot ---------- */
  setLight("studio"); applyFinish();
  const bar = $("#loaderBar");
  load(MODELS.perf, (e) => { if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + "%"; })
    .then(async (w) => {
      wheels.push(w); state.model = "perf"; renderPanel(true); applyToggles();
      const d = fitDist(); camera.position.setFromSpherical(new THREE.Spherical(d * 1.15, (80 * Math.PI) / 180, (-35 * Math.PI) / 180)); camera.lookAt(0, 0, 0);
      w.root.visible = true; w.root.scale.setScalar(0.0009);
      requestAnimationFrame(loop);
      bar.style.width = "100%";
      setTimeout(() => $("#loader").classList.add("is-done"), 250);
      tween(1400, (e) => { w.root.scale.setScalar(0.001 * (0.9 + 0.1 * e)); w.root.rotation.z = (1 - e) * -0.9; });
      goView(38, 80, d);
      load(MODELS.compact).then((c) => { wheels.push(c); applyToggles(); });
    })
    .catch((err) => { console.error(err); $("#loaderText").textContent = "Não foi possível carregar o modelo 3D"; });
}

/* =====================================================================
   PÁGINA: header, orçamento, PDF
   ===================================================================== */
const topbar = $("#topbar");
const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 24);
window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

$("#btnQuote").addEventListener("click", () => {
  document.getElementById("orcamento").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => $("#qName").focus({ preventScroll: true }), 700);
});

/* --- formulário --- */
const mailLink = $("#mailLink"); mailLink.textContent = CONFIG.contactEmail; mailLink.href = "mailto:" + CONFIG.contactEmail;
const MODEL_LABEL = { perf: "Mission Flor Performance 18″ (BMW M4 G82)", compact: "Mission Flor Compact 16″ (universal)" };
function quoteText() {
  const f = (id) => $(id).value.trim();
  const sel = (id) => $(id).selectedOptions[0].textContent;
  return [
    `Solicitação de orçamento: ${CONFIG.brand}`, "",
    `Nome: ${f("#qName")}`, `Contato: ${f("#qContact")}`, `Veículo: ${f("#qCar")}`,
    `Modelo: ${MODEL_LABEL[$("#qModel").value]}`, `Acabamento: ${sel("#qFinish")}`, `Quantidade: ${$("#qQty").value}`,
    f("#qMsg") ? `Observações: ${f("#qMsg")}` : "",
  ].filter((x) => x !== "").join("\n");
}
function validQuote() {
  let ok = true;
  ["#qName", "#qContact", "#qCar"].forEach((s) => { const el = $(s), bad = !el.value.trim(); el.classList.toggle("is-bad", bad); if (bad) ok = false; });
  if (!ok) { $("#formStatus").textContent = "Preencha nome, contato e veículo para continuar."; $("#qName").value.trim() ? ($("#qContact").value.trim() ? $("#qCar") : $("#qContact")).focus() : $("#qName").focus(); }
  return ok;
}
const waUrl = () => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(quoteText())}`;
$("#waLink").href = `https://wa.me/${CONFIG.whatsapp}`;
$("#qWa").addEventListener("click", (e) => { if (!validQuote()) { e.preventDefault(); return; } $("#qWa").href = waUrl(); $("#formStatus").textContent = "Abrindo o WhatsApp com os dados preenchidos."; });
$("#quoteForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (!validQuote()) return;
  const url = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent("Orçamento " + CONFIG.brand)}&body=${encodeURIComponent(quoteText())}`;
  $("#formStatus").textContent = `Abrindo seu aplicativo de e-mail. Se nada abrir, escreva para ${CONFIG.contactEmail}.`;
  window.location.href = url;
});
$$("#quoteForm input").forEach((i) => i.addEventListener("input", () => i.classList.remove("is-bad")));

/* --- PDF --- */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
const safe = (s) => String(s).replace(/″/g, " pol.").replace(/→/g, "para").replace(/[–—]/g, "-");
$("#btnPdf").addEventListener("click", async () => {
  const btn = $("#btnPdf"), mf = window.__mf; if (!mf) return;
  const label = btn.lastChild.textContent; btn.disabled = true; btn.lastChild.textContent = "Gerando PDF";
  try {
    if (!window.jspdf) await loadScript("vendor/jspdf/jspdf.umd.min.js");
    const { jsPDF } = window.jspdf, d = mf.MODELS[mf.state.model], fin = mf.FINISHES[mf.state.finish];
    const src = mf.snapshot();
    const W = 1800, H = 900, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#0e0e0f"; g.fillRect(0, 0, W, H);
    const sc = Math.min(W / src.width, H / src.height) * 1; g.drawImage(src, (W - src.width * sc) / 2, (H - src.height * sc) / 2, src.width * sc, src.height * sc);
    const img = c.toDataURL("image/jpeg", 0.92);

    const doc = new jsPDF({ unit: "mm", format: "a4" }), PW = 210, M = 16;
    doc.setFillColor(10, 10, 10); doc.rect(0, 0, PW, 30, "F");
    doc.setFillColor(229, 0, 125); doc.circle(M + 4, 15, 1.6, "F");
    doc.setDrawColor(169, 173, 180); doc.setLineWidth(0.3);
    for (let k = 0; k < 5; k++) { const a = (k * 72 - 90) * Math.PI / 180; doc.ellipse(M + 4 + Math.cos(a) * 3.6, 15 + Math.sin(a) * 3.6, 1.7, 2.6); }
    doc.setTextColor(236, 238, 241); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("MISSION", M + 14, 16.2, { charSpace: 1.6 });
    doc.setFont("helvetica", "normal"); doc.text("FLOR", M + 14 + 27, 16.2, { charSpace: 1.6 });
    doc.setFontSize(8); doc.setTextColor(169, 173, 180); doc.text("FICHA TECNICA", PW - M - 34, 16.2, { charSpace: 1.4 });

    doc.setTextColor(18, 18, 18); doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.text(safe(d.name), M, 46);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(110, 114, 122); doc.text(safe(d.eyebrow).toUpperCase(), M, 53, { charSpace: 0.6 });
    doc.addImage(img, "JPEG", M, 60, PW - 2 * M, ((PW - 2 * M) * H) / W);

    let y = 60 + ((PW - 2 * M) * H) / W + 12;
    doc.setFontSize(8); doc.setTextColor(110, 114, 122); doc.setFont("helvetica", "bold"); doc.text("ESPECIFICACOES TECNICAS", M, y, { charSpace: 1.2 }); y += 4;
    const rows = [...d.specs, ["Acabamento", fin.label, "Selecionado no configurador"]];
    const brk = (need) => { if (y + need > 276) { doc.addPage(); y = 20; } };
    rows.forEach(([k, v, n]) => {
      brk(16);
      doc.setDrawColor(215, 217, 221); doc.setLineWidth(0.2); doc.line(M, y, PW - M, y);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(110, 114, 122); doc.text(safe(k).toUpperCase(), M, y + 6, { charSpace: 0.6 });
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(18, 18, 18);
      const vl = doc.splitTextToSize(safe(v), 118); doc.text(vl, M + 54, y + 6);
      let h = 6 + vl.length * 4.4;
      if (n) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 114, 122); const nl = doc.splitTextToSize(safe(n), 118); doc.text(nl, M + 54, y + h + 0.2); h += nl.length * 3.8 + 0.4; }
      y += h + 2.8;
    });
    doc.line(M, y, PW - M, y); y += 9;

    const col = d.compatCol, list = $$(".compat tbody tr").map((tr) => ({ n: tr.children[0].childNodes[0].textContent.trim(), c: tr.children[col].textContent.trim() })).filter((r) => !/Não indicado/i.test(r.c));
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(110, 114, 122); doc.text("VEICULOS DE REFERENCIA", M, y, { charSpace: 1.2 }); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(18, 18, 18);
    list.forEach((r) => { brk(6); doc.text(safe(r.n), M, y); doc.setTextColor(110, 114, 122); doc.text(safe(r.c), PW - M, y, { align: "right" }); doc.setTextColor(18, 18, 18); y += 5; });

    doc.setFontSize(7.5); doc.setTextColor(130, 134, 141);
    const foot = doc.splitTextToSize("Valores de referencia do modelo CAD. Offset, folga de freio e medida do pneu devem ser confirmados por aplicacao. BMW, M4, G82 e Porsche sao marcas de seus respectivos proprietarios, citadas apenas para indicar compatibilidade e inspiracao de desenho. Sem afiliacao.", PW - 2 * M);
    brk(24); doc.text(foot, M, 280);
    doc.text(new Date().toLocaleDateString("pt-BR"), PW - M, 290, { align: "right" });
    doc.save(`mission-flor-${d.inch}-ficha-tecnica.pdf`);
  } catch (err) { console.error(err); alert("Não foi possível gerar o PDF. Tente novamente."); }
  btn.disabled = false; btn.lastChild.textContent = label;
});
