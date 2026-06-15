/* ===========================================================
   Dot Forest — area / zone definitions (pure data)
   Keys match narrative.json locations. Each area defines its
   palette, player entry, collectible dotrings, drifting shadow
   hazards, tree obstacles, and a gated exit to the next zone.
   =========================================================== */

export const AREAS = {
  forest_entrance: {
    name: '숲의 입구',
    palette: { ground: 0x72ad65, path: 0xcdbb80, pebble: 0xe7d8a4 },
    playerStart: { x: -20, z: 10 },
    items: [
      { id: 'fe-1', x: -14, z: -7, collected: false },
      { id: 'fe-2', x: -2, z: -11, collected: false },
      { id: 'fe-3', x: 11, z: -5, collected: false },
      { id: 'fe-4', x: -9, z: 2, collected: false },
    ],
    hazards: [
      { id: 'fe-h1', x: 6, z: -2, vx: 2.2, vz: 1.6 },
      { id: 'fe-h2', x: -6, z: 6, vx: -1.8, vz: 2.1 },
    ],
    obstacles: [
      { x: -20, z: -7, w: 5, d: 6 },
      { x: 1, z: 4, w: 6, d: 5 },
      { x: 20, z: -11, w: 5, d: 7 },
    ],
    exit: { x: 24, z: 8, r: 3.4, to: 'berry_grove', needFlag: 'pipFound', lockedMsg: '아직 길이 막혀 있어요. 먼저 Pip를 찾아 주세요.' },
  },

  berry_grove: {
    name: '베리 숲',
    palette: { ground: 0x8fc66a, path: 0xd8c98a, pebble: 0xeadfa6 },
    playerStart: { x: -22, z: 0 },
    items: [
      { id: 'bg-1', x: -6, z: -6, collected: false },
      { id: 'bg-2', x: 4, z: -2, collected: false },
      { id: 'bg-3', x: 12, z: 4, collected: false },
      { id: 'bg-4', x: 0, z: 8, collected: false },
    ],
    hazards: [
      { id: 'bg-h1', x: 8, z: -4, vx: 2.4, vz: 1.8 },
      { id: 'bg-h2', x: -4, z: 6, vx: -2.0, vz: 1.9 },
      { id: 'bg-h3', x: 16, z: 2, vx: 1.6, vz: -2.2 },
    ],
    obstacles: [
      { x: -18, z: -8, w: 5, d: 6 },
      { x: 2, z: 6, w: 6, d: 5 },
      { x: 18, z: -10, w: 5, d: 7 },
    ],
    exit: { x: 0, z: -16, r: 3.4, to: 'river', needFlag: 'ch2done', lockedMsg: '아직 길이 막혀 있어요. 먼저 베리 3개를 모아 Bramble을 도와주세요.' },
  },

  river: {
    name: '강가',
    palette: { ground: 0x6fb6a0, path: 0xcfc089, pebble: 0xdfe6c0 },
    playerStart: { x: -22, z: 6 },
    items: [
      { id: 'rv-1', x: -19, z: 4, collected: false },
      { id: 'rv-2', x: 2, z: 4, collected: false },
      { id: 'rv-3', x: 18, z: -1, collected: false },
    ],
    hazards: [
      { id: 'rv-h1', x: 4, z: 2, vx: 2.6, vz: 1.5 },
      { id: 'rv-h2', x: -6, z: -2, vx: -2.2, vz: 2.0 },
      { id: 'rv-h3', x: 16, z: 4, vx: 1.4, vz: -2.4 },
    ],
    obstacles: [
      { x: -16, z: -6, w: 5, d: 6 },
      { x: 6, z: 10, w: 6, d: 5 },
    ],
    exit: null,
    // 돌다리 건너기 퍼즐: 물 구역 안에서는 안전한 돌(침묵) 위로만 디딜 수 있고
    // 깊은 물(노래)로는 들어갈 수 없다. 건너편 goal에 닿으면 Echo를 구한다.
    crossing: {
      water: { xMin: -14, xMax: 14, zMin: -3, zMax: 11 },
      stoneRadius: 2.6,
      stones: [
        { x: -12, z: 8 }, { x: -9, z: 6 }, { x: -6, z: 5 }, { x: -2, z: 4 },
        { x: 2, z: 4 }, { x: 6, z: 3 }, { x: 10, z: 2 }, { x: 13, z: 0 },
      ],
      goal: { x: 18, z: -1, r: 3 },
    },
  },
};

export const AREA_ORDER = ['forest_entrance', 'berry_grove', 'river'];
