export const GAME_INPUT_MAP = Object.freeze({
  PanningLeft: 'move_left',
  PanningRight: 'move_right',
  LPF1: 'move_up',
  RPF4: 'move_down',
  KeyFunction1: 'read_current_position',
  KeyFunction2: 'confirm_or_interact',
  KeyFunction3: 'read_current_mission',
  KeyFunction4: 'scan_surroundings',
  PanningAll: 'cycle_tactile_view',
  KeyFunction12: 'confirm_or_interact',
  KeyFunction13: 'confirm_or_interact',
  KeyFunction14: 'confirm_or_interact',
  KeyFunction23: 'confirm_or_interact',
  KeyFunction24: 'confirm_or_interact',
  KeyFunction34: 'confirm_or_interact',
});

export const KEYBOARD_INPUT_MAP = Object.freeze({
  ArrowUp: 'move_up',
  w: 'move_up',
  ArrowDown: 'move_down',
  s: 'move_down',
  ArrowLeft: 'move_left',
  a: 'move_left',
  ArrowRight: 'move_right',
  d: 'move_right',
  Enter: 'confirm_or_interact',
  ' ': 'confirm_or_interact',
  '1': 'read_current_position',
  '2': 'confirm_or_interact',
  '3': 'read_current_mission',
  '4': 'scan_surroundings',
  Escape: 'back_or_close',
});

export function resolveDotPadAction(key) {
  return GAME_INPUT_MAP[key] || 'unmapped';
}
