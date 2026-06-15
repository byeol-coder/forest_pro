/* ===========================================================
   Dot Forest — narrative + accessibility engine
   Reads narrative.json, layers RPG narration/missions/dialogue
   on top of the existing game via window.DotForest.bridge.
   Module script: runs after script.js (deferred order), so the
   bridge is available at init.
   =========================================================== */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PIP_POS = { x: 15, z: 7 };          // Chapter 1 target (right side of the forest)
const STORE_KEY = 'dotforest.settings';

const state = {
  data: null,
  settings: { ambientNarration: false, ttsEnabled: true, ttsLang: 'ko-KR', ttsRate: 1.02 },
  missionIndex: -1,
  mission: null,
  location: 'forest_entrance',
  companions: [],
  flags: {},
  started: false,
  dialogOpen: false,
  pipHinted: false,
};

let liveAssertive, livePolite, overlay;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const bridge = () => window.DotForest && window.DotForest.bridge;
const onGame = () => document.body.dataset.screen === 'game';

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (e) { /* in-memory only */ }
}
function persistSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.settings)); } catch (e) {}
}

/* ---------- aria-live regions ---------- */
function ensureLiveRegions() {
  const host = $('screen-game') || document.body;
  liveAssertive = makeRegion('narrationAssertive', 'assertive', 'alert');
  livePolite = makeRegion('narrationPolite', 'polite', 'status');
  function makeRegion(id, live, role) {
    let el = $(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id; el.className = 'sr-only';
      el.setAttribute('aria-live', live);
      el.setAttribute('role', role);
      el.setAttribute('aria-atomic', 'true');
      host.appendChild(el);
    }
    return el;
  }
}

/* ---------- say: aria-live + optional TTS ---------- */
function say(text, priority = 'polite') {
  if (!text) return;
  const region = priority === 'assertive' ? liveAssertive : livePolite;
  if (region) {
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = text; });
  }
  if (state.settings.ttsEnabled && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = state.settings.ttsLang;
      u.rate = state.settings.ttsRate;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
}

/* ---------- on-demand layers (1..4 / F1..F4) ---------- */
function locOnDemand(key) {
  const loc = state.data.locations[state.location];
  return loc && loc.onDemand && loc.onDemand[key];
}
function describePosition() {
  return locOnDemand('position') || state.data.onDemand.position.fallback;
}
function describeSurroundings() {
  const live = liveSurroundings();
  if (live) return live;
  return locOnDemand('surroundings') || state.data.onDemand.surroundings.fallback;
}
function describeMission() {
  if (!state.mission) return state.data.onDemand.mission.fallback;
  let t = `현재 목표: ${state.mission.objective}`;
  if (state.mission.target) t += ` (현재 ${collectedCount()}/${state.mission.target.count})`;
  return t;
}
function describeTactileMap() {
  const loc = state.data.locations[state.location];
  let t = state.data.onDemand.tactileMap.fallback;
  if (loc) t += ` 지금은 ${loc.name}입니다.`;
  return t;
}
function dirWord(dx, dz) {
  if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? '앞쪽' : '뒤쪽';
  return dx < 0 ? '왼쪽' : '오른쪽';
}
function distWord(d) { return d < 4 ? '바로 가까이' : d < 10 ? '가까이' : '멀리'; }
function liveSurroundings() {
  const b = bridge();
  if (!b || !b.state || !b.state.player) return null;
  const p = b.state.player;
  const items = (b.state.items || []).filter((it) => !it.collected);
  const parts = [];
  if (items.length) {
    let near = items[0], nd = Infinity;
    items.forEach((it) => { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < nd) { nd = d; near = it; } });
    parts.push(`${dirWord(near.x - p.x, near.z - p.z)} ${distWord(nd)}에 둥근 떨림(도트링)이 있습니다.`);
  } else {
    parts.push('주변의 도트링은 모두 모았습니다.');
  }
  const obs = (b.state.obstacles || []);
  if (obs.length) {
    let no = obs[0], od = Infinity;
    obs.forEach((o) => { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < od) { od = d; no = o; } });
    if (od < 8) parts.push(`${dirWord(no.x - p.x, no.z - p.z)}에 거친 나무 장애물이 있습니다.`);
  }
  const hz = (b.state.hazards || []);
  if (hz.length) {
    let nh = hz[0], hd = Infinity;
    hz.forEach((o) => { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < hd) { hd = d; nh = o; } });
    if (hd < 9) parts.push(`${dirWord(nh.x - p.x, nh.z - p.z)}에 그림자가 떠다닙니다. 조심하세요.`);
  }
  if (b.area === 'river' && typeof b.isDeepWater === 'function') {
    const step = (b.constants && b.constants.MOVE_STEP) || 1.2;
    const dirs = [['앞', 0, -step], ['뒤', 0, step], ['왼쪽', -step, 0], ['오른쪽', step, 0]];
    const deep = dirs.filter(([, dx, dz]) => b.isDeepWater(p.x + dx, p.z + dz)).map(([n]) => n);
    const safe = dirs.filter(([, dx, dz]) => !b.isDeepWater(p.x + dx, p.z + dz)).map(([n]) => n);
    if (deep.length) parts.push(`${deep.join(', ')}은 물이 노래합니다(깊은 물).`);
    if (safe.length) parts.push(`${safe.join(', ')}은 조용한 디딜 곳입니다.`);
  }
  return parts.join(' ');
}

/* ---------- mission flow ---------- */
function collectedCount() {
  const el = $('scoreText');
  const m = el && (el.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
function setQuest(text) {
  const panel = document.getElementById('questPanel');
  if (panel) panel.classList.remove('done');
  const el = document.getElementById('questText');
  if (el && text) el.textContent = text;
}
function showMissionToast(text) {
  const t = document.getElementById('missionToast');
  if (!t) return;
  const txt = document.getElementById('missionToastText');
  if (txt) txt.textContent = text || '';
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  window.setTimeout(() => t.classList.remove('show'), 2800);
}
function questComplete(label) {
  const panel = document.getElementById('questPanel');
  if (panel) { panel.classList.remove('done'); void panel.offsetWidth; panel.classList.add('done'); }
  showMissionToast(label || '미션 완료!');
}
function showZone(name) {
  const el = document.getElementById('zoneBanner');
  if (!el || !name) return;
  const t = document.getElementById('zoneBannerText');
  if (t) t.textContent = name;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2600);
}
function renderParty() {
  const el = document.getElementById('party');
  if (!el) return;
  const list = state.companions || [];
  if (list.length < el.children.length) el.innerHTML = '';
  for (let i = el.children.length; i < list.length; i++) {
    const chip = document.createElement('span');
    chip.className = 'party-chip is-new';
    chip.innerHTML = `<i></i>${list[i]}`;
    el.appendChild(chip);
    window.setTimeout(() => chip.classList.remove('is-new'), 900);
  }
}

function startMission(idx) {
  state.missionIndex = idx;
  state.mission = state.data.missions[idx] || null;
  if (!state.mission) { say('모든 빛을 되찾았어요. 숲이 다시 환하게 깨어납니다.', 'assertive'); return; }
  state.pipHinted = false;
  setQuest(state.mission.objective);
  if (state.mission.intro_narration) say(state.mission.intro_narration, 'assertive');
  window.setTimeout(() => say(`미션 업데이트: ${state.mission.objective}`, 'polite'), 1600);
  if (state.mission.puzzle && state.mission.puzzle.riddle) {
    window.setTimeout(() => say(state.mission.puzzle.riddle, 'polite'), 3400);
  }
}

function missionIndexForLocation(id) {
  return state.data.missions.findIndex((m) => m.location === id);
}

// Area drives the story: entering a zone sets the location and starts its mission.
function enterArea(id) {
  if (!state.data) return;
  state.location = id;
  const area = state.data.locations[id];
  if (area) showZone(area.name);
  const idx = missionIndexForLocation(id);
  if (idx >= 0 && state.missionIndex !== idx) {
    startMission(idx);
  } else {
    const loc = state.data.locations[id];
    if (loc && loc.description) say(`${loc.name}. ${loc.description}`, 'polite');
  }
}

function resetStory() {
  state.flags = {};
  state.companions = [];
  renderParty();
  state.missionIndex = -1;
  state.mission = null;
  state.pipHinted = false;
  enterArea('forest_entrance');
}

function crossRiverComplete() {
  if (state.flags.ch3done) return;
  state.flags.ch3done = true;
  state.companions.push('Echo');
  renderParty();
  questComplete('강을 건넜어요!');
  const m = (state.data.missions || []).find((x) => x.id === 'ch3_cross_river');
  say((m && m.completion_narration) || 'Echo를 구했어요.', 'assertive');
  window.setTimeout(() => say('흩어진 빛이 모두 제자리로 돌아왔어요. 숲이 환하게 깨어납니다.', 'polite'), 2000);
}

/* Chapter 1 — find Pip (proximity on movement) */
function checkChapter1() {
  if (!state.mission || state.mission.id !== 'ch1_find_pip' || state.flags.pipFound) return;
  const p = bridge() && bridge().state && bridge().state.player;
  if (!p) return;
  const d = Math.hypot(PIP_POS.x - p.x, PIP_POS.z - p.z);
  if (d < 9 && !state.pipHinted) {
    state.pipHinted = true;
    say('오른쪽에서 작고 높은 떨림이 느껴집니다. 가까워지고 있어요.', 'polite');
  }
  if (d < 4) {
    state.flags.pipFound = true;
    say(state.mission.discover_narration, 'assertive');
    window.setTimeout(() => startDialogue('Pip', 'meet_pip', () => {
      state.companions.push('Pip');
      renderParty();
      questComplete('Pip을 찾았어요!');
      say(state.mission.completion_narration, 'assertive');
      window.setTimeout(() => {
        setQuest('오른쪽 끝 출구로 가서 베리 숲으로 이동하세요.');
        say('베리 숲으로 가는 길이 열렸어요. 오른쪽 끝으로 가면 이동합니다.', 'polite');
      }, 1800);
    }), 1300);
  }
}

/* Chapter 2 — collect 3 berries (existing dotrings) */
function checkChapter2() {
  if (!state.mission || state.mission.id !== 'ch2_berries_for_bramble') return;
  const c = collectedCount();
  const need = state.mission.target.count;
  if (c > 0 && c < need) {
    say(state.mission.progress_narration.replace('{collected}', c).replace('{count}', need), 'polite');
  }
  if (c >= need && !state.flags.ch2done) {
    state.flags.ch2done = true;
    say(state.mission.completion_narration, 'assertive');
    window.setTimeout(() => startDialogue('Bramble', 'bramble_freed', () => {
      state.companions.push('Bramble');
      renderParty();
      questComplete('베리 3개를 모았어요!');
      window.setTimeout(() => setQuest('위쪽 끝 출구로 가서 강가로 이동하세요.'), 1800);
      say('강가로 가는 길이 열렸어요. 위쪽 끝으로 가면 이동합니다.', 'polite');
    }), 1500);
  }
}

/* ---------- accessible dialogue overlay ---------- */
function ensureOverlay() {
  if (overlay) return;
  const host = document.querySelector('#screen-game .stage') || $('screen-game') || document.body;
  overlay = document.createElement('div');
  overlay.id = 'dialogOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'dialogPrompt');
  overlay.hidden = true;
  overlay.innerHTML = '<div class="dialog-card"><p class="dialog-speaker" id="dialogSpeaker"></p>'
    + '<p class="dialog-prompt" id="dialogPrompt" tabindex="-1"></p>'
    + '<div class="dialog-choices" id="dialogChoices" role="group" aria-label="선택지"></div></div>';
  host.appendChild(overlay);
}
function startDialogue(charKey, nodeId, onDone) {
  const ch = state.data.characters[charKey];
  const node = ch && (ch.dialogue_tree || []).find((n) => n.id === nodeId);
  if (!node) { if (onDone) onDone(); return; }
  ensureOverlay();
  state.dialogOpen = true;
  $('dialogSpeaker').textContent = charKey === 'Lumi' ? '' : charKey;
  const prompt = $('dialogPrompt');
  prompt.textContent = node.text;
  const box = $('dialogChoices');
  box.innerHTML = '';
  (node.choices || [{ label: '계속', response: '' }]).forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialog-choice';
    btn.textContent = c.label;
    btn.addEventListener('click', () => {
      if (c.effect) {
        if (c.effect.flag) state.flags[c.effect.flag] = true;
        if (c.effect.affinity) state.flags['affinity_' + charKey] = (state.flags['affinity_' + charKey] || 0) + c.effect.affinity;
      }
      closeDialogue();
      if (c.response) say(c.response, 'polite');
      window.setTimeout(() => { if (onDone) onDone(); }, c.response ? 1500 : 200);
    });
    box.appendChild(btn);
  });
  overlay.hidden = false;
  say(node.text, 'assertive');
  window.setTimeout(() => { const f = box.querySelector('button'); if (f) f.focus(); }, 60);
}
function closeDialogue() {
  state.dialogOpen = false;
  if (overlay) overlay.hidden = true;
  const gh = $('gameHeading'); if (gh) gh.focus({ preventScroll: true });
}

/* ---------- ambient ---------- */
function ambientTick() {
  if (!state.settings.ambientNarration || !onGame() || state.dialogOpen || document.hidden) return;
  const lines = state.data.ambient || [];
  if (!lines.length) return;
  say(lines[Math.floor(Math.random() * lines.length)], 'polite');
}

/* ---------- input: on-demand keys + on-screen buttons ---------- */
function infoAction(key) {
  if (!onGame() || state.dialogOpen) return;
  const map = {
    position: describePosition, surroundings: describeSurroundings,
    mission: describeMission, tactileMap: describeTactileMap,
  };
  if (map[key]) say(map[key](), 'polite');
}
function wireInput() {
  const keyToInfo = { '1': 'position', '2': 'surroundings', '3': 'mission', '4': 'tactileMap' };
  document.addEventListener('keydown', (e) => {
    if (keyToInfo[e.key] && onGame() && !state.dialogOpen) { infoAction(keyToInfo[e.key]); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-info]');
    if (t) infoAction(t.dataset.info);
  });
  // block movement keys while a dialogue is open (capture, before the game listener)
  const MOVE = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D']);
  document.addEventListener('keydown', (e) => {
    if (state.dialogOpen && MOVE.has(e.key)) e.stopPropagation();
  }, true);
}

/* ---------- settings toggles ---------- */
function wireSettings() {
  const amb = $('ambientToggle');
  const tts = $('ttsToggle');
  if (amb) { amb.checked = !!state.settings.ambientNarration; amb.addEventListener('change', () => { state.settings.ambientNarration = amb.checked; persistSettings(); }); }
  if (tts) { tts.checked = !!state.settings.ttsEnabled; tts.addEventListener('change', () => { state.settings.ttsEnabled = tts.checked; persistSettings(); if (!tts.checked && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }); }
}

/* ---------- observers: movement + collection ---------- */
function wireObservers() {
  const live = $('liveStatus');
  if (live) new MutationObserver(() => { checkChapter1(); }).observe(live, { childList: true, characterData: true, subtree: true });
  const score = $('scoreText');
  if (score) new MutationObserver(() => { checkChapter2(); }).observe(score, { childList: true, characterData: true, subtree: true });
  // start the story the first time the game screen appears
  const startIfGame = () => { if (onGame() && !state.started) { state.started = true; const area = (bridge() && bridge().area) || 'forest_entrance'; window.setTimeout(() => enterArea(area), 900); } };
  new MutationObserver(startIfGame).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  startIfGame();
}

/* ---------- public API ---------- */
function exposeApi() {
  window.DotForest = window.DotForest || {};
  window.DotForest.narrative = {
    say, startMission, startDialogue, infoAction, enterArea,
    reset: resetStory, crossRiverComplete,
    get(key) { return key ? state[key] : { ...state }; },
    data: () => state.data,
  };
}

/* ---------- init ---------- */
async function init() {
  ensureLiveRegions();
  try {
    const res = await fetch('./narrative.json');
    state.data = await res.json();
  } catch (e) {
    console.error('[DotForest] narrative.json을 불러오지 못했습니다. http 서버로 실행했는지 확인하세요.', e);
    return;
  }
  Object.assign(state.settings, state.data.settings || {}); // file defaults
  loadStoredSettings();                                     // stored user prefs win
  wireInput();
  wireSettings();
  wireObservers();
  exposeApi();
  window.setInterval(ambientTick, 18000);
}

init();
