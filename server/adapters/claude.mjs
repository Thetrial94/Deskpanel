// Integration intentionally deferred. No Claude data or credentials are accessed.
export async function readClaudeStatus() {
  return { id: 'claude', name: 'Claude', connection: 'not_configured', sessions: [], updatedAt: null };
}
