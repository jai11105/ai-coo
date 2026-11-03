// Slice 7 Stage 1 — provider-agnostic tool loop driver (mock-testable).
// providers.ts supplies the live chat fn; tests inject a fake provider.
import { MAX_TOOL_CALLS_PER_TURN, MAX_TOOL_ROUNDS, TOOL_LOOP_TIMEOUT_MS } from "./tool-defs";
import type { ToolResult } from "./tool-run";
export interface LoopMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string; toolCallId?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}
export interface LoopProvider {
  chat(messages: LoopMsg[]): Promise<{ text: string; toolCalls: { id: string; name: string; args: Record<string, unknown> }[] }>;
}
export interface LoopOutcome {
  text: string; rounds: number; toolResults: ToolResult[];
  timedOut: boolean; hitIterationLimit: boolean;
}
export async function runToolLoop(opts: {
  provider: LoopProvider;
  startMessages: LoopMsg[];
  exec: (c: { id: string; name: string; args: Record<string, unknown> }) => ToolResult | Promise<ToolResult>;
  maxRounds?: number; timeoutMs?: number;
}): Promise<LoopOutcome> {
  const maxRounds = opts.maxRounds ?? MAX_TOOL_ROUNDS;
  const timeoutMs = opts.timeoutMs ?? TOOL_LOOP_TIMEOUT_MS;
  const started = Date.now();
  const messages = [...opts.startMessages];
  const toolResults: ToolResult[] = [];
  let rounds = 0;
  let timedOut = false;
  for (let r = 0; r < maxRounds; r++) {
    if (Date.now() - started > timeoutMs) { timedOut = true; break; }
    rounds += 1;
    const res = await opts.provider.chat(messages);
    const calls = (res.toolCalls ?? []).slice(0, MAX_TOOL_CALLS_PER_TURN);
    if (calls.length === 0) return { text: res.text, rounds, toolResults, timedOut, hitIterationLimit: false };
    messages.push({ role: "assistant", content: res.text || "", toolCalls: calls });
    for (const c of calls) {
      if (Date.now() - started > timeoutMs) { timedOut = true; break; }
      let tr: ToolResult;
      try { tr = await opts.exec(c); } catch (e) {
        tr = { ok: false, tool: String(c.name), toolCallId: c.id, error: e instanceof Error ? e.message.slice(0, 300) : "Tool execution failed." };
      }
      toolResults.push(tr);
    }
    if (timedOut) break;
  }
  if (timedOut || toolResults.length === 0) return { text: "", rounds, toolResults, timedOut, hitIterationLimit: true };
  // Budget exhausted with results: final compose pass.
  if (Date.now() - started <= timeoutMs) {
    try {
      const fin = await opts.provider.chat([
        ...messages,
        { role: "user", content: "Tool budget exhausted. Compose the final owner-facing answer from verified tool results only. Never invent figures." },
      ]);
      if (fin.text) return { text: fin.text, rounds, toolResults, timedOut, hitIterationLimit: true };
    } catch { /* fall through */ }
  }
  return { text: "", rounds, toolResults, timedOut, hitIterationLimit: true };
}
