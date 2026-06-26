export const GAME_TACTILE_PRIORITY = Object.freeze({
  player: 100,
  dangerNearPlayer: 95,
  currentGoal: 90,
  interactableObject: 80,
  path: 70,
  wall: 60,
  collectible: 50,
  npc: 45,
  background: 10,
  decoration: 0,
});

export const GAME_TACTILE_LAYERS = Object.freeze([
  'player',
  'terrain',
  'object',
  'danger',
  'goal',
]);

export const TACTILE_VIEW_MODES = Object.freeze({
  LOCAL: 'local',
  MAP: 'map',
  GOAL: 'goal',
});

export const TACTILE_VIEW_LABELS = Object.freeze({
  [TACTILE_VIEW_MODES.LOCAL]: '현재 주변 보기',
  [TACTILE_VIEW_MODES.MAP]: '전체 맵 보기',
  [TACTILE_VIEW_MODES.GOAL]: '목표 방향 보기',
});

export const GAME_TACTILE_LIMITS = Object.freeze({
  maxCoreObjects: 5,
  maxDangerObjects: 3,
  maxInteractableObjects: 3,
  maxPatternTypes: 5,
  maxBlinkPatternTypes: 2,
  maxChangedAreaRatioPerFrame: 0.3,
});

export const DOTPAD_GAME_STREAM = Object.freeze({
  minIntervalMs: 100,
  maxIntervalMs: 250,
  sendOnPlayerMove: true,
  sendOnDangerChange: true,
  sendOnGoalChange: true,
  skipIfSameHex: true,
});

export const GAME_TACTILE_GRID = Object.freeze({
  width: 60,
  height: 40,
  localWorldWidth: 18,
  localWorldHeight: 12,
});

export function nextTactileViewMode(mode) {
  const order = [TACTILE_VIEW_MODES.LOCAL, TACTILE_VIEW_MODES.MAP, TACTILE_VIEW_MODES.GOAL];
  const index = order.indexOf(mode);
  return order[(index + 1 + order.length) % order.length];
}
