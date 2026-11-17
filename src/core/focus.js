export const FOCUS_KEY = 'deskpanel.focus.v1';
export class FocusTimer {
  constructor(storage) {
    this.storage = storage;
    let value; try { value = JSON.parse(storage?.getItem(FOCUS_KEY) || '{}'); } catch { value = {}; }
    this.duration = [15,25,45,60].includes(value?.duration) ? value.duration : 25;
    this.deadline = Number.isFinite(value?.deadline) && value.deadline > 0 ? value.deadline : null;
    this.remaining = Number.isFinite(value?.remaining) ? Math.max(0, Math.min(value.remaining,this.duration*60)) : this.duration*60;
    this.completed = value?.completed === true;
  }
  save() { try { this.storage?.setItem(FOCUS_KEY,JSON.stringify({duration:this.duration,deadline:this.deadline,remaining:this.remaining,completed:this.completed})); } catch {} }
  seconds(now = Date.now()) { return this.deadline ? Math.max(0,Math.ceil((this.deadline-now)/1000)) : this.remaining; }
  start(now = Date.now()) { if (this.deadline) return; if (this.remaining <= 0) this.remaining = this.duration*60; this.deadline = now+this.remaining*1000; this.completed = false; this.save(); }
  pause(now = Date.now()) { this.remaining = this.seconds(now); this.deadline = null; this.save(); }
  reset() { this.deadline = null; this.remaining = this.duration*60; this.completed = false; this.save(); }
  setDuration(minutes) { if (![15,25,45,60].includes(minutes)) return; this.duration = minutes; this.reset(); }
  tick(now = Date.now()) {
    if (this.deadline && this.seconds(now) === 0) { this.deadline = null; this.remaining = 0; this.completed = true; this.save(); return true; }
    return false;
  }
}
