import {
  GAME_TACTILE_GRID,
  GAME_TACTILE_LIMITS,
  GAME_TACTILE_PRIORITY,
  TACTILE_VIEW_MODES,
} from './standard.js';
import { GAME_TACTILE_SYMBOLS, GAME_TACTILE_TYPES, SYMBOL_SHAPES } from './symbols.js';

function emptyGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(GAME_TACTILE_TYPES.EMPTY));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function viewBounds(state, mode) {
  const world = state.world || { minX: -26, maxX: 26, minZ: -17, maxZ: 17 };
  if (mode === TACTILE_VIEW_MODES.MAP) return world;
  return {
    minX: state.player.x - GAME_TACTILE_GRID.localWorldWidth / 2,
    maxX: state.player.x + GAME_TACTILE_GRID.localWorldWidth / 2,
    minZ: state.player.z - GAME_TACTILE_GRID.localWorldHeight / 2,
    maxZ: state.player.z + GAME_TACTILE_GRID.localWorldHeight / 2,
  };
}

function createProjector(bounds, width, height) {
  const rangeX = Math.max(1, bounds.maxX - bounds.minX);
  const rangeZ = Math.max(1, bounds.maxZ - bounds.minZ);
  return (point, clampToEdge = false) => {
    const rawX = 2 + ((point.x - bounds.minX) / rangeX) * (width - 5);
    const rawY = 2 + ((point.z - bounds.minZ) / rangeZ) * (height - 5);
    const inside = rawX >= 2 && rawX <= width - 3 && rawY >= 2 && rawY <= height - 3;
    if (!inside && !clampToEdge) return null;
    return {
      x: Math.round(Math.max(2, Math.min(width - 3, rawX))),
      y: Math.round(Math.max(2, Math.min(height - 3, rawY))),
      inside,
    };
  };
}

function drawShape(grid, priorities, shape, center, type, priority) {
  if (!center) return;
  const originX = center.x - Math.floor(shape[0].length / 2);
  const originY = center.y - Math.floor(shape.length / 2);
  shape.forEach((row, dy) => {
    row.forEach((on, dx) => {
      if (!on) return;
      setCell(grid, priorities, originX + dx, originY + dy, type, priority);
    });
  });
}

function setCell(grid, priorities, x, y, type, priority) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;
  if (priority < priorities[y][x]) return;
  priorities[y][x] = priority;
  grid[y][x] = type;
}

function drawLine(grid, priorities, from, to, type, priority, dotted = false) {
  if (!from || !to) return;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  let x = from.x;
  let y = from.y;
  let index = 0;
  while (true) {
    if (!dotted || index % 2 === 0) setCell(grid, priorities, x, y, type, priority);
    if (x === to.x && y === to.y) break;
    const twice = error * 2;
    if (twice > -dy) { error -= dy; x += sx; }
    if (twice < dx) { error += dx; y += sy; }
    index += 1;
  }
}

function drawWall(grid, priorities, wall, project, bounds, filled) {
  if (
    wall.x + wall.w / 2 < bounds.minX
    || wall.x - wall.w / 2 > bounds.maxX
    || wall.z + wall.d / 2 < bounds.minZ
    || wall.z - wall.d / 2 > bounds.maxZ
  ) return false;
  const corners = [
    project({ x: wall.x - wall.w / 2, z: wall.z - wall.d / 2 }, true),
    project({ x: wall.x + wall.w / 2, z: wall.z + wall.d / 2 }, true),
  ];
  if (!corners[0] || !corners[1]) return false;
  const x0 = Math.min(corners[0].x, corners[1].x);
  const x1 = Math.max(corners[0].x, corners[1].x);
  const y0 = Math.min(corners[0].y, corners[1].y);
  const y1 = Math.max(corners[0].y, corners[1].y);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) {
        setCell(grid, priorities, x, y, GAME_TACTILE_TYPES.WALL, GAME_TACTILE_PRIORITY.wall);
      }
    }
  }
  return true;
}

function drawPlayer(grid, priorities, center, direction) {
  drawShape(
    grid,
    priorities,
    SYMBOL_SHAPES.player,
    center,
    GAME_TACTILE_TYPES.PLAYER,
    GAME_TACTILE_PRIORITY.player,
  );
  const tails = {
    up: { x: 0, y: -2 },
    down: { x: 0, y: 2 },
    left: { x: -2, y: 0 },
    right: { x: 2, y: 0 },
  };
  const tail = tails[direction] || tails.down;
  setCell(
    grid,
    priorities,
    center.x + tail.x,
    center.y + tail.y,
    GAME_TACTILE_TYPES.PLAYER,
    GAME_TACTILE_PRIORITY.player,
  );
}

function changedRatio(grid, previousGrid) {
  if (!Array.isArray(previousGrid) || previousGrid.length !== grid.length) return 1;
  let changed = 0;
  let total = 0;
  grid.forEach((row, y) => row.forEach((value, x) => {
    total += 1;
    if (!previousGrid[y] || previousGrid[y][x] !== value) changed += 1;
  }));
  return total ? changed / total : 0;
}

function safeDirections(state) {
  if (Array.isArray(state.safeDirections)) return state.safeDirections;
  return ['up', 'down', 'left', 'right'];
}

function nearestDangerDistance(state) {
  const distances = (state.hazards || []).map((hazard) => distance(hazard, state.player));
  return distances.length ? Math.min(...distances) : Infinity;
}

export function renderStateToGrid(state, options = {}) {
  const width = options.width || GAME_TACTILE_GRID.width;
  const height = options.height || GAME_TACTILE_GRID.height;
  const mode = options.mode || TACTILE_VIEW_MODES.LOCAL;
  const grid = emptyGrid(width, height);
  const priorities = emptyGrid(width, height);
  const bounds = viewBounds(state, mode);
  const project = createProjector(bounds, width, height);
  const playerPoint = mode === TACTILE_VIEW_MODES.MAP
    ? project(state.player, true)
    : { x: Math.floor(width / 2), y: Math.floor(height / 2), inside: true };

  let visibleWalls = 0;
  let visibleDangers = 0;
  let visibleInteractables = 0;
  const dangerRadius = mode === TACTILE_VIEW_MODES.MAP ? Infinity : 9;

  if (mode !== TACTILE_VIEW_MODES.GOAL) {
    (state.walls || []).forEach((wall) => {
      const filled = distance(wall, state.player) < 3;
      if (drawWall(grid, priorities, wall, project, bounds, filled)) visibleWalls += 1;
    });
  }

  const hazards = (mode === TACTILE_VIEW_MODES.MAP ? [] : (state.hazards || []))
    .map((hazard) => ({ ...hazard, distance: distance(hazard, state.player) }))
    .filter((hazard) => hazard.distance <= dangerRadius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, GAME_TACTILE_LIMITS.maxDangerObjects);

  const remainingSlots = Math.max(0, GAME_TACTILE_LIMITS.maxCoreObjects - 2 - hazards.length);
  const interactables = (mode === TACTILE_VIEW_MODES.LOCAL ? (state.interactables || []) : [])
    .map((object) => ({ ...object, distance: distance(object, state.player) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(GAME_TACTILE_LIMITS.maxInteractableObjects, remainingSlots));

  if (mode !== TACTILE_VIEW_MODES.GOAL) {
    interactables.forEach((object) => {
      const point = project(object);
      if (!point) return;
      drawShape(
        grid,
        priorities,
        SYMBOL_SHAPES.interactable,
        point,
        GAME_TACTILE_TYPES.INTERACTABLE,
        GAME_TACTILE_PRIORITY.interactableObject,
      );
      visibleInteractables += 1;
    });
  }

  hazards.forEach((hazard) => {
    const point = project(hazard, true);
    drawShape(
      grid,
      priorities,
      SYMBOL_SHAPES.danger,
      point,
      GAME_TACTILE_TYPES.DANGER,
      GAME_TACTILE_PRIORITY.dangerNearPlayer,
    );
    visibleDangers += 1;
  });

  let goalPoint = null;
  if (state.goal) {
    goalPoint = project(state.goal, true);
    if (mode === TACTILE_VIEW_MODES.GOAL) {
      drawLine(
        grid,
        priorities,
        playerPoint,
        goalPoint,
        GAME_TACTILE_TYPES.PATH,
        GAME_TACTILE_PRIORITY.path,
        true,
      );
    }
    const isExit = state.goal.kind === 'exit';
    drawShape(
      grid,
      priorities,
      isExit ? SYMBOL_SHAPES.exit : SYMBOL_SHAPES.goal,
      goalPoint,
      isExit ? GAME_TACTILE_TYPES.EXIT : GAME_TACTILE_TYPES.GOAL,
      GAME_TACTILE_PRIORITY.currentGoal,
    );
  }

  drawPlayer(grid, priorities, playerPoint, state.player.direction);

  const types = [...new Set(grid.flat().filter(Boolean))];
  const metadata = {
    mode,
    playerGridPosition: playerPoint,
    goalGridPosition: goalPoint,
    goalDirection: state.goal ? directionLabel(state.player, state.goal) : '없음',
    visibleWalls,
    visibleDangers,
    visibleInteractables,
    coreObjectCount: 1 + (state.goal ? 1 : 0) + visibleDangers + visibleInteractables,
    patternTypes: types,
    patternTypeCount: types.length,
    safeDirections: safeDirections(state),
    nearestDangerDistance: nearestDangerDistance(state),
    dangerDisplayRadius: dangerRadius,
    dangerRequired: mode !== TACTILE_VIEW_MODES.MAP,
    independentInput: state.independentInput !== false,
    ttsAvailable: state.ttsAvailable !== false,
    changedAreaRatio: changedRatio(grid, options.previousGrid),
    simplified: visibleInteractables < Math.min((state.interactables || []).length, GAME_TACTILE_LIMITS.maxInteractableObjects),
  };

  return { grid, metadata };
}

export function directionLabel(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizontal = Math.abs(dx) > 0.4 ? (dx < 0 ? '왼쪽' : '오른쪽') : '';
  const vertical = Math.abs(dz) > 0.4 ? (dz < 0 ? '위' : '아래') : '';
  if (horizontal && vertical) return `${horizontal} ${vertical}`;
  return horizontal || vertical || '현재 위치';
}

export function tactileLegendText(mode) {
  const common = [
    `${GAME_TACTILE_SYMBOLS.player.name}: ${GAME_TACTILE_SYMBOLS.player.description}`,
    `${GAME_TACTILE_SYMBOLS.goal.name}: ${GAME_TACTILE_SYMBOLS.goal.description}`,
    `${GAME_TACTILE_SYMBOLS.danger.name}: ${GAME_TACTILE_SYMBOLS.danger.description}`,
  ];
  if (mode !== TACTILE_VIEW_MODES.GOAL) {
    common.push(`${GAME_TACTILE_SYMBOLS.wall.name}: ${GAME_TACTILE_SYMBOLS.wall.description}`);
    common.push(`${GAME_TACTILE_SYMBOLS.interactable.name}: ${GAME_TACTILE_SYMBOLS.interactable.description}`);
  } else {
    common.push(`${GAME_TACTILE_SYMBOLS.path.name}: ${GAME_TACTILE_SYMBOLS.path.description}`);
  }
  return common.join('. ');
}
