import { DOTPAD_GAME_STREAM } from './standard.js';

export class DotPadGameStream {
  constructor(options = {}) {
    this.toHex = options.toHex;
    this.send = options.send;
    this.onStatus = options.onStatus || (() => {});
    this.minIntervalMs = options.minIntervalMs || DOTPAD_GAME_STREAM.minIntervalMs;
    this.skipIfSameHex = options.skipIfSameHex !== false;
    this.lastHex = '';
    this.lastSentAt = 0;
    this.pending = null;
    this.timer = null;
  }

  request(matrix, options = {}) {
    const reason = options.reason || 'game-state';
    const priority = Number(options.priority || 50);
    const force = !!options.force;
    const hex = this.toHex(matrix);

    if (this.skipIfSameHex && !force && hex === this.lastHex) {
      const result = { ok: true, skipped: true, duplicate: true, reason, message: 'Skipped duplicate tactile frame' };
      this.onStatus({ ...result, lastSentAt: this.lastSentAt, pending: false });
      return Promise.resolve(result);
    }

    return new Promise((resolve) => {
      const request = { matrix, hex, reason, priority, force, resolvers: [resolve], requestedAt: Date.now() };
      if (this.pending) {
        if (priority >= this.pending.priority) {
          request.resolvers.push(...this.pending.resolvers);
          this.pending = request;
        } else {
          this.pending.resolvers.push(resolve);
        }
      } else {
        this.pending = request;
      }
      this.schedule();
    });
  }

  schedule() {
    if (!this.pending || this.timer) return;
    const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastSentAt));
    this.timer = setTimeout(() => this.flush(), wait);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const request = this.pending;
    this.pending = null;
    if (!request) return;

    let result;
    try {
      result = await this.send(request.matrix, request.reason);
      if (result && (result.ok || result.skipped)) {
        this.lastHex = request.hex;
        this.lastSentAt = Date.now();
      }
    } catch (error) {
      result = { ok: false, message: error && error.message ? error.message : String(error) };
    }
    request.resolvers.forEach((resolve) => resolve(result));
    this.onStatus({
      ...result,
      reason: request.reason,
      priority: request.priority,
      lastSentAt: this.lastSentAt,
      latencyMs: Date.now() - request.requestedAt,
      pending: !!this.pending,
    });
    if (this.pending) this.schedule();
  }

  resetDuplicateGuard() {
    this.lastHex = '';
  }

  getStatus() {
    return {
      lastSentAt: this.lastSentAt,
      pending: !!this.pending,
      minIntervalMs: this.minIntervalMs,
      skipIfSameHex: this.skipIfSameHex,
    };
  }
}
