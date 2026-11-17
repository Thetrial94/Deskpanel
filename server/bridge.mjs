import { readCodexStatus } from './adapters/codex.mjs';
import { readClaudeStatus } from './adapters/claude.mjs';
export async function readAgentSnapshot() {
  const providers = await Promise.all([readCodexStatus(), readClaudeStatus()]);
  return { schemaVersion: 1, providers };
}
