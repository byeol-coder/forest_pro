/* ===========================================================
   Dot Forest — pure gameplay mechanics (no three / no DOM)
   Combined-upgrade core, isolated so it can be unit-tested.
   - Pappu Pakia: collect + avoid loop (hazard motion, threat, scoring)
   - Save the Forest / Heal 'em All: "forest light" restoration mapping
   =========================================================== */

export const TUNING = {
  WARN_RADIUS: 7,     // distance at which a hazard starts warning (audio)
  HIT_RADIUS: 2.2,    // distance at which a hazard "dims the light"
  HIT_PENALTY: 0.12,  // forest light lost per hazard contact
};

export function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/* Roving hazard: drift by velocity, bounce inside world bounds [-bx,bx]×[-bz,bz]. */
export function wanderStep(h, dt, bx, bz) {
  h.x += h.vx * dt;
  h.z += h.vz * dt;
  if (h.x < -bx) { h.x = -bx; h.vx = Math.abs(h.vx); }
  else if (h.x > bx) { h.x = bx; h.vx = -Math.abs(h.vx); }
  if (h.z < -bz) { h.z = -bz; h.vz = Math.abs(h.vz); }
  else if (h.z > bz) { h.z = bz; h.vz = -Math.abs(h.vz); }
  return h;
}

/* Classify a hazard relative to the player.
   Returns level ('clear'|'near'|'hit'), stereo pan (-1 left .. +1 right),
   and intensity (0..1, louder when closer). */
export function threat(player, hazard, warn = TUNING.WARN_RADIUS, hit = TUNING.HIT_RADIUS) {
  const d = dist2D(player, hazard);
  const level = d <= hit ? 'hit' : d <= warn ? 'near' : 'clear';
  const pan = Math.max(-1, Math.min(1, (hazard.x - player.x) / warn));
  const intensity = level === 'clear' ? 0 : Math.max(0, 1 - d / warn);
  return { d, level, pan, intensity };
}

/* Forest light (0..1) from collection progress. */
export function lightFromProgress(collected, total) {
  return total > 0 ? Math.max(0, Math.min(1, collected / total)) : 0;
}
export function applyHit(light, penalty = TUNING.HIT_PENALTY) {
  return Math.max(0, light - penalty);
}

/* Is the player within an exit zone? exit = {x,z,r}. */
export function atExit(player, exit) {
  if (!exit) return false;
  return Math.hypot(player.x - exit.x, player.z - exit.z) <= (exit.r || 3);
}

/* ---- river stone-crossing puzzle (silent stone = safe, singing water = deep) ---- */
export function inRect(p, r) {
  return p.x >= r.xMin && p.x <= r.xMax && p.z >= r.zMin && p.z <= r.zMax;
}
export function onStone(p, stones, radius) {
  return stones.some((s) => Math.hypot(p.x - s.x, p.z - s.z) <= radius);
}
/* A position is "deep" (blocked) if it's inside the water rect but not on a stone. */
export function riverStep(next, crossing) {
  if (!crossing) return { safe: true, deep: false };
  const deep = inRect(next, crossing.water) && !onStone(next, crossing.stones, crossing.stoneRadius);
  return { safe: !deep, deep };
}
export function atGoal(p, goal) {
  return !!goal && Math.hypot(p.x - goal.x, p.z - goal.z) <= (goal.r || 3);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

/* Map forest light (0 = the dark that swallowed the light, 1 = restored)
   to scene parameters. Brighter as the forest heals. */
export function lightToScene(light) {
  const t = Math.max(0, Math.min(1, light));
  return {
    bg: lerpColor(0x223047, 0xdff3ff, t),   // murky dusk -> bright sky
    fogNear: lerp(26, 58, t),
    fogFar: lerp(88, 128, t),
    exposure: lerp(0.7, 1.18, t),
  };
}
