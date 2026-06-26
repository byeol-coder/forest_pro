const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const screens = fs.readFileSync(path.join(root, 'screens.js'), 'utf8');
const inputMap = fs.readFileSync(path.join(root, 'src/game-tactile/input-map.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/game-tactile/renderer.js'), 'utf8');
const scoring = fs.readFileSync(path.join(root, 'src/game-tactile/scoring.js'), 'utf8');
const stream = fs.readFileSync(path.join(root, 'src/game-tactile/dotpad-stream.js'), 'utf8');

function tagById(id) {
  const match = html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, 'i'));
  assert.ok(match, `#${id} should exist`);
  return match[0];
}

const liveStatus = tagById('liveStatus');
assert.match(liveStatus, /role=["']status["']|aria-live=["'](?:polite|assertive)["']/i, '#liveStatus should expose a live status');

const tactileCanvas = tagById('tactileCanvas');
assert.match(tactileCanvas, /width=["']600["']/i, '#tactileCanvas width should be 600');
assert.match(tactileCanvas, /height=["']400["']/i, '#tactileCanvas height should be 400');

tagById('dpad');

const titleActions = ['independent-start', 'connect-start', 'practice', 'teacher-guide'];
for (const action of titleActions) {
  const match = html.match(new RegExp(`<button[^>]+data-title-action=["']${action}["'][^>]*>`, 'i'));
  assert.ok(match, `title action "${action}" should be a native button`);
  assert.doesNotMatch(match[0], /tabindex=["']-1["']|disabled/i, `title action "${action}" should be keyboard-focusable`);
}
const independentStart = html.match(/<button[^>]+data-title-action=["']independent-start["'][^>]*>/i);
assert.ok(independentStart, 'independent start button should exist');
assert.match(screens, /openIndependentStart/, 'independent start should open a preparation screen before gameplay');
assert.match(screens, /첫 스테이지 시작/, 'independent onboarding should include a clear first-stage start action');
assert.match(screens, /stopImmediatePropagation/, 'independent onboarding should prevent immediate data-nav gameplay jump');

assert.match(html, /data-dotpad-action=["']connect["']/i, 'DotPad connect control should exist');
assert.match(html, /data-dotpad-action=["']mock["']/i, 'DotPad mock mode control should exist');

const expectedMap = {
  F1: '현재 위치 읽기',
  F2: '상호작용 또는 확인',
  F3: '현재 미션 읽기',
  F4: '주변 스캔',
};
for (const [key, label] of Object.entries(expectedMap)) {
  const pattern = new RegExp(`data-dotpad-key=["']${key}["'][^>]+data-action-label=["']${label}["']`, 'i');
  assert.match(html, pattern, `${key} label should match its actual behavior`);
}

assert.match(inputMap, /PanningLeft:\s*'move_left'/, 'PanningLeft should move left');
assert.match(inputMap, /PanningRight:\s*'move_right'/, 'PanningRight should move right');
assert.match(inputMap, /LPF1:\s*'move_up'/, 'up panning combination should move forward');
assert.match(inputMap, /RPF4:\s*'move_down'/, 'down panning combination should move backward');
assert.match(inputMap, /KeyFunction1:\s*'read_current_position'/, 'F1 should read current position');
assert.match(inputMap, /KeyFunction2:\s*'confirm_or_interact'/, 'F2 should interact');
assert.match(inputMap, /KeyFunction3:\s*'read_current_mission'/, 'F3 should read current mission');
assert.match(inputMap, /KeyFunction4:\s*'scan_surroundings'/, 'F4 should scan surroundings');
assert.match(inputMap, /PanningAll:\s*'cycle_tactile_view'/, 'PanningAll should cycle tactile view');
assert.match(script, /function describeCurrentSituation\(\)/, 'describeCurrentSituation should exist');
assert.match(renderer, /export function renderStateToGrid/, 'game tactile renderer should exist');
assert.match(scoring, /calculateGameTactilePlayabilityScore/, 'playability score should exist');
assert.match(stream, /skipIfSameHex/, 'DotPad stream should suppress duplicate frames');

for (const mode of ['local', 'map', 'goal']) {
  assert.match(html, new RegExp(`data-tactile-view=["']${mode}["']`), `tactile view "${mode}" should exist`);
}
tagById('gameTactileDebug');

console.log('Accessibility smoke tests passed.');
