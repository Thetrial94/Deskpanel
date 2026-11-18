export class AgentSource {
  constructor() { this.snapshot = { codex: {connection:'not_configured',sessions:[]}, claude: {connection:'not_configured',sessions:[]} }; this.listeners = new Set(); this.pending = false; }
  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot); return () => this.listeners.delete(fn); }
  async refresh(force=false) {
    if (this.pending) {this.refreshQueued=this.refreshQueued||force;return;}
    this.pending = true; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/agents', {signal:controller.signal,cache:'no-store'});
      if(response.status===403){for(const id of ['codex','claude'])this.snapshot[id]={connection:'pair_required',sessions:[]};return;}
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.providers)) throw new Error('invalid');
      for (const id of ['codex','claude']) {
        const provider = data.providers.find(p => p.id === id);
        this.snapshot[id] = provider && ['not_configured','connected','disconnected','awaiting_events'].includes(provider.connection) && Array.isArray(provider.sessions)
          ? provider : {connection:'disconnected',sessions:[]};
      }
    } catch { for (const id of ['codex','claude']) this.snapshot[id] = {connection:'disconnected',sessions:[]}; }
    finally { clearTimeout(timer); this.pending = false; for (const fn of this.listeners) fn(this.snapshot);if(this.refreshQueued){this.refreshQueued=false;this.refresh(true);} }
  }
}
