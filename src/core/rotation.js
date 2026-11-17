export class RotationClock {
  constructor(intervalMs = 20000, now = 0) { this.interval = intervalMs; this.anchor = now; this.resumeAt = 0; }
  reset(now) { this.anchor = now; }
  interact(now, pauseMs) { this.resumeAt = now + pauseMs; this.anchor = this.resumeAt; }
  configure(intervalMs, now) { this.interval = intervalMs; this.reset(now); }
  tick(now, blocked = false) {
    if (blocked) { this.anchor = now; return false; }
    if (now < this.resumeAt) return false;
    if (now - this.anchor >= this.interval) { this.anchor = now; return true; }
    return false;
  }
  progress(now) { return Math.max(0, Math.min(1, (now - this.anchor) / this.interval)); }
}
export function swipeDirection(start, end, threshold = 48) {
  const dx = end.x - start.x, dy = end.y - start.y;
  return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.3 ? (dx < 0 ? 1 : -1) : 0;
}
