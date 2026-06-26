export const GAME_TACTILE_TYPES = Object.freeze({
  EMPTY: 0,
  PATH: 2,
  WALL: 5,
  INTERACTABLE: 6,
  DANGER: 7,
  PLAYER: 8,
  GOAL: 9,
  EXIT: 10,
});

export const GAME_TACTILE_SYMBOLS = Object.freeze({
  player: {
    name: '플레이어',
    pattern: 'BLOCK_2X2',
    description: '중앙의 강한 2×2 블록과 방향 꼬리',
    type: GAME_TACTILE_TYPES.PLAYER,
  },
  wall: {
    name: '벽 / 장애물',
    pattern: 'SOLID_LINE',
    description: '연속된 굵은 선',
    type: GAME_TACTILE_TYPES.WALL,
  },
  path: {
    name: '이동 가능 길',
    pattern: 'EMPTY_OR_LIGHT_DOTS',
    description: '빈 공간 또는 약한 점',
    type: GAME_TACTILE_TYPES.PATH,
  },
  goal: {
    name: '목표',
    pattern: 'BLINK_POINT',
    description: '중심점이 있는 다이아몬드 또는 가장자리 방향 마커',
    type: GAME_TACTILE_TYPES.GOAL,
  },
  danger: {
    name: '위험',
    pattern: 'PULSE_EDGE',
    description: 'X 패턴 또는 위험 방향 가장자리 경고',
    type: GAME_TACTILE_TYPES.DANGER,
  },
  interactable: {
    name: '상호작용 가능',
    pattern: 'DOT_CLUSTER_3',
    description: '삼각형 3점 클러스터',
    type: GAME_TACTILE_TYPES.INTERACTABLE,
  },
  collectible: {
    name: '수집물',
    pattern: 'DOT_CLUSTER_3',
    description: '삼각형 3점 클러스터와 수집 피드백',
    type: GAME_TACTILE_TYPES.INTERACTABLE,
  },
  exit: {
    name: '출구 / 문',
    pattern: 'OPEN_GATE',
    description: '열린 ㄷ자 형태',
    type: GAME_TACTILE_TYPES.EXIT,
  },
});

export const SYMBOL_SHAPES = Object.freeze({
  player: [
    [1, 1],
    [1, 1],
  ],
  interactable: [
    [1, 0, 1],
    [0, 1, 0],
  ],
  danger: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  goal: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  exit: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
});
