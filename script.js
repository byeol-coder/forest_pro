import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
let actions = {};
let currentAction = null;
let dotlingPrototype = null;
let lastMatrix = [];
let dotPadConnected = false;
let speechRecognition = null;

const initialItems = [
  { id: 'dotling-1', x: -14, z: -7, collected: false },
  { id: 'dotling-2', x: -2, z: -11, collected: false },
  { id: 'dotling-3', x: 11, z: -5, collected: false },
  { id: 'dotling-4', x: 15, z: 7, collected: false },
  { id: 'dotling-5', x: -9, z: 9, collected: false },
];

const gameState = {
  player: { x: -20, z: 10, direction: 'down', animation: 'idle', yaw: 0 },
  items: structuredClone(initialItems),
  itemMeshes: new Map(),
  obstacles: [
    { x: -20, z: -7, w: 5, d: 6 },
    { x: 1, z: 4, w: 6, d: 5 },
    { x: 20, z: -11, w: 5, d: 7 },
  ],
};

init();

async function init() {
  setupThreeScene();
  createForestWorld();
  setupEventListeners();
  setupSpeechRecognition();
  drawTactileFrame();
  announce('루미가 숲 입구에서 기다리고 있어요. 방향키나 패닝키 구조로 이동할 수 있습니다.');

  await Promise.allSettled([
    loadLumiCharacter(),
    loadDotlingModel(),
  ]);

  placeDotlings();
  updateScore();
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

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-18, 28, 18);
  sun.castShadow = true;
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  scene.add(sun);

  window.addEventListener('resize', onResize);
}

function createForestWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 48, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x72ad65, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 13, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xcdbb80, roughness: 0.9 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.015;
  path.receiveShadow = true;
  scene.add(path);

  // soft curved path markers
  for (let i = -24; i <= 24; i += 4) {
    const pebble = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xe7d8a4, roughness: 0.9 })
    );
    pebble.position.set(i, 0.08, Math.sin(i * 0.25) * 2);
    pebble.castShadow = true;
    scene.add(pebble);
  }

  gameState.obstacles.forEach((obstacle, index) => {
    createTreeCluster(obstacle.x, obstacle.z, index);
  });

  for (let i = 0; i < 18; i++) {
    const x = -32 + Math.random() * 64;
    const z = -22 + Math.random() * 44;
    if (Math.abs(z) < 8 && Math.abs(x) < 28) continue;
    createTreeCluster(x, z, i + 5, 0.7);
  }
}

function createTreeCluster(x, z, seed = 0, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 2.4 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x745432, roughness: 0.9 })
  );
  trunk.position.set(x, 1.2 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry((2.1 + (seed % 3) * 0.22) * scale),
    new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x3f7f45 : 0x4f9652, roughness: 0.85 })
  );
  crown.position.set(x, 3.25 * scale, z);
  crown.castShadow = true;
  scene.add(crown);
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
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xf5b84b, emissive: 0x5a3200, emissiveIntensity: 0.15 })
      );
    }
    mesh.position.set(item.x, 0.45, item.z);
    mesh.name = item.id;
    scene.add(mesh);
    gameState.itemMeshes.set(item.id, mesh);
  });
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

  gameState.player.x = next.x;
  gameState.player.z = next.z;
  gameState.player.direction = direction;
  gameState.player.animation = 'walk';

  updateLumiTransform(direction);
  playAction('walk');
  announce(`루미가 ${directionToKorean(direction)} 이동했습니다.`);
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
  announce('도트링을 획득했습니다! 촉각 프리뷰에서 해당 점형이 사라졌습니다.', true);
  updateScore();
  drawTactileFrame();
  sendDotPadFrame(lastMatrix);

  if (gameState.items.every((item) => item.collected)) {
    announce('모든 도트링을 모았습니다. 루미와 도트링들이 숲 탐험을 완료했어요!', true);
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

  // 2. 캐릭터(루미) 워킹 실루엣 — 항상 위에 덮어씀
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

async function connectDotPad() {
  dotPadConnected = !dotPadConnected;
  dom.dotpadState.textContent = dotPadConnected ? 'DotPad 연결 준비됨' : 'DotPad 미연결';
  dom.dotpadState.classList.toggle('connected', dotPadConnected);
  announce(dotPadConnected
    ? 'DotPad 연결 준비 상태입니다. 실제 SDK가 연결되면 sendDotPadFrame 함수에서 핀 데이터를 전송합니다.'
    : 'DotPad 연결을 해제했습니다.');
}

function sendDotPadFrame(matrix) {
  // DotPadSDK-1.0.0.js 연결 지점입니다.
  // 예: window.DotPadSDK.sendGraphic(matrixToDeviceBytes(matrix));
  // 현재 MVP에서는 실제 하드웨어 연결 전 단계이므로 콘솔/상태 갱신만 수행합니다.
  if (!dotPadConnected) return;
  const bytes = matrixToPackedBytes(matrix);
  console.log('DotPad frame ready:', { matrix, bytes, hex: bytesToHex(bytes) });
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
  gameState.player = { x: -20, z: 10, direction: 'down', animation: 'idle' };
  gameState.items = structuredClone(initialItems);
  updateLumiTransform('down');
  placeDotlings();
  updateScore();
  drawTactileFrame();
  sendDotPadFrame(lastMatrix);
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

  gameState.itemMeshes.forEach((mesh, id) => {
    const item = gameState.items.find((entry) => entry.id === id);
    if (item?.collected) return;
    mesh.rotation.y += delta * 0.8;
    mesh.position.y = 0.45 + Math.sin(clock.elapsedTime * 2.2 + item.x) * 0.08;
  });

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
