import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { wanderStep, threat, applyHit, lightFromProgress, lightToScene, atExit, riverStep, atGoal } from './dotforest-mechanics.js';
import { AREAS, AREA_ORDER } from './areas.js';
import { DotPadSDK, DotPadScanner, DisplayMode, DataCodes, KeyCodes } from './DotPadSDK-3_0_0.js';

const DOT_WIDTH = 60;
const DOT_HEIGHT = 40;
const WORLD_LIMIT_X = 26;
const WORLD_LIMIT_Z = 17;
const MOVE_STEP = 1.2;
const ITEM_COLLECT_DISTANCE = 2.25;

const dom = {
  gameCanvas: document.getElementById('gameCanvas'),
  tactileCanvas: document.getElementById('tactileCanvas'),
  liveStatus: document.getElementById('liveStatus'),
  scoreText: document.getElementById('scoreText'),
  dotpadState: document.getElementById('dotpadState'),
  connectDotPad: document.getElementById('connectDotPad'),
  exportMatrix: document.getElementById('exportMatrix'),
  collectButton: document.getElementById('collectButton'),
  voiceButton: document.getElementById('voiceButton'),
  resetButton: document.getElementById('resetButton'),
};

const tactileCtx = dom.tactileCanvas.getContext('2d');
const loader = new GLTFLoader();
const clock = new THREE.Clock();

let scene, camera, renderer, mixer;
let lumiRoot = null;
let swayables = [];
let waterMesh = null;
let lumiHalo = null;
let lumiLight = null;
let actions = {};
let currentAction = null;
let dotlingPrototype = null;
let lastTactileT = 0, lastWarnT = 0, lastHitT = 0, lastExitT = 0;
let audioCtx = null;
let areaGroup = null;
let riverCrossed = false;
let exposurePulse = 0;
let musicNodes = null;
let musicOn = true;
let audioUnlocked = false;
let lightMilestone = 0;
const GRAND_TOTAL = AREA_ORDER.reduce((n, id) => n + AREAS[id].items.length, 0);
let lastMatrix = [];
let dotPadConnected = false;
const dotSdk = new DotPadSDK();
const dotScanner = new DotPadScanner();
let dotDevice = null;
let speechRecognition = null;

const initialItems = [
  { id: 'dotling-1', x: -14, z: -7, collected: false },
  { id: 'dotling-2', x: -2, z: -11, collected: false },
  { id: 'dotling-3', x: 11, z: -5, collected: false },
  { id: 'dotling-4', x: 15, z: 7, collected: false },
  { id: 'dotling-5', x: -9, z: 9, collected: false },
];

const initialHazards = [
  { id: 'shadow-1', x: 6,  z: -2, vx: 2.2,  vz: 1.6 },
  { id: 'shadow-2', x: -6, z: 6,  vx: -1.8, vz: 2.1 },
  { id: 'shadow-3', x: 18, z: 4,  vx: 1.5,  vz: -2.3 },
];

const gameState = {
  player: { x: -20, z: 10, direction: 'down', animation: 'idle', yaw: 0 },
  area: 'forest_entrance',
  items: structuredClone(initialItems),
  itemMeshes: new Map(),
  forestLight: 0.1,
  lightCollected: 0,
  lightTotal: 1,
  hazards: structuredClone(initialHazards),
  hazardMeshes: new Map(),
  obstacles: [
    { x: -20, z: -7, w: 5, d: 6 },
    { x: 1, z: 4, w: 6, d: 5 },
    { x: 20, z: -11, w: 5, d: 7 },
  ],
};

init();

async function init() {
  setupThreeScene();
  setupEventListeners();
  setupSpeechRecognition();
  dotSdk.setCallBack(onDotMessage, onDotKey);
  gameState.lightTotal = GRAND_TOTAL;
  announce('루미가 숲 입구에서 기다리고 있어요. 방향키나 패닝키 구조로 이동할 수 있습니다.');

  await Promise.allSettled([
    loadLumiCharacter(),
    loadDotlingModel(),
  ]);

  loadArea('forest_entrance', { initial: true });
  animate();
}

function setupThreeScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdff3ff);
  scene.fog = new THREE.Fog(0xdff3ff, 55, 120);

  const width = dom.gameCanvas.clientWidth;
  const height = dom.gameCanvas.clientHeight;

  camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 200);
  camera.position.set(-20, 16, 32);
  camera.lookAt(-20, 3, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // GLB PBR 재질이 원본 색으로 보이도록 색공간/톤매핑 설정 (Three.js r152+ 필수)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  dom.gameCanvas.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x4d6f43, 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  sun.position.set(-18, 28, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  scene.add(sun);

  // 반대편 쿨톤 필 라이트 (그림자 부드럽게 + 입체감)
  const fill = new THREE.DirectionalLight(0xbfe0ff, 0.55);
  fill.position.set(22, 14, -18);
  scene.add(fill);

  // 빛이 찰수록 커지는 루미 후광 + 따라다니는 포인트 라이트
  const glowTex = makeGlowTexture();
  lumiHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 })
  );
  lumiHalo.rotation.x = -Math.PI / 2;
  lumiHalo.position.y = 0.06;
  scene.add(lumiHalo);

  lumiLight = new THREE.PointLight(0xffe6a0, 0.6, 20, 2);
  scene.add(lumiLight);

  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', () => window.dispatchEvent(new Event('resize')));
  document.addEventListener('webkitfullscreenchange', () => window.dispatchEvent(new Event('resize')));
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
  g.addColorStop(0.4, 'rgba(255, 220, 130, 0.35)');
  g.addColorStop(1, 'rgba(255, 220, 130, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// 식생 디테일: 풀(바람에 흔들림) · 꽃 · 덤불 · 바위. areaGroup에 담겨 구역 전환 시 함께 교체됨.
function scatterDetail() {
  const inPlayBand = (x, z) => Math.abs(z) < 6 && Math.abs(x) < 26;
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5fa24f, roughness: 1 });
  for (let i = 0; i < 80; i++) {
    const x = -33 + Math.random() * 66, z = -23 + Math.random() * 46;
    if (inPlayBand(x, z)) continue;
    const h = 0.5 + Math.random() * 0.55;
    const geo = new THREE.ConeGeometry(0.1, h, 5);
    geo.translate(0, h / 2, 0);
    const blade = new THREE.Mesh(geo, grassMat);
    blade.position.set(x, 0, z);
    areaGroup.add(blade);
    swayables.push({ mesh: blade, amp: 0.12 + Math.random() * 0.1, speed: 1 + Math.random(), phase: Math.random() * 6.28 });
  }
  const fcolors = [0xffd1e0, 0xfff2a8, 0xffffff, 0xc7b3ff];
  for (let i = 0; i < 26; i++) {
    const x = -32 + Math.random() * 64, z = -22 + Math.random() * 44;
    if (inPlayBand(x, z)) continue;
    const stemH = 0.5;
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, stemH, 5);
    stemGeo.translate(0, stemH / 2, 0);
    const flower = new THREE.Group();
    flower.add(new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4f8a46 })));
    const col = fcolors[i % fcolors.length];
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, roughness: 0.7 })
    );
    head.position.y = stemH + 0.05;
    flower.add(head);
    flower.position.set(x, 0, z);
    areaGroup.add(flower);
    swayables.push({ mesh: flower, amp: 0.1 + Math.random() * 0.08, speed: 0.8 + Math.random(), phase: Math.random() * 6.28 });
  }
  for (let i = 0; i < 7; i++) {
    const x = -30 + Math.random() * 60, z = -20 + Math.random() * 40;
    if (Math.abs(z) < 7 && Math.abs(x) < 26) continue;
    const bush = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.1 + Math.random() * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3f7a44, roughness: 0.9 })
    );
    bush.position.set(x, 0.8, z);
    bush.castShadow = true;
    areaGroup.add(bush);
  }
  for (let i = 0; i < 5; i++) {
    const x = -30 + Math.random() * 60, z = -20 + Math.random() * 40;
    if (Math.abs(z) < 7 && Math.abs(x) < 26) continue;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 1 })
    );
    rock.position.set(x, 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    areaGroup.add(rock);
  }
}

function createForestWorld() {
  if (areaGroup) { scene.remove(areaGroup); areaGroup = null; }
  swayables = [];
  waterMesh = null;
  areaGroup = new THREE.Group();

  const pal = (AREAS[gameState.area] && AREAS[gameState.area].palette) || { ground: 0x72ad65, path: 0xcdbb80, pebble: 0xe7d8a4 };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 48, 1, 1),
    new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  areaGroup.add(ground);

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 13, 1, 1),
    new THREE.MeshStandardMaterial({ color: pal.path, roughness: 0.9 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.015;
  path.receiveShadow = true;
  areaGroup.add(path);

  // soft curved path markers
  for (let i = -24; i <= 24; i += 4) {
    const pebble = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: pal.pebble, roughness: 0.9 })
    );
    pebble.position.set(i, 0.08, Math.sin(i * 0.25) * 2);
    pebble.castShadow = true;
    areaGroup.add(pebble);
  }

  gameState.obstacles.forEach((obstacle, index) => {
    createTreeCluster(obstacle.x, obstacle.z, index);
  });

  for (let i = 0; i < 14; i++) {
    const x = -32 + Math.random() * 64;
    const z = -22 + Math.random() * 44;
    if (Math.abs(z) < 8 && Math.abs(x) < 28) continue;
    createTreeCluster(x, z, i + 5, 0.7);
  }

  scatterDetail();
  if (gameState.area === 'river') buildRiverCrossing3D();

  scene.add(areaGroup);
}

function buildRiverCrossing3D() {
  const cr = AREAS.river.crossing;
  if (!cr) return;
  const w = cr.water;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w.xMax - w.xMin, w.zMax - w.zMin, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2f8fd0, transparent: true, opacity: 0.78, roughness: 0.3, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((w.xMin + w.xMax) / 2, 0.05, (w.zMin + w.zMax) / 2);
  areaGroup.add(water);
  waterMesh = water;

  cr.stones.forEach((st) => {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95 })
    );
    stone.position.set(st.x, 0.25, st.z);
    stone.castShadow = true;
    stone.receiveShadow = true;
    areaGroup.add(stone);
  });

  const echo = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.26, 12, 28),
    new THREE.MeshStandardMaterial({ color: 0x5dcaa5, emissive: 0x1d9e75, emissiveIntensity: 0.9 })
  );
  echo.position.set(cr.goal.x, 1.2, cr.goal.z);
  echo.name = 'echo-goal';
  areaGroup.add(echo);
}

// Load (or swap to) an area: rebuild world, entities, player, scene, HUD, tactile.
function loadArea(id, opts = {}) {
  const cfg = AREAS[id];
  if (!cfg) return;
  riverCrossed = false;
  gameState.area = id;
  retuneMusic();
  gameState.obstacles = structuredClone(cfg.obstacles);
  gameState.items = structuredClone(cfg.items);
  gameState.hazards = structuredClone(cfg.hazards);
  gameState.player = { x: cfg.playerStart.x, z: cfg.playerStart.z, direction: 'down', animation: 'idle', yaw: 0 };

  createForestWorld();
  placeDotlings();
  placeHazards();
  updateLumiTransform('down');
  playAction('idle');
  updateScore();
  applyScene();
  updateLightHUD();
  drawTactileFrame();
  sendDotPadFrame(lastMatrix);

  // hand the location to the narrative engine (it narrates the area + starts its mission)
  if (!opts.initial && window.DotForest && window.DotForest.narrative && window.DotForest.narrative.enterArea) {
    window.DotForest.narrative.enterArea(id);
  }
}

// Walk-to-exit zone transitions, gated by story flags.
function checkAreaExit() {
  const cfg = AREAS[gameState.area];
  if (!cfg || !cfg.exit) return;
  if (!atExit(gameState.player, cfg.exit)) return;
  if (clock.elapsedTime - lastExitT < 1.6) return;
  lastExitT = clock.elapsedTime;

  const flags = (window.DotForest && window.DotForest.narrative && window.DotForest.narrative.get)
    ? (window.DotForest.narrative.get('flags') || {}) : {};
  if (cfg.exit.needFlag && !flags[cfg.exit.needFlag]) {
    announce(cfg.exit.lockedMsg, true);
    return;
  }
  announce(`${AREAS[cfg.exit.to].name}(으)로 이동합니다.`, true);
  loadArea(cfg.exit.to);
}

function createTreeCluster(x, z, seed = 0, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 2.4 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x745432, roughness: 0.9 })
  );
  trunk.position.set(x, 1.2 * scale, z);
  trunk.castShadow = true;
  (areaGroup || scene).add(trunk);

  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry((2.1 + (seed % 3) * 0.22) * scale),
    new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x3f7f45 : 0x4f9652, roughness: 0.85 })
  );
  crown.position.set(x, 3.25 * scale, z);
  crown.castShadow = true;
  (areaGroup || scene).add(crown);
}

async function loadLumiCharacter() {
  const walkGltf = await loader.loadAsync('./models/lumi_walk.glb');
  lumiRoot = walkGltf.scene;
  lumiRoot.name = 'Lumi';
  lumiRoot.scale.setScalar(6.0);
  lumiRoot.position.set(gameState.player.x, 0, gameState.player.z);
  lumiRoot.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      // 텍스처가 있으면 sRGB 색공간 적용 (색 바램 방지)
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          m.needsUpdate = true;
        });
      }
    }
  });
  scene.add(lumiRoot);

  mixer = new THREE.AnimationMixer(lumiRoot);

  if (walkGltf.animations?.length) {
    actions.walk = mixer.clipAction(walkGltf.animations[0]);
  }

  // walk.glb 하나만 사용 — run/collect도 walk 애니메이션 재사용 (경량화)
  if (walkGltf.animations?.length) {
    actions.run = mixer.clipAction(walkGltf.animations[0]);
    actions.collect = mixer.clipAction(walkGltf.animations[0]);
  }

  actions.idle = null;
  playAction('idle');
}

async function loadDotlingModel() {
  // dotring.glb 미사용 — 황금 구체 프리미티브로 대체 (경량화)
  dotlingPrototype = null;
}

function placeDotlings() {
  gameState.itemMeshes.forEach((mesh) => scene.remove(mesh));
  gameState.itemMeshes.clear();

  gameState.items.forEach((item) => {
    let mesh;
    if (dotlingPrototype) {
      mesh = dotlingPrototype.clone(true);
      mesh.scale.setScalar(0.55);
    } else {
      mesh = createDotring();
    }
    mesh.position.set(item.x, 1.2, item.z);
    mesh.name = item.id;
    scene.add(mesh);
    gameState.itemMeshes.set(item.id, mesh);
  });
}

function createDotring() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.26, 12, 28),
    new THREE.MeshStandardMaterial({ color: 0xf5b84b, emissive: 0xf3a712, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.05, 5, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beacon.position.y = 2.4;
  g.add(halo); g.add(ring); g.add(beacon);
  return g;
}

function placeHazards() {
  gameState.hazardMeshes.forEach((m) => scene.remove(m));
  gameState.hazardMeshes.clear();
  gameState.hazards.forEach((h) => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x140f1c, roughness: 1, metalness: 0, emissive: 0x1a1030, emissiveIntensity: 0.4 })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x2a1f3a, transparent: true, opacity: 0.28, depthWrite: false })
    );
    group.add(halo); group.add(core);
    group.position.set(h.x, 1.0, h.z);
    group.name = h.id;
    scene.add(group);
    gameState.hazardMeshes.set(h.id, group);
  });
}

function applyScene() {
  if (!scene || !renderer) return;
  const sc = lightToScene(gameState.forestLight);
  if (scene.background && scene.background.setHex) scene.background.setHex(sc.bg);
  else scene.background = new THREE.Color(sc.bg);
  if (scene.fog) { scene.fog.color.setHex(sc.bg); scene.fog.near = sc.fogNear; scene.fog.far = sc.fogFar; }
  renderer.toneMappingExposure = sc.exposure;
}

function updateLightHUD() {
  const fill = document.getElementById('lightFill');
  if (fill) fill.style.width = Math.round(gameState.forestLight * 100) + '%';
  const meter = document.getElementById('forestLightMeter');
  if (meter) meter.setAttribute('aria-valuenow', Math.round(gameState.forestLight * 100));
}

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); }
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  ensureAudio();
  if (musicOn) startMusic();
}

function blip(freq, when, dur, vol, type, pan) {
  const ctx = audioCtx; if (!ctx) return;
  const t = ctx.currentTime + (when || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  osc.type = type || 'triangle';
  osc.frequency.value = freq;
  panner.pan.value = pan || 0;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain); gain.connect(panner); panner.connect(ctx.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function playCollect() {
  if (!ensureAudio()) return;
  // 밝게 상승하는 3음 차임 (수집의 쾌감)
  [659.25, 783.99, 1046.5].forEach((f, i) => blip(f, i * 0.06, 0.18, 0.16, 'triangle', 0));
}

function playMilestone() {
  if (!ensureAudio()) return;
  // 더 화사한 축하 아르페지오
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => blip(f, i * 0.08, 0.34, 0.14, 'triangle', 0));
}

const AREA_ROOT = { forest_entrance: 130.81, berry_grove: 146.83, river: 110.0 };
function startMusic() {
  const ctx = ensureAudio(); if (!ctx || musicNodes) return;
  const root = AREA_ROOT[gameState.area] || 130.81;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 900;
  master.connect(filter); filter.connect(ctx.destination);
  // 따뜻한 패드 화음 (루트·5도·옥타브) + 느린 흔들림
  const ratios = [1, 1.5, 2, 2.997];
  const oscs = ratios.map((r, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = root * r;
    o.detune.value = (i - 1.5) * 4;
    const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.22;
    o.connect(g); g.connect(master); o.start();
    return o;
  });
  const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12; lfoGain.gain.value = 0.018;
  lfo.connect(lfoGain); lfoGain.connect(master.gain); lfo.start();
  musicNodes = { master, oscs, lfo };
}
function stopMusic() {
  if (!musicNodes || !audioCtx) return;
  try {
    musicNodes.master.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
    const n = musicNodes; musicNodes = null;
    setTimeout(() => { try { n.oscs.forEach((o) => o.stop()); n.lfo.stop(); } catch (e) {} }, 700);
  } catch (e) {}
}
function retuneMusic() {
  if (!musicNodes) return;
  const root = AREA_ROOT[gameState.area] || 130.81;
  const ratios = [1, 1.5, 2, 2.997];
  musicNodes.oscs.forEach((o, i) => { o.frequency.setTargetAtTime(root * ratios[i], audioCtx.currentTime, 0.4); });
}

function bumpHud() {
  ['forestLightMeter', 'lightFill'].forEach((id) => {
    const el = document.getElementById(id); if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  });
  const sc = document.querySelector('#screen-game .score');
  if (sc) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
}

function checkMilestone() {
  const marks = [0.4, 0.7, 1.0];
  const lines = ['빛이 깨어나기 시작했어요.', '빛이 절반 넘게 돌아왔어요!', '흩어진 빛이 모두 제자리로 돌아왔어요. 숲이 환하게 깨어납니다!'];
  while (lightMilestone < marks.length && gameState.forestLight >= marks[lightMilestone] - 0.001) {
    playMilestone();
    exposurePulse = 0.55;
    announce(lines[lightMilestone], true);
    lightMilestone += 1;
  }
}

function playWarn(pan, intensity) {
  if (clock.elapsedTime - lastWarnT < 0.28) return;
  lastWarnT = clock.elapsedTime;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    osc.type = 'triangle';
    osc.frequency.value = 340 + intensity * 220;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const vol = Math.min(0.18, 0.05 + intensity * 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.24);
  } catch (e) {}
}

function playWater(pan) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.36);
  } catch (e) {}
}

function onHazardHit() {
  if (clock.elapsedTime - lastHitT < 1.4) return;
  lastHitT = clock.elapsedTime;
  gameState.forestLight = applyHit(gameState.forestLight);
  applyScene();
  updateLightHUD();
  announce('그림자가 스쳐 지나갔어요. 숲의 빛이 잠시 흐려집니다.', true);
}

function setupEventListeners() {
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const map = {
      arrowup: 'up', w: 'up',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left',
      arrowright: 'right', d: 'right',
    };
    if (map[key]) {
      event.preventDefault();
      handlePanningKeyInput(map[key]);
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      collectNearbyDotling();
    }
  });

  document.querySelectorAll('[data-move]').forEach((button) => {
    button.addEventListener('click', () => handlePanningKeyInput(button.dataset.move));
  });

  dom.collectButton.addEventListener('click', collectNearbyDotling);
  dom.resetButton.addEventListener('click', resetGame);
  dom.connectDotPad.addEventListener('click', connectDotPad);
  dom.exportMatrix.addEventListener('click', () => {
    console.table(lastMatrix);
    announce('현재 60×40 매트릭스를 브라우저 콘솔에 출력했습니다.');
  });
  dom.voiceButton.addEventListener('click', startVoiceCommand);

  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);

  // 오디오는 사용자 제스처 이후에만 시작할 수 있음 (브라우저 정책)
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: false }));

  const musicToggle = document.getElementById('musicToggle');
  if (musicToggle) {
    musicToggle.checked = musicOn;
    musicToggle.addEventListener('change', () => {
      musicOn = musicToggle.checked;
      if (musicOn) { ensureAudio(); startMusic(); } else { stopMusic(); }
    });
  }
}

function handlePanningKeyInput(direction) {
  // 실제 DotPad 패닝키 이벤트가 들어오면 이 함수에 direction만 넘기면 됩니다.
  movePlayer(direction);
}

function movePlayer(direction) {
  const next = { x: gameState.player.x, z: gameState.player.z };
  if (direction === 'up') next.z -= MOVE_STEP;
  if (direction === 'down') next.z += MOVE_STEP;
  if (direction === 'left') next.x -= MOVE_STEP;
  if (direction === 'right') next.x += MOVE_STEP;

  next.x = THREE.MathUtils.clamp(next.x, -WORLD_LIMIT_X, WORLD_LIMIT_X);
  next.z = THREE.MathUtils.clamp(next.z, -WORLD_LIMIT_Z, WORLD_LIMIT_Z);

  if (isBlocked(next.x, next.z)) {
    playAction('idle');
    announce('앞에 나무 장애물이 있어요. 다른 방향으로 이동해 주세요.', true);
    return;
  }

  if (gameState.area === 'river') {
    const cr = AREAS.river.crossing;
    if (cr && riverStep(next, cr).deep) {
      playAction('idle');
      const pan = direction === 'left' ? -0.7 : direction === 'right' ? 0.7 : 0;
      playWater(pan);
      announce('그쪽은 물이 노래해요. 깊은 물입니다. 침묵하는 안전한 돌을 디뎌요.');
      return;
    }
  }

  gameState.player.x = next.x;
  gameState.player.z = next.z;
  gameState.player.direction = direction;
  gameState.player.animation = 'walk';

  updateLumiTransform(direction);
  playAction('walk');
  announce(`루미가 ${directionToKorean(direction)} 이동했습니다.`);

  if (gameState.area === 'river' && !riverCrossed) {
    const cr = AREAS.river.crossing;
    if (cr && atGoal(gameState.player, cr.goal)) {
      riverCrossed = true;
      if (window.DotForest && window.DotForest.narrative && window.DotForest.narrative.crossRiverComplete) {
        window.DotForest.narrative.crossRiverComplete();
      }
    }
  }
  checkNearbyHint();
  drawTactileFrame();
  sendDotPadFrame(lastMatrix);

  clearTimeout(movePlayer.idleTimer);
  movePlayer.idleTimer = setTimeout(() => playAction('idle'), 450);
}

function isBlocked(x, z) {
  return gameState.obstacles.some((obstacle) => {
    const halfW = obstacle.w / 2 + 0.8;
    const halfD = obstacle.d / 2 + 0.8;
    return x > obstacle.x - halfW && x < obstacle.x + halfW && z > obstacle.z - halfD && z < obstacle.z + halfD;
  });
}

function updateLumiTransform(direction) {
  if (!lumiRoot) return;
  lumiRoot.position.set(gameState.player.x, 0, gameState.player.z);

  const rotations = {
    up: Math.PI,
    down: 0,
    left: -Math.PI / 2,
    right: Math.PI / 2,
  };
  const targetYaw = rotations[direction] ?? 0;
  lumiRoot.rotation.y = targetYaw;
  gameState.player.yaw = targetYaw;  // 카메라 추적용
}

function playAction(name) {
  if (!mixer) return;
  if (name === 'idle') {
    if (currentAction) currentAction.fadeOut(0.2);
    currentAction = null;
    return;
  }

  const nextAction = actions[name] || actions.walk || actions.run;
  if (!nextAction || nextAction === currentAction) return;

  if (currentAction) currentAction.fadeOut(0.15);
  nextAction.reset().fadeIn(0.15).play();
  currentAction = nextAction;
}

function collectNearbyDotling() {
  const target = gameState.items.find((item) => !item.collected && distance2D(item, gameState.player) <= ITEM_COLLECT_DISTANCE);
  if (!target) {
    announce('가까운 곳에 먹을 수 있는 도트링이 없어요. 조금 더 다가가 보세요.', true);
    return;
  }

  target.collected = true;
  const mesh = gameState.itemMeshes.get(target.id);
  if (mesh) mesh.visible = false;

  playAction('collect');
  announce('빛 한 조각이 손끝으로 돌아왔어요. 숲이 조금 더 밝아집니다.', true);
  updateScore();
  gameState.lightCollected += 1;
  gameState.forestLight = 0.1 + 0.9 * Math.min(1, gameState.lightCollected / gameState.lightTotal);
  applyScene();
  updateLightHUD();
  playCollect();
  exposurePulse = 0.35;
  bumpHud();
  checkMilestone();
  drawTactileFrame();
  sendDotPadFrame(lastMatrix);

  if (gameState.items.every((item) => item.collected)) {
    announce('흩어진 빛을 모두 모았어요. 숲이 다시 환하게 깨어납니다!', true);
  }
}

function checkNearbyHint() {
  // 도트링 근접 안내
  const nearItem = gameState.items.find((item) => !item.collected && distance2D(item, gameState.player) <= 4);
  if (nearItem) {
    announce('도트링이 가까이에 있어요. 먹기 버튼을 눌러보세요.');
  }
  // 나무 장애물 근접 안내 (반경 6 이내)
  const nearObstacle = gameState.obstacles.find((obs) => distance2D(obs, gameState.player) <= 6);
  if (nearObstacle) {
    announce('나무가 가까이 있어요. Dot Pad에서 느껴보세요.');
  }
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function updateScore() {
  const collected = gameState.items.filter((item) => item.collected).length;
  dom.scoreText.textContent = `${collected} / ${gameState.items.length}`;
}

function createDotPadMatrix() {
  const matrix = Array.from({ length: DOT_HEIGHT }, () => Array(DOT_WIDTH).fill(0));

  // 1. 근접 장애물(나무) — 플레이어 반경 6 이내만 표시
  drawNearbyObstacles(matrix, 6);

  // 2. 강가: 물결(물) + 꽉 찬 블록(안전한 돌) 패턴
  if (gameState.area === 'river') drawRiverCrossing(matrix);

  // 3. 도트링(수집물, 다이아몬드 패턴) + 떠다니는 그림자(위험물, X 패턴)
  drawItems(matrix);
  drawNearbyHazards(matrix, 7);

  // 3. 캐릭터(루미) 워킹 실루엣 — 항상 위에 덮어씀
  drawPlayerFull(matrix);

  return matrix;
}

function drawNearbyObstacles(matrix, radius) {
  const px = gameState.player.x;
  const pz = gameState.player.z;

  gameState.obstacles.forEach((obstacle) => {
    const dist = Math.hypot(obstacle.x - px, obstacle.z - pz);
    if (dist > radius) return; // 멀면 스킵

    // 가까울수록 더 진하게 — dist에 따라 테두리만 or 채움
    const filled = dist <= 3;
    const min = worldToDot(obstacle.x - obstacle.w / 2, obstacle.z - obstacle.d / 2);
    const max = worldToDot(obstacle.x + obstacle.w / 2, obstacle.z + obstacle.d / 2);
    const x0 = Math.min(min.x, max.x);
    const x1 = Math.max(min.x, max.x);
    const y0 = Math.min(min.y, max.y);
    const y1 = Math.max(min.y, max.y);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // 채움(매우 근접): 전체 / 테두리(근접): 외곽만
        if (filled || x === x0 || x === x1 || y === y0 || y === y1) {
          setDot(matrix, x, y, 1);
        }
      }
    }
  });
}

function drawRiverCrossing(matrix) {
  const cr = AREAS.river.crossing;
  if (!cr) return;
  const a = worldToDot(cr.water.xMin, cr.water.zMin);
  const b = worldToDot(cr.water.xMax, cr.water.zMax);
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + y) % 2 === 0) setDot(matrix, x, y, 1); // 물결(깊은 물)
    }
  }
  cr.stones.forEach((st) => {
    const p = worldToDot(st.x, st.z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) setDot(matrix, p.x + dx, p.y + dy, 1); // 꽉 찬 안전한 돌
    }
  });
  const g = worldToDot(cr.goal.x, cr.goal.z);
  setDot(matrix, g.x, g.y, 1);
}

function drawNearbyHazards(matrix, radius) {
  const px = gameState.player.x, pz = gameState.player.z;
  gameState.hazards.forEach((h) => {
    if (Math.hypot(h.x - px, h.z - pz) > radius) return;
    const p = worldToDot(h.x, h.z);
    // X 패턴 — 다이아몬드(도트링)와 촉각적으로 구분되게
    const shape = [
      [1, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
    ];
    drawShape(matrix, shape, p.x - 1, p.y - 1);
  });
}

function worldToDot(x, z) {
  const dotX = Math.round(THREE.MathUtils.mapLinear(x, -WORLD_LIMIT_X, WORLD_LIMIT_X, 2, DOT_WIDTH - 3));
  const dotY = Math.round(THREE.MathUtils.mapLinear(z, -WORLD_LIMIT_Z, WORLD_LIMIT_Z, 2, DOT_HEIGHT - 3));
  return { x: dotX, y: dotY };
}

function setDot(matrix, x, y, value = 1) {
  if (y >= 0 && y < DOT_HEIGHT && x >= 0 && x < DOT_WIDTH) matrix[y][x] = value;
}

function drawPath(matrix) {
  const centerY = Math.floor(DOT_HEIGHT / 2);
  for (let x = 2; x < DOT_WIDTH - 2; x++) {
    const offset = Math.round(Math.sin(x * 0.21) * 2);
    for (let y = centerY - 3 + offset; y <= centerY + 3 + offset; y++) {
      if ((x + y) % 2 === 0) setDot(matrix, x, y, 1);
    }
  }
}

function drawObstacles(matrix) {
  gameState.obstacles.forEach((obstacle) => {
    const min = worldToDot(obstacle.x - obstacle.w / 2, obstacle.z - obstacle.d / 2);
    const max = worldToDot(obstacle.x + obstacle.w / 2, obstacle.z + obstacle.d / 2);
    for (let y = Math.min(min.y, max.y); y <= Math.max(min.y, max.y); y++) {
      for (let x = Math.min(min.x, max.x); x <= Math.max(min.x, max.x); x++) {
        setDot(matrix, x, y, 1);
      }
    }
  });
}

function drawItems(matrix) {
  gameState.items.filter((item) => !item.collected).forEach((item) => {
    const p = worldToDot(item.x, item.z);
    const shape = [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ];
    drawShape(matrix, shape, p.x - 1, p.y - 1);
  });
}

function drawPlayer(matrix) {
  drawPlayerFull(matrix);
}

function drawPlayerFull(matrix) {
  const p = worldToDot(gameState.player.x, gameState.player.z);
  const dir = gameState.player.direction || 'down';

  // 방향별 캐릭터 실루엣 (머리·몸통·팔·다리)
  const shapes = {
    down: [
      [0,1,1,1,0],  // 머리
      [1,1,1,1,1],  // 어깨
      [0,1,1,1,0],  // 몸통
      [1,0,1,0,1],  // 허리
      [0,1,0,1,0],  // 다리
      [1,0,0,0,1],  // 발
    ],
    up: [
      [1,0,0,0,1],  // 발
      [0,1,0,1,0],  // 다리
      [1,0,1,0,1],  // 허리
      [0,1,1,1,0],  // 몸통
      [1,1,1,1,1],  // 어깨
      [0,1,1,1,0],  // 머리
    ],
    left: [
      [0,0,1,1,0],
      [0,1,1,1,1],
      [1,1,1,1,0],
      [0,1,1,1,1],
      [0,0,1,1,0],
      [0,0,0,1,0],
    ],
    right: [
      [0,1,1,0,0],
      [1,1,1,1,0],
      [0,1,1,1,1],
      [1,1,1,1,0],
      [0,1,1,0,0],
      [0,1,0,0,0],
    ],
  };

  const shape = shapes[dir] || shapes.down;
  drawShape(matrix, shape, p.x - 2, p.y - 3);

  // 이동 중일 때 방향 화살표 (앞쪽에 1~2개 점)
  if (gameState.player.animation === 'walk') {
    const arrows = {
      down:  [{dx:0,dy:4},{dx:0,dy:5}],
      up:    [{dx:0,dy:-4},{dx:0,dy:-5}],
      left:  [{dx:-4,dy:0},{dx:-5,dy:0}],
      right: [{dx:4,dy:0},{dx:5,dy:0}],
    };
    (arrows[dir]||[]).forEach(({dx,dy}) => setDot(matrix, p.x+dx, p.y+dy, 1));
  }
}

function drawShape(matrix, shape, originX, originY) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) setDot(matrix, originX + x, originY + y, 1);
    }
  }
}

function drawTactileFrame() {
  lastMatrix = createDotPadMatrix();
  const cellW = dom.tactileCanvas.width / DOT_WIDTH;
  const cellH = dom.tactileCanvas.height / DOT_HEIGHT;

  tactileCtx.fillStyle = '#162217';
  tactileCtx.fillRect(0, 0, dom.tactileCanvas.width, dom.tactileCanvas.height);

  for (let y = 0; y < DOT_HEIGHT; y++) {
    for (let x = 0; x < DOT_WIDTH; x++) {
      if (lastMatrix[y][x]) {
        tactileCtx.fillStyle = '#e8f2d7';
        tactileCtx.beginPath();
        tactileCtx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, Math.min(cellW, cellH) * 0.33, 0, Math.PI * 2);
        tactileCtx.fill();
      }
    }
  }

  drawTactileGrid(cellW, cellH);
}

function drawTactileGrid(cellW, cellH) {
  tactileCtx.strokeStyle = 'rgba(255,255,255,0.055)';
  tactileCtx.lineWidth = 1;
  for (let x = 0; x <= DOT_WIDTH; x += 5) {
    tactileCtx.beginPath();
    tactileCtx.moveTo(x * cellW, 0);
    tactileCtx.lineTo(x * cellW, dom.tactileCanvas.height);
    tactileCtx.stroke();
  }
  for (let y = 0; y <= DOT_HEIGHT; y += 5) {
    tactileCtx.beginPath();
    tactileCtx.moveTo(0, y * cellH);
    tactileCtx.lineTo(dom.tactileCanvas.width, y * cellH);
    tactileCtx.stroke();
  }
}

function toggleFullscreen() {
  const el = document.querySelector('#screen-game .stage--game') || document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  } catch (e) { console.error('[fullscreen]', e); }
}

function setDotPadState(text, connected) {
  dom.dotpadState.textContent = text;
  dom.dotpadState.classList.toggle('connected', !!connected);
}

/* 60×40 픽셀 매트릭스 → DotPad 그래픽 셀 hex.
   셀 = 2×4핀 = 1바이트, 셀 행우선 30×10 = 300바이트 = 600hex. DisplayMode.GraphicMode로 전송.
   실기기에서 '한 셀 안의 핀'이 뒤섞여 보이면 아래 DOTPAD_BIT_ORDER 한 곳만 조정하면 됩니다
   (현재 표준 8점 점자 순서). 셀의 '위치'는 이 순서와 무관하게 항상 맞습니다. */
const DOTPAD_BIT_ORDER = [
  { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 0 },
  { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 3 }, { dx: 1, dy: 3 },
];
function matrixToDotPadHex(matrix) {
  const cols = DOT_WIDTH / 2, rows = DOT_HEIGHT / 4;
  let hex = '';
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const { dx, dy } = DOTPAD_BIT_ORDER[bit];
        const row = matrix[cy * 4 + dy];
        if (row && row[cx * 2 + dx]) byte |= (1 << bit);
      }
      hex += byte.toString(16).padStart(2, '0');
    }
  }
  return hex.toUpperCase();
}

function onDotMessage(device, code) {
  if (code === DataCodes.Connected) {
    dotDevice = device;
    dotPadConnected = true;
    setDotPadState('DotPad 연결됨', true);
    announce('DotPad에 연결됐어요. 게임 화면이 촉각으로 전송됩니다.', true);
    sendDotPadFrame(lastMatrix);
  } else if (code === DataCodes.Disconnected) {
    dotPadConnected = false;
    dotDevice = null;
    setDotPadState('DotPad 미연결', false);
    announce('DotPad 연결이 해제됐어요.');
  }
}

// 기기 물리 키 → 게임 동작 (패닝키 = 좌·우 이동, F1~F4 = 정보 듣기 — 웹의 1·2·3·4와 동일)
function onDotKey(device, key) {
  switch (key) {
    case KeyCodes.PanningLeft: handlePanningKeyInput('left'); break;
    case KeyCodes.PanningRight: handlePanningKeyInput('right'); break;
    case KeyCodes.KeyFunction1: window.DotForest && window.DotForest.narrative && window.DotForest.narrative.infoAction('position'); break;
    case KeyCodes.KeyFunction2: window.DotForest && window.DotForest.narrative && window.DotForest.narrative.infoAction('surroundings'); break;
    case KeyCodes.KeyFunction3: window.DotForest && window.DotForest.narrative && window.DotForest.narrative.infoAction('mission'); break;
    case KeyCodes.KeyFunction4: window.DotForest && window.DotForest.narrative && window.DotForest.narrative.infoAction('tactileMap'); break;
    // TODO: 상/하 이동·수집 키는 기기 키 구성에 맞춰 매핑 추가 (예: LPF1 / RPF4)
    default: break;
  }
}

async function connectDotPad() {
  if (dotPadConnected) { disconnectDotPad(); return; }
  if (!navigator.bluetooth) {
    announce('이 브라우저는 Web Bluetooth를 지원하지 않아요. Chrome 또는 Edge(데스크톱·안드로이드)에서 열어 주세요. iOS Safari·Firefox는 지원하지 않습니다.', true);
    return;
  }
  try {
    setDotPadState('DotPad 검색 중…', false);
    const device = await dotScanner.startBleScan(); // 기기 선택창 (namePrefix "DotPad")
    if (!device) {
      setDotPadState('DotPad 미연결', false);
      announce('연결할 기기를 고르지 않았어요. 다시 시도해 주세요.');
      return;
    }
    setDotPadState('DotPad 연결 중…', false);
    const dev = await dotSdk.connectBleDevice(device); // 연결 완료는 onDotMessage(Connected)로 전달됨
    if (!dev) {
      setDotPadState('DotPad 미연결', false);
      announce('DotPad 연결에 실패했어요. 기기 전원과 블루투스를 확인해 주세요.', true);
    }
  } catch (err) {
    setDotPadState('DotPad 미연결', false);
    announce('연결 중 문제가 생겼어요. 다시 시도해 주세요.', true);
    console.error('[DotPad] connect failed:', err);
  }
}

function disconnectDotPad() {
  try { dotSdk.disconnect(dotDevice || null); } catch (e) { console.error('[DotPad] disconnect:', e); }
  dotPadConnected = false;
  dotDevice = null;
  setDotPadState('DotPad 미연결', false);
}

function sendDotPadFrame(matrix) {
  if (!dotPadConnected || !dotDevice) return;
  try {
    dotSdk.displayGraphicData(matrixToDotPadHex(matrix), dotDevice, DisplayMode.GraphicMode);
  } catch (e) {
    console.error('[DotPad] display failed:', e);
  }
}

function matrixToPackedBytes(matrix) {
  // 60×40 = 2400 bits = 300 bytes. 8핀을 1바이트로 pack합니다.
  const bits = matrix.flat();
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    if (bit) bytes[Math.floor(index / 8)] |= (1 << (7 - (index % 8)));
  });
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    dom.voiceButton.disabled = true;
    dom.voiceButton.textContent = '음성 미지원';
    return;
  }

  speechRecognition = new Recognition();
  speechRecognition.lang = 'ko-KR';
  speechRecognition.interimResults = false;
  speechRecognition.continuous = false;

  speechRecognition.addEventListener('result', (event) => {
    const text = event.results[0][0].transcript.trim();
    handleVoiceCommand(text);
  });
  speechRecognition.addEventListener('end', () => dom.voiceButton.classList.remove('listening'));
}

function startVoiceCommand() {
  if (!speechRecognition) {
    announce('이 브라우저에서는 음성 명령을 지원하지 않습니다.', true);
    return;
  }
  dom.voiceButton.classList.add('listening');
  announce('음성 명령을 듣고 있습니다. 앞으로, 뒤로, 왼쪽, 오른쪽, 먹기 중 하나를 말해 주세요.');
  speechRecognition.start();
}

function handleVoiceCommand(text) {
  const normalized = text.replaceAll(' ', '');
  if (normalized.includes('앞')) return handlePanningKeyInput('up');
  if (normalized.includes('뒤')) return handlePanningKeyInput('down');
  if (normalized.includes('왼')) return handlePanningKeyInput('left');
  if (normalized.includes('오른')) return handlePanningKeyInput('right');
  if (normalized.includes('먹') || normalized.includes('수집')) return collectNearbyDotling();
  announce(`인식한 명령은 ${text}입니다. 지원하는 명령이 아니에요.`, true);
}

function resetGame() {
  gameState.lightCollected = 0;
  gameState.forestLight = 0.1;
  lightMilestone = 0;
  loadArea('forest_entrance', { initial: true });
  if (window.DotForest && window.DotForest.narrative && window.DotForest.narrative.reset) {
    window.DotForest.narrative.reset();
  }
  announce('게임을 다시 시작했습니다. 루미가 숲 입구로 돌아왔어요.', true);
}

function announce(message, speak = false) {
  dom.liveStatus.textContent = message;
  if (speak && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }
}

function directionToKorean(direction) {
  return ({ up: '앞으로', down: '뒤로', left: '왼쪽으로', right: '오른쪽으로' })[direction] || '이동';
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (swayables.length) {
    const t = clock.elapsedTime;
    for (const sw of swayables) sw.mesh.rotation.z = Math.sin(t * sw.speed + sw.phase) * sw.amp;
  }
  if (waterMesh) {
    waterMesh.material.opacity = 0.72 + Math.sin(clock.elapsedTime * 1.4) * 0.08;
    waterMesh.position.y = 0.05 + Math.sin(clock.elapsedTime * 0.9) * 0.015;
  }

  gameState.itemMeshes.forEach((mesh, id) => {
    const item = gameState.items.find((entry) => entry.id === id);
    if (item?.collected) return;
    mesh.rotation.y += delta * 1.4;
    mesh.position.y = 1.2 + Math.sin(clock.elapsedTime * 2.2 + item.x) * 0.18;
  });

  // ── 떠다니는 그림자(위험물): 이동 + 근접 경고/충돌 ──
  let topThreat = null;
  gameState.hazards.forEach((h) => {
    wanderStep(h, delta, WORLD_LIMIT_X, WORLD_LIMIT_Z);
    const m = gameState.hazardMeshes.get(h.id);
    if (m) m.position.set(h.x, 1.0 + Math.sin(clock.elapsedTime * 1.6 + h.x) * 0.2, h.z);
    const t = threat(gameState.player, h);
    if (t.level !== 'clear' && (!topThreat || t.intensity > topThreat.intensity)) topThreat = t;
  });
  if (topThreat) {
    if (topThreat.level === 'hit') onHazardHit();
    else playWarn(topThreat.pan, topThreat.intensity);
  }

  checkAreaExit();

  if (exposurePulse > 0 && renderer) {
    const base = lightToScene(gameState.forestLight).exposure;
    renderer.toneMappingExposure = base + exposurePulse;
    exposurePulse = Math.max(0, exposurePulse - delta * 1.3);
    if (exposurePulse === 0) renderer.toneMappingExposure = base;
  }
  // 위험물/도트링이 움직이므로 촉각 프리뷰를 주기적으로 갱신 (약 8fps)
  if (clock.elapsedTime - lastTactileT > 0.12) {
    lastTactileT = clock.elapsedTime;
    drawTactileFrame();
  }

  if (lumiRoot) {
    // ── 3인칭 추적 카메라: 캐릭터 뒤에서 따라오며 방향 전환 시 회전 ──
    const px = gameState.player.x;
    const pz = gameState.player.z;
    const yaw = gameState.player.yaw;
    const camDist = 22;   // 캐릭터 뒤 거리
    const camHeight = 16; // 카메라 높이

    // 캐릭터가 바라보는 방향의 '뒤쪽'에 카메라 목표 위치 계산
    const targetX = px + Math.sin(yaw) * camDist;
    const targetZ = pz + Math.cos(yaw) * camDist;

    // 부드러운 추적 (lerp)
    const lerp = 0.06;
    camera.position.x += (targetX - camera.position.x) * lerp;
    camera.position.z += (targetZ - camera.position.z) * lerp;
    camera.position.y += (camHeight - camera.position.y) * lerp;

    // 캐릭터를 바라봄 (머리 높이)
    camera.lookAt(px, 3, pz);

    const lf = gameState.forestLight;
    if (lumiHalo) {
      lumiHalo.position.set(px, 0.06, pz);
      const sc = 0.8 + lf * 0.9;
      lumiHalo.scale.set(sc, sc, sc);
      lumiHalo.material.opacity = 0.22 + lf * 0.5;
    }
    if (lumiLight) {
      lumiLight.position.set(px, 3.2, pz);
      lumiLight.intensity = 0.4 + lf * 2.0;
    }
  }

  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = dom.gameCanvas.clientWidth;
  const height = dom.gameCanvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  drawTactileFrame();
}

// 외부 SDK/하드웨어 이벤트 연결 예시:
// window.handleDotPadPanningKey = handlePanningKeyInput;

/* ===== Narrative bridge (append-only — does not modify game logic) =====
   Exposes read access to game state plus the existing action functions so the
   narrative engine (narrative-engine.js) can observe and drive the game without
   touching any of the logic above. */
window.DotForest = window.DotForest || {};
window.DotForest.bridge = {
  get state() { return gameState; },
  get area() { return gameState.area; },
  isDeepWater: (x, z) => {
    if (gameState.area !== 'river') return false;
    const cr = AREAS.river.crossing;
    return cr ? riverStep({ x, z }, cr).deep : false;
  },
  move: (dir) => movePlayer(dir),
  collect: () => collectNearbyDotling(),
  reset: () => resetGame(),
  announce: (msg, speak = false) => announce(msg, speak),
  constants: { WORLD_LIMIT_X, WORLD_LIMIT_Z, MOVE_STEP, ITEM_COLLECT_DISTANCE },
};
