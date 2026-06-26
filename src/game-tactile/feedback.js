export const GAME_FEEDBACK_PATTERNS = Object.freeze({
  moveSuccess: {
    tactile: 'player_position_update',
    sound: 'soft_step',
    priority: 60,
  },
  blocked: {
    tactile: 'edge_block_pulse',
    sound: 'blocked',
    priority: 85,
  },
  itemFound: {
    tactile: 'item_cluster_pulse',
    sound: 'found',
    priority: 70,
  },
  dangerNear: {
    tactile: 'danger_direction_pulse',
    sound: 'warning',
    priority: 95,
  },
  goalReached: {
    tactile: 'success_full_pattern',
    sound: 'success',
    priority: 100,
  },
});

export function generateFeedback(type, context = {}) {
  const pattern = GAME_FEEDBACK_PATTERNS[type] || GAME_FEEDBACK_PATTERNS.moveSuccess;
  const direction = context.directionLabel || '';
  const messages = {
    moveSuccess: `${direction} 이동했어요.`,
    blocked: `${direction || '그 방향'}은 막혀 있어요.`,
    itemFound: `${direction || '가까이'}에 상호작용 가능한 도트링이 있어요.`,
    dangerNear: `${direction || '가까이'}에 위험이 있어요.`,
    goalReached: '목표에 도착했어요.',
  };
  return {
    ...pattern,
    speech: context.speech || messages[type] || messages.moveSuccess,
  };
}

export class GameFeedbackGate {
  constructor(cooldownMs = 450) {
    this.cooldownMs = cooldownMs;
    this.lastAt = new Map();
  }

  shouldEmit(type, priority = 0) {
    const now = Date.now();
    const last = this.lastAt.get(type) || 0;
    if (priority < 90 && now - last < this.cooldownMs) return false;
    this.lastAt.set(type, now);
    return true;
  }
}
