import { GAME_TACTILE_LIMITS } from './standard.js';
import { GAME_TACTILE_TYPES } from './symbols.js';

function countType(grid, type) {
  return grid.reduce((total, row) => total + row.filter((value) => value === type).length, 0);
}

function ratingFor(score) {
  if (score >= 85) return '매우 좋음';
  if (score >= 70) return '좋음';
  if (score >= 40) return '보통';
  return '낮음';
}

export function calculateGameTactilePlayabilityScore(state, tactileGrid, metadata = {}) {
  const patternTypes = new Set(tactileGrid.flat().filter(Boolean));
  const playerDots = countType(tactileGrid, GAME_TACTILE_TYPES.PLAYER);
  const dangerDots = countType(tactileGrid, GAME_TACTILE_TYPES.DANGER);
  const goalDots = countType(tactileGrid, GAME_TACTILE_TYPES.GOAL) + countType(tactileGrid, GAME_TACTILE_TYPES.EXIT);
  const interactableDots = countType(tactileGrid, GAME_TACTILE_TYPES.INTERACTABLE);
  const checks = [
    { key: 'player', pass: playerDots >= 4, message: '현재 위치를 즉시 찾을 수 있습니다.' },
    { key: 'movement', pass: (metadata.safeDirections || []).length > 0, message: '이동 가능한 방향이 계산되어 있습니다.' },
    { key: 'danger', pass: metadata.dangerRequired === false || !(state.hazards || []).length || dangerDots > 0 || metadata.nearestDangerDistance > metadata.dangerDisplayRadius, message: '가까운 위험 방향이 구분됩니다.' },
    { key: 'goal', pass: !state.goal || goalDots > 0, message: '현재 목표 방향이 표시됩니다.' },
    { key: 'interactable', pass: !(metadata.visibleInteractables > 0) || interactableDots > 0, message: '상호작용 대상이 별도 패턴으로 구분됩니다.' },
    { key: 'objects', pass: (metadata.coreObjectCount || 0) <= GAME_TACTILE_LIMITS.maxCoreObjects, message: '핵심 객체 수가 제한 안에 있습니다.' },
    { key: 'patterns', pass: patternTypes.size <= GAME_TACTILE_LIMITS.maxPatternTypes, message: '패턴 종류가 과하지 않습니다.' },
    { key: 'input', pass: metadata.independentInput !== false, message: 'DotPad와 키보드 입력으로 독립 조작할 수 있습니다.' },
    { key: 'tactileOnly', pass: playerDots >= 4 && goalDots > 0 && (metadata.safeDirections || []).length > 0, message: 'TTS 없이도 위치와 목표의 기본 관계를 파악할 수 있습니다.' },
    { key: 'tts', pass: metadata.ttsAvailable !== false, message: 'TTS를 함께 사용하면 상황과 실패 이유를 확인할 수 있습니다.' },
  ];

  const score = checks.reduce((total, check) => total + (check.pass ? 10 : 0), 0);
  const failed = checks.filter((check) => !check.pass);
  return {
    score,
    rating: ratingFor(score),
    summary: failed.length ? `${failed[0].key} 항목을 개선해야 합니다.` : '현재 위치와 목표 방향이 명확합니다.',
    checks,
    patternTypeCount: patternTypes.size,
  };
}
