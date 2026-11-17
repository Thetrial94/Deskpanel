// Integration intentionally deferred. Do not infer activity from a running process.
export async function readCodexStatus() {
  return { id: 'codex', name: 'Codex', connection: 'not_configured', sessions: [], updatedAt: null };
}
