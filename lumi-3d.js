const DOT_WIDTH = 60;
const DOT_HEIGHT = 40;
const MAX_X = 4;
const MAX_Y = 3;

const cells = [];
const state = {
  x: 0,
  y: 3,
  score: 0,
  collected: new Set(),
  voiceOn: false,
  highContrast: false,
  reducedMotion: false,
  facing: 'right'
};

const items = [
  { id: 0, x: 1, y: 3, name: '빨간 열매', score: 10 },
  { id: 1, x: 2, y: 2, name: '별조각', score: 20 },
  { id: 2, x: 3, y: 3, name: '씨앗', score: 10 },
  { id: 3, x: 0, y: 1, name: '숲 버섯', score: 15 },
  { id: 4, x: 4, y: 1, name: '노란 별조각', score: 20 }
];

const stagePoints = [
  ['14%', '72%'], ['32%', '67%'], ['52%', '57%'], ['72%', '70%'], ['84%', '62%'],
  ['22%', '48%'], ['40%', '44%'], ['58%', '42%'], ['72%', '48%'], ['80%', '49%'],
  ['14%', '38%'], ['32%', '37%'], ['50%', '34%'], ['67%', '38%'], ['82%', '36%'],
  ['10%', '80%'], ['28%', '78%'], ['48%', '75%'], ['68%', '78%'], ['86%', '76%']
];

const dotGrid = document.getElementById('dotGrid');
const lumi = document.getElementById('lumi3d');
const liveMessage = document.getElementById('liveMessage');
const scoreText = document.getElementById('scoreText');
const itemText = document.getElementById('itemText');
const positionText = document.getElementById('positionText');
const aroundText = document.getElementById('aroundText');
const visualStatus = document.getElementById('visualStatus');
const dotStatus = document.getElementById('dotStatus');
const hexPreview = document.getElementById('hexPreview');
const voiceButton = document.getElementById('voiceButton');
const readButton = document.getElementById('readButton');
const contrastButton = document.getElementById('contrastButton');
const motionButton = document.getElementById('motionButton');
const forestStage = document.getElementById('forestStage');

let recognition = null;

function init() {
  buildDotGrid();
  bindEvents();
  setupSpeechRecognition();
  render();
  forestStage.focus();
}

function buildDotGrid() {
  dotGrid.innerHTML = '';
  for (let i = 0; i < DOT_WIDTH * DOT_HEIGHT; i += 1) {
    const cell = document.createElement('span');
    cell.className = 'dot-cell';
    cell.setAttribute('aria-hidden', 'true');
    cells.push(cell);
    dotGrid.appendChild(cell);
  }
}

function bindEvents() {
  window.addEventListener('keydown', event => {
    const keyMap = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down'
    };
    if (keyMap[event.key]) {
      event.preventDefault();
      move(keyMap[event.key]);
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      collectItem();
    }
    if (event.key.toLowerCase() === 'r') {
      speakCurrentPosition();
    }
  });

  document.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('click', () => move(button.dataset.move));
  });
  document.querySelector('[data-action="collect"]').addEventListener('click', collectItem);
  readButton.addEventListener('click', speakCurrentPosition);
  voiceButton.addEventListener('click', toggleVoice);
  contrastButton.addEventListener('click', toggleContrast);
  motionButton.addEventListener('click', toggleMotion);

  window.addEventListener('dotpad:pan-left', () => move('left'));
  window.addEventListener('dotpad:pan-right', () => move('right'));
  window.addEventListener('dotpad:pan-up', () => move('up'));
  window.addEventListener('dotpad:pan-down', () => move('down'));
  window.addEventListener('dotpad:select', collectItem);
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.textContent = '🎙 음성 조작 미지원';
    voiceButton.disabled = true;
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = event => {
    const last = event.results[event.results.length - 1][0].transcript.trim();
    handleVoiceCommand(last);
  };
  recognition.onend = () => {
    if (state.voiceOn) recognition.start();
  };
}

function toggleVoice() {
  if (!recognition) return;
  state.voiceOn = !state.voiceOn;
  if (state.voiceOn) {
    recognition.start();
    voiceButton.textContent = '🎙 음성 조작 ON';
    announce('음성 조작을 켰습니다. 위로 가, 아래로 가, 왼쪽으로 가, 오른쪽으로 가, 아이템 먹어라고 말할 수 있습니다.');
  } else {
    recognition.stop();
    voiceButton.textContent = '🎙 음성 조작 켜기';
    announce('음성 조작을 껐습니다.');
  }
}

function handleVoiceCommand(text) {
  if (/왼쪽|좌측/.test(text)) move('left');
  else if (/오른쪽|우측/.test(text)) move('right');
  else if (/위|앞/.test(text)) move('up');
  else if (/아래|뒤/.test(text)) move('down');
  else if (/먹|주워|획득|선택/.test(text)) collectItem();
  else if (/위치|어디|주변/.test(text)) speakCurrentPosition();
  else announce(`명령을 다시 말해주세요. 들은 내용은 ${text}입니다.`);
}

function move(direction) {
  const next = { x: state.x, y: state.y };
  if (direction === 'left') next.x -= 1;
  if (direction === 'right') next.x += 1;
  if (direction === 'up') next.y -= 1;
  if (direction === 'down') next.y += 1;
  state.facing = direction === 'left' ? 'left' : direction === 'right' ? 'right' : state.facing;

  if (next.x < 0 || next.x > MAX_X || next.y < 0 || next.y > MAX_Y) {
    lumi.classList.add('is-blocked');
    setTimeout(() => lumi.classList.remove('is-blocked'), 240);
    announce('숲의 경계입니다. 더 이동할 수 없습니다.');
    return;
  }

  state.x = next.x;
  state.y = next.y;
  lumi.classList.add('is-walking');
  setTimeout(() => lumi.classList.remove('is-walking'), 300);

  const near = getCurrentItem();
  if (near) announce(`${directionLabel(direction)} 이동했습니다. 바로 여기에 ${near.name}이 있습니다. 스페이스 또는 먹기 버튼으로 획득하세요.`);
  else announce(`${directionLabel(direction)} 이동했습니다. ${describeAround()}`);
  render();
}

function collectItem() {
  const item = getCurrentItem();
  if (!item) {
    announce('현재 위치에는 먹을 수 있는 아이템이 없습니다. 주변 안내를 확인해 주세요.');
    return;
  }
  state.collected.add(item.id);
  state.score += item.score;
  lumi.classList.add('is-happy');
  setTimeout(() => lumi.classList.remove('is-happy'), 760);
  announce(`${item.name}을 획득했습니다. 현재 점수는 ${state.score}점입니다.`);
  if (state.collected.size === items.length) {
    announce(`모든 아이템을 모았습니다. 스테이지 클리어! 총 점수는 ${state.score}점입니다.`);
  }
  render();
}

function render() {
  const point = getStagePoint(state.x, state.y);
  lumi.style.setProperty('--x', point[0]);
  lumi.style.setProperty('--y', point[1]);
  lumi.style.setProperty('--face', state.facing === 'left' ? '-18deg' : '18deg');

  document.querySelectorAll('.item').forEach(el => {
    const id = Number(el.dataset.item);
    el.classList.toggle('is-collected', state.collected.has(id));
  });

  scoreText.textContent = String(state.score);
  itemText.textContent = String(state.collected.size);
  positionText.textContent = `${state.x + 1}열 ${state.y + 1}행`;
  aroundText.textContent = describeAround();
  visualStatus.textContent = `루미 위치: ${state.x + 1}열 ${state.y + 1}행`;

  const matrix = createMatrix();
  renderMatrix(matrix);
  const hex = matrixToHex(matrix.map(row => row.map(value => value > 0 ? 1 : 0)));
  hexPreview.textContent = `${hex.slice(0, 96)}…`;
  dotStatus.textContent = `${DOT_WIDTH}×${DOT_HEIGHT} pins · ${hex.length} hex`;
  sendToDotPad(matrix, hex);
}

function createMatrix() {
  const matrix = Array.from({ length: DOT_HEIGHT }, () => Array(DOT_WIDTH).fill(0));
  drawRect(matrix, 0, 0, DOT_WIDTH, DOT_HEIGHT, 1);
  drawLine(matrix, 7, 34, 52, 29, 2, true);
  drawTree(matrix, 9, 13, 1);
  drawTree(matrix, 50, 12, 1);
  drawPond(matrix, 45, 23, 1);
  items.forEach(item => {
    if (state.collected.has(item.id)) return;
    const dot = gridToDot(item.x, item.y);
    drawItem(matrix, dot.x, dot.y, 4);
  });
  const player = gridToDot(state.x, state.y);
  drawLumiDot(matrix, player.x, player.y, 3);
  return matrix;
}

function renderMatrix(matrix) {
  for (let y = 0; y < DOT_HEIGHT; y += 1) {
    for (let x = 0; x < DOT_WIDTH; x += 1) {
      const cell = cells[y * DOT_WIDTH + x];
      const value = matrix[y][x];
      cell.className = 'dot-cell';
      if (value === 1) cell.classList.add('on');
      if (value === 2) cell.classList.add('path');
      if (value === 3) cell.classList.add('player');
      if (value === 4) cell.classList.add('item');
      if (value === 5) cell.classList.add('wall');
    }
  }
}

function gridToDot(x, y) {
  return { x: 9 + x * 10, y: 9 + y * 8 };
}

function getStagePoint(x, y) {
  return stagePoints[y * 5 + x];
}

function getCurrentItem() {
  return items.find(item => item.x === state.x && item.y === state.y && !state.collected.has(item.id));
}

function describeAround() {
  const candidates = items.filter(item => !state.collected.has(item.id));
  if (!candidates.length) return '모든 아이템을 수집했습니다.';
  const nearest = candidates
    .map(item => ({ ...item, distance: Math.abs(item.x - state.x) + Math.abs(item.y - state.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const dx = nearest.x - state.x;
  const dy = nearest.y - state.y;
  const dir = [];
  if (dy < 0) dir.push('위쪽');
  if (dy > 0) dir.push('아래쪽');
  if (dx < 0) dir.push('왼쪽');
  if (dx > 0) dir.push('오른쪽');
  if (nearest.distance === 0) return `현재 위치에 ${nearest.name}이 있습니다.`;
  return `${dir.join(' ')} ${nearest.distance}칸 거리에 ${nearest.name}이 있습니다.`;
}

function speakCurrentPosition() {
  announce(`현재 위치는 ${state.x + 1}열 ${state.y + 1}행입니다. ${describeAround()}`);
}

function announce(message) {
  liveMessage.textContent = message;
  visualStatus.textContent = message;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }
}

function directionLabel(direction) {
  return ({ left: '왼쪽으로', right: '오른쪽으로', up: '위로', down: '아래로' })[direction];
}

function toggleContrast() {
  state.highContrast = !state.highContrast;
  document.body.classList.toggle('high-contrast', state.highContrast);
  contrastButton.textContent = state.highContrast ? '고대비 ON' : '고대비 OFF';
  contrastButton.setAttribute('aria-pressed', String(state.highContrast));
}

function toggleMotion() {
  state.reducedMotion = !state.reducedMotion;
  document.body.classList.toggle('reduced-motion', state.reducedMotion);
  motionButton.textContent = state.reducedMotion ? '모션 줄이기 ON' : '모션 줄이기 OFF';
  motionButton.setAttribute('aria-pressed', String(state.reducedMotion));
}

function sendToDotPad(matrix, hex) {
  const binaryMatrix = matrix.map(row => row.map(value => value > 0 ? 1 : 0));
  if (window.DotPadBridge?.sendGraphic) {
    window.DotPadBridge.sendGraphic(matrix, {
      page: 1,
      title: '루미의 숲속 아이템 탐험',
      textPlain: liveMessage.textContent
    });
    return;
  }
  window.currentDotPadFrame = { width: DOT_WIDTH, height: DOT_HEIGHT, matrix: binaryMatrix, hex };
}

function setPoint(matrix, x, y, value = 1) {
  if (x >= 0 && x < DOT_WIDTH && y >= 0 && y < DOT_HEIGHT) matrix[y][x] = value;
}
function drawRect(matrix, x, y, w, h, value = 1) {
  for (let i = 0; i < w; i += 1) { setPoint(matrix, x + i, y, value); setPoint(matrix, x + i, y + h - 1, value); }
  for (let j = 0; j < h; j += 1) { setPoint(matrix, x, y + j, value); setPoint(matrix, x + w - 1, y + j, value); }
}
function drawLine(matrix, x1, y1, x2, y2, value = 1, dotted = false) {
  const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx + dy, x = x1, y = y1, count = 0;
  while (true) {
    if (!dotted || count % 2 === 0) setPoint(matrix, x, y, value);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    count += 1;
  }
}
function drawTree(matrix, x, y, value) {
  for (let yy = -4; yy <= 4; yy += 1) {
    for (let xx = -5; xx <= 5; xx += 1) {
      if (xx * xx + yy * yy <= 22) setPoint(matrix, x + xx, y + yy, value);
    }
  }
  drawLine(matrix, x, y + 4, x, y + 10, value);
}
function drawPond(matrix, x, y, value) {
  for (let yy = -3; yy <= 3; yy += 1) {
    for (let xx = -7; xx <= 7; xx += 1) {
      if ((xx * xx) / 49 + (yy * yy) / 9 <= 1) setPoint(matrix, x + xx, y + yy, value);
    }
  }
}
function drawItem(matrix, x, y, value) {
  setPoint(matrix, x, y - 2, value); setPoint(matrix, x - 2, y, value); setPoint(matrix, x, y, value); setPoint(matrix, x + 2, y, value); setPoint(matrix, x, y + 2, value);
}
function drawLumiDot(matrix, x, y, value) {
  [[0,-4],[-1,-3],[0,-3],[1,-3],[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1],[0,2],[0,3]].forEach(([dx, dy]) => setPoint(matrix, x + dx, y + dy, value));
  setPoint(matrix, x - 1, y - 6, value);
  setPoint(matrix, x + 1, y - 6, value);
}
function matrixToHex(binaryMatrix) {
  const bits = binaryMatrix.flat();
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | (bits[i + b] || 0);
    bytes.push(byte);
  }
  return bytes.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

init();
