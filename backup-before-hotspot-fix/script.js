const app = document.getElementById("app");

const ASSETS = {
  lumiFront: "./assets/lumi_01_front.png",
  lumiThreeQuarter: "./assets/lumi_02_three_quarter.png",
  lumiSide: "./assets/lumi_03_side.png",
  lumiBack: "./assets/lumi_04_back.png",
  lumiIdle: "./assets/lumi_action_01_idle.png",
  lumiWalk: "./assets/lumi_action_02_walk.png",
  lumiWave: "./assets/lumi_action_03_wave.png",
  lumiCelebrate: "./assets/lumi_action_04_celebrate.png",
  lumiHappy: "./assets/lumi_expr_01_happy.png",
  lumiThinking: "./assets/lumi_expr_02_thinking.png",
  lumiSurprised: "./assets/lumi_expr_03_surprised.png",
  lumiDetermined: "./assets/lumi_expr_04_determined.png",
  dotling: "./assets/Dotling.png"
};

const level = {
  levelId: "forest_path_01",
  name: "Forest Path 1",
  mission: "Collect 3 berries and reach the glowing tree.",
  gridSize: { cols: 12, rows: 9 },
  playerStart: { x: 1, y: 1 },
  goalTile: { x: 10, y: 7, type: "glowTree" },
  items: [
    { id: "berry_01", x: 3, y: 1, type: "berry", collected: false },
    { id: "berry_02", x: 6, y: 4, type: "berry", collected: false },
    { id: "berry_03", x: 9, y: 6, type: "berry", collected: false }
  ],
  obstacles: [
    { x: 4, y: 2, type: "rock" },
    { x: 5, y: 3, type: "fallenLog" },
    { x: 8, y: 5, type: "bush" }
  ],
  walkablePath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 4 },
    { x: 6, y: 4 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
    { x: 7, y: 6 },
    { x: 8, y: 6 },
    { x: 9, y: 6 },
    { x: 10, y: 6 },
    { x: 10, y: 7 }
  ]
};

const state = {
  screen: "home",
  previousScreen: "home",
  dotPadStatus: "Not Connected",
  player: { ...level.playerStart },
  direction: "down",
  items: structuredClone(level.items),
  voiceLog: [],
  lastVoice: "",
  popup: null,
  collisions: 0,
  settings: {
    voiceGuidance: true,
    voiceSpeed: 1,
    soundEffects: true,
    highContrast: false,
    largeButtonMode: true,
    tactilePreview: true,
    dotPadOutput: true,
    inputMethod: "keyboard"
  }
};

function setScreen(screen) {
  state.previousScreen = state.screen;
  state.screen = screen;
  render();

  const messages = {
    home: "Dot Forest main screen.",
    connect: "Dot Pad connection screen.",
    settings: "Accessibility settings screen.",
    worldMap: "World map screen.",
    missionIntro: "Forest Path 1. Collect three berries and reach the glowing tree.",
    gameplay: "Gameplay started.",
    missionComplete: "Mission complete. All berries collected."
  };

  if (messages[screen]) speak(messages[screen]);
}

function speak(message) {
  state.lastVoice = message;
  state.voiceLog.unshift(message);
  state.voiceLog = state.voiceLog.slice(0, 6);

  if (!state.settings.voiceGuidance) return;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = Number(state.settings.voiceSpeed) || 1;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}

function statusBadges() {
  return `
    <div class="status-row" aria-label="Game status">
      <span class="badge">Dot Pad: ${state.dotPadStatus}</span>
      <span class="badge">Voice: ${state.settings.voiceGuidance ? "On" : "Off"}</span>
      <span class="badge">Tactile Preview: ${state.settings.tactilePreview ? "On" : "Off"}</span>
    </div>
  `;
}

function shell(title, subtitle, body) {
  document.body.classList.toggle("high-contrast", state.settings.highContrast);
  document.body.classList.toggle("large-buttons", state.settings.largeButtonMode);

  return `
    <section class="screen">
      <div class="shell">
        <div class="content">
          <header class="topbar">
            <div class="title-block">
              <h2>${title}</h2>
              <p class="subtitle">${subtitle}</p>
            </div>
            ${statusBadges()}
          </header>
          ${body}
        </div>
      </div>
    </section>
  `;
}

function img(src, alt, className = "lumi") {
  return `<img src="${src}" alt="${alt}" class="${className}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<div style=&quot;font-size:72px&quot;>🌟</div>')" />`;
}

function renderHome() {
  app.innerHTML = shell(
    "Dot Forest",
    "Lumi & Dotlings · 촉각과 소리로 탐험하는 숲속 모험",
    `
    <div class="hero-grid">
      <div class="hero-card hero-visual">
        ${img(ASSETS.lumiWave, "Lumi waving")}
        <img src="${ASSETS.dotling}" alt="Dotling companion" class="dotling" />
      </div>
      <div class="hero-card">
        <div class="menu">
          <button class="btn" onclick="setScreen('connect')">Start New Game</button>
          <button class="btn secondary" onclick="setScreen('worldMap')">World Map</button>
          <button class="btn secondary" onclick="setScreen('connect')">Connect Dot Pad</button>
          <button class="btn secondary" onclick="setScreen('settings')">Accessibility Settings</button>
          <button class="btn secondary" onclick="speak('Help. Use arrow keys, touch buttons, or voice commands to explore the forest.')">Help</button>
        </div>
      </div>
    </div>
    `
  );
}

function renderConnect() {
  const isConnected = state.dotPadStatus === "Connected";

  app.innerHTML = shell(
    "Connect Dot Pad",
    "촉각 출력 장치를 연결하고 60×40 프리뷰를 테스트합니다.",
    `
    <div class="grid-2">
      <div class="panel hero-visual">
        ${img(isConnected ? ASSETS.lumiHappy : ASSETS.lumiThinking, "Lumi waiting for Dot Pad")}
      </div>
      <div class="panel">
        <h3>Device Status</h3>
        <p class="subtitle">${state.dotPadStatus}</p>
        <p>${isConnected ? "Tactile Output Ready" : "Connect 버튼을 눌러 Mock Dot Pad 연결을 시작하세요."}</p>
        <div class="menu">
          <button class="btn" onclick="simulateDotPadConnection()">Connect</button>
          <button class="btn secondary" onclick="setScreen('settings')">Accessibility Settings</button>
          <button class="btn secondary" onclick="setScreen('home')">Back</button>
        </div>
        ${renderTactilePreview()}
      </div>
    </div>
    `
  );
}

function simulateDotPadConnection() {
  state.dotPadStatus = "Searching";
  render();
  speak("Searching for Dot Pad.");

  setTimeout(() => {
    state.dotPadStatus = "Connecting";
    render();
    speak("Connecting to Dot Pad.");
  }, 700);

  setTimeout(() => {
    state.dotPadStatus = "Connected";
    render();
    speak("Dot Pad connected. Tactile output ready.");
  }, 1500);
}

function renderSettings() {
  app.innerHTML = shell(
    "Accessibility Settings",
    "음성 안내, 촉각 프리뷰, 입력 방식을 플레이어에게 맞게 조정합니다.",
    `
    <div class="grid-2">
      <div class="panel">
        ${settingToggle("voiceGuidance", "Voice Guidance")}
        <div class="setting-row">
          <label for="voiceSpeed">Voice Speed</label>
          <input id="voiceSpeed" type="range" min="0.7" max="1.5" step="0.1" value="${state.settings.voiceSpeed}" onchange="updateSetting('voiceSpeed', this.value)" />
        </div>
        ${settingToggle("soundEffects", "Sound Effects")}
        ${settingToggle("highContrast", "High Contrast Mode")}
        ${settingToggle("largeButtonMode", "Large Button Mode")}
        ${settingToggle("tactilePreview", "Tactile Preview")}
        ${settingToggle("dotPadOutput", "Dot Pad Output")}
        <div class="setting-row">
          <label for="inputMethod">Input Method</label>
          <select id="inputMethod" onchange="updateSetting('inputMethod', this.value)">
            <option value="keyboard" ${state.settings.inputMethod === "keyboard" ? "selected" : ""}>Keyboard</option>
            <option value="touch" ${state.settings.inputMethod === "touch" ? "selected" : ""}>Touch D-pad</option>
            <option value="voice" ${state.settings.inputMethod === "voice" ? "selected" : ""}>Voice Command</option>
          </select>
        </div>
      </div>
      <div class="panel hero-visual">
        ${img(ASSETS.lumiThreeQuarter, "Lumi guide")}
      </div>
    </div>
    <div class="menu" style="margin-top:18px;">
      <button class="btn" onclick="setScreen('worldMap')">Save</button>
      <button class="btn secondary" onclick="setScreen('home')">Back</button>
    </div>
    `
  );
}

function settingToggle(key, label) {
  return `
    <div class="setting-row">
      <label>${label}</label>
      <button class="toggle ${state.settings[key] ? "on" : ""}" aria-label="${label}" onclick="toggleSetting('${key}')"></button>
    </div>
  `;
}

function toggleSetting(key) {
  state.settings[key] = !state.settings[key];
  render();
  speak(`${key} ${state.settings[key] ? "on" : "off"}.`);
}

function updateSetting(key, value) {
  state.settings[key] = key === "voiceSpeed" ? Number(value) : value;
  render();
  speak(`${key} updated.`);
}

function renderWorldMap() {
  const nodes = [
    { name: "Forest Path 1", status: "current" },
    { name: "Berry Grove", status: "locked" },
    { name: "Silent Bridge", status: "locked" },
    { name: "Glow Tree", status: "locked" }
  ];

  app.innerHTML = shell(
    "World Map",
    "Lumi와 Dotlings가 숲속 길을 따라 모험을 시작합니다.",
    `
    <div class="panel">
      <div class="map-path">
        ${nodes.map((node, index) => `
          <div class="map-node ${node.status}">
            <strong>${index + 1}. ${node.name}</strong>
            <span>${node.status === "current" ? "Current Level" : "Locked"}</span>
            ${node.status === "current" ? `<button class="btn" onclick="setScreen('missionIntro')">Enter Level</button>` : `<button class="btn secondary" disabled>Locked</button>`}
          </div>
        `).join("")}
      </div>
    </div>
    <div class="menu" style="margin-top:18px;">
      <button class="btn secondary" onclick="setScreen('settings')">Accessibility Settings</button>
      <button class="btn secondary" onclick="setScreen('home')">Back</button>
    </div>
    `
  );
}

function renderMissionIntro() {
  app.innerHTML = shell(
    "Forest Path 1",
    "미션 소개 · 열매 3개를 모으고 빛나는 나무까지 이동하세요.",
    `
    <div class="grid-2">
      <div class="panel hero-visual">
        ${img(ASSETS.lumiWave, "Lumi ready for mission")}
      </div>
      <div class="panel">
        <h3>Mission</h3>
        <p>Collect <strong>3 berries</strong> and reach the <strong>glowing tree</strong>.</p>
        <h3>Controls</h3>
        <p>Arrow Keys / WASD / Touch D-pad</p>
        <p>F1: collect · F2: repeat voice · F3: pause · F4: settings</p>
        <div class="menu">
          <button class="btn" onclick="startGame()">Start</button>
          <button class="btn secondary" onclick="setScreen('worldMap')">Back</button>
        </div>
      </div>
    </div>
    `
  );
}

function startGame() {
  resetLevel();
  setScreen("gameplay");
}

function resetLevel() {
  state.player = { ...level.playerStart };
  state.items = structuredClone(level.items);
  state.direction = "down";
  state.collisions = 0;
  state.popup = null;
}

function renderGameplay() {
  app.innerHTML = shell(
    "Gameplay",
    "Lumi를 움직여 열매를 모으고 빛나는 나무까지 이동하세요.",
    `
    <div class="game-layout">
      <div class="panel">
        <div class="hud">
          <span class="badge">Level: ${level.name}</span>
          <span class="badge">Berries: ${collectedCount()}/3</span>
          <span class="badge">Collisions: ${state.collisions}</span>
        </div>
        ${renderBoard()}
        ${renderDpad()}
      </div>
      <aside class="panel">
        <h3>Voice Guidance</h3>
        <div class="voice-log">
          ${state.voiceLog.length ? state.voiceLog.map(m => `<div>• ${m}</div>`).join("") : "Voice guidance log will appear here."}
        </div>
        <h3>Tactile Preview 60×40</h3>
        ${renderTactilePreview()}
        <div class="menu" style="margin-top:16px;">
          <button class="btn secondary" onclick="openPause()">Pause</button>
          <button class="btn secondary" onclick="speak(state.lastVoice || 'No previous guidance.')">Repeat Guidance</button>
        </div>
      </aside>
    </div>
    ${state.popup ? renderPopup() : ""}
    `
  );
}

function renderBoard() {
  const cells = [];

  for (let y = 0; y < level.gridSize.rows; y++) {
    for (let x = 0; x < level.gridSize.cols; x++) {
      const isPath = level.walkablePath.some(p => p.x === x && p.y === y);
      const obstacle = level.obstacles.find(o => o.x === x && o.y === y);
      const item = state.items.find(i => i.x === x && i.y === y && !i.collected);
      const isGoal = level.goalTile.x === x && level.goalTile.y === y;
      const isPlayer = state.player.x === x && state.player.y === y;

      let content = "";
      let classes = ["cell"];

      if (isPath) classes.push("path");
      if (obstacle) classes.push("obstacle");
      if (isGoal) classes.push("goal");

      if (obstacle) content = "🪨";
      if (item) content = "🫐";
      if (isGoal) content = "🌳";
      if (isPlayer) content = renderPlayerSprite();

      cells.push(`<div class="${classes.join(" ")}" aria-label="cell ${x}, ${y}">${content}</div>`);
    }
  }

  return `<div class="game-board">${cells.join("")}</div>`;
}

function renderPlayerSprite() {
  let src = ASSETS.lumiIdle;
  let flip = "";

  if (state.direction === "up") src = ASSETS.lumiBack;
  if (state.direction === "down") src = ASSETS.lumiFront;
  if (state.direction === "left") src = ASSETS.lumiSide;
  if (state.direction === "right") {
    src = ASSETS.lumiSide;
    flip = "flip-x";
  }

  return `<img src="${src}" alt="Lumi player" class="player-sprite ${flip}" />`;
}

function renderDpad() {
  return `
    <div class="dpad" aria-label="Touch direction pad">
      <span></span><button class="btn secondary" onclick="movePlayer('up')">↑</button><span></span>
      <button class="btn secondary" onclick="movePlayer('left')">←</button>
      <button class="btn secondary" onclick="tryCollect()">●</button>
      <button class="btn secondary" onclick="movePlayer('right')">→</button>
      <span></span><button class="btn secondary" onclick="movePlayer('down')">↓</button><span></span>
    </div>
  `;
}

function movePlayer(direction) {
  if (state.screen !== "gameplay") return;

  const delta = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  }[direction];

  state.direction = direction;

  const next = {
    x: state.player.x + delta.x,
    y: state.player.y + delta.y
  };

  if (next.x < 0 || next.y < 0 || next.x >= level.gridSize.cols || next.y >= level.gridSize.rows) {
    showWarning("Forest edge detected. Try another direction.");
    return;
  }

  const obstacle = level.obstacles.find(o => o.x === next.x && o.y === next.y);
  if (obstacle) {
    state.collisions += 1;
    showWarning("Obstacle detected. Try another direction.");
    return;
  }

  state.player = next;
  speak(`Moved ${direction}.`);
  tryCollect(false);
  checkGoal();
  render();
}

function tryCollect(shouldSpeak = true) {
  const item = state.items.find(i => i.x === state.player.x && i.y === state.player.y && !i.collected);

  if (!item) {
    if (shouldSpeak) speak("No item here.");
    return;
  }

  item.collected = true;
  state.popup = {
    type: "item",
    title: "Berry Collected",
    message: `Berry collected. ${collectedCount()} of 3.`
  };
  speak(state.popup.message);
  render();
}

function showWarning(message) {
  state.popup = {
    type: "warning",
    title: "Obstacle Detected",
    message
  };
  speak(message);
  render();
}

function renderPopup() {
  const isWarning = state.popup.type === "warning";
  return `
    <div class="popup-backdrop" role="dialog" aria-modal="true">
      <div class="popup">
        ${img(isWarning ? ASSETS.lumiSurprised : ASSETS.lumiHappy, "Lumi feedback", "lumi")}
        <h3>${state.popup.title}</h3>
        <p>${state.popup.message}</p>
        <button class="btn ${isWarning ? "warning" : ""}" onclick="closePopup()">Continue</button>
      </div>
    </div>
  `;
}

function closePopup() {
  state.popup = null;
  checkGoal();
  render();
}

function checkGoal() {
  const atGoal = state.player.x === level.goalTile.x && state.player.y === level.goalTile.y;
  if (atGoal && collectedCount() === 3) {
    setScreen("missionComplete");
  } else if (atGoal) {
    speak("The glowing tree is here. Collect all berries to complete the mission.");
  }
}

function collectedCount() {
  return state.items.filter(i => i.collected).length;
}

function renderMissionComplete() {
  app.innerHTML = shell(
    "Mission Complete",
    "Lumi와 Dotlings가 숲속 미션을 완료했습니다.",
    `
    <div class="grid-2">
      <div class="panel hero-visual">
        ${img(ASSETS.lumiCelebrate, "Lumi celebrating")}
        <img src="${ASSETS.dotling}" alt="Dotling celebrating" class="dotling" />
      </div>
      <div class="panel">
        <h3>Great Job!</h3>
        <p><strong>3/3 berries</strong> collected.</p>
        <p>You found the safe path and reached the glowing tree.</p>
        <div class="menu">
          <button class="btn" onclick="setScreen('worldMap')">World Map</button>
          <button class="btn secondary" onclick="startGame()">Replay</button>
          <button class="btn secondary" onclick="setScreen('home')">Home</button>
        </div>
      </div>
    </div>
    `
  );
}

function openPause() {
  state.previousScreen = state.screen;
  state.screen = "pauseMenu";
  speak("Game paused.");
  renderPause();
}

function renderPause() {
  app.insertAdjacentHTML("beforeend", `
    <div class="pause-overlay">
      <div class="pause-panel">
        <h2>Paused</h2>
        <div class="menu">
          <button class="btn" onclick="resumeGame()">Resume</button>
          <button class="btn secondary" onclick="startGame()">Restart</button>
          <button class="btn secondary" onclick="setScreen('worldMap')">World Map</button>
          <button class="btn secondary" onclick="setScreen('settings')">Accessibility Settings</button>
        </div>
      </div>
    </div>
  `);
}

function resumeGame() {
  state.screen = "gameplay";
  render();
  speak("Game resumed.");
}

function renderTactilePreview() {
  if (!state.settings.tactilePreview) {
    return `<p>Tactile preview is turned off.</p>`;
  }

  const values = buildTactileMatrix();
  return `
    <div class="tactile-grid" aria-label="60 by 40 tactile preview">
      ${values.map(v => `<span class="tactile-dot v${v}"></span>`).join("")}
    </div>
  `;
}

function buildTactileMatrix() {
  const cols = 60;
  const rows = 40;
  const matrix = Array(cols * rows).fill(0);

  function setBlock(cx, cy, value, size = 2) {
    for (let yy = -size; yy <= size; yy++) {
      for (let xx = -size; xx <= size; xx++) {
        const x = cx + xx;
        const y = cy + yy;
        if (x >= 0 && y >= 0 && x < cols && y < rows) {
          matrix[y * cols + x] = value;
        }
      }
    }
  }

  function scaleX(x) {
    return Math.round((x / (level.gridSize.cols - 1)) * (cols - 1));
  }

  function scaleY(y) {
    return Math.round((y / (level.gridSize.rows - 1)) * (rows - 1));
  }

  level.walkablePath.forEach(p => setBlock(scaleX(p.x), scaleY(p.y), 1, 1));
  level.obstacles.forEach(o => setBlock(scaleX(o.x), scaleY(o.y), 3, 2));
  state.items.filter(i => !i.collected).forEach(i => setBlock(scaleX(i.x), scaleY(i.y), 4, 1));
  setBlock(scaleX(level.goalTile.x), scaleY(level.goalTile.y), 5, 2);
  setBlock(scaleX(state.player.x), scaleY(state.player.y), 2, 2);

  return matrix;
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();

  if (["arrowup", "w"].includes(key)) {
    event.preventDefault();
    movePlayer("up");
  }

  if (["arrowdown", "s"].includes(key)) {
    event.preventDefault();
    movePlayer("down");
  }

  if (["arrowleft", "a"].includes(key)) {
    event.preventDefault();
    movePlayer("left");
  }

  if (["arrowright", "d"].includes(key)) {
    event.preventDefault();
    movePlayer("right");
  }

  if (key === " " || key === "enter" || key === "f1") {
    event.preventDefault();
    tryCollect();
  }

  if (key === "f2") {
    event.preventDefault();
    speak(state.lastVoice || "No previous guidance.");
  }

  if (key === "escape" || key === "f3") {
    event.preventDefault();
    if (state.screen === "gameplay") openPause();
    else if (state.screen === "pauseMenu") resumeGame();
  }

  if (key === "f4") {
    event.preventDefault();
    setScreen("settings");
  }
}

document.addEventListener("keydown", handleKeydown);

function render() {
  if (state.screen === "home") renderHome();
  if (state.screen === "connect") renderConnect();
  if (state.screen === "settings") renderSettings();
  if (state.screen === "worldMap") renderWorldMap();
  if (state.screen === "missionIntro") renderMissionIntro();
  if (state.screen === "gameplay") renderGameplay();
  if (state.screen === "missionComplete") renderMissionComplete();
}

renderHome();