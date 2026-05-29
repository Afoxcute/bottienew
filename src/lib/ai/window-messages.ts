import type { UIMessage } from "ai";
import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";

const RECENT_WINDOW = 20;
const MAX_RECAP_LINES = 30;

const ACTION_TOOLS = new Set([
  "deposit",
  "withdraw",
  "swap",
  "swap_and_deposit",
  "create_goal",
]);

interface ToolPart {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: Record<string, string>;
  output?: unknown;
}

function formatActionFact(toolName: string, input: Record<string, string>, output: unknown): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof output === "string" ? JSON.parse(output) : (output as Record<string, unknown>) ?? {};
  } catch {
    parsed = {};
  }

  const failed = parsed.success === false;
  const cancelled = failed && String(parsed.error || "").toLowerCase().includes("cancel");

  let line: string;

  switch (toolName) {
    case "deposit":
      line = cancelled
        ? `User cancelled deposit of ${input.amount} ${input.tokenSymbol}`
        : `Saved ${input.amount} ${input.tokenSymbol} into ${VAULT_FRIENDLY_NAMES[input.vaultId] || input.vaultId}`;
      break;
    case "withdraw":
      line = cancelled
        ? `User cancelled withdrawal of ${input.amount} ${input.tokenSymbol}`
        : `Withdrew ${input.amount} ${input.tokenSymbol} from ${VAULT_FRIENDLY_NAMES[input.vaultId] || input.vaultId}`;
      break;
    case "swap":
      line = cancelled
        ? `User cancelled swap of ${input.sellAmount} ${input.sellToken}`
        : `Swapped ${input.sellAmount} ${input.sellToken} to ${input.buyToken}`;
      break;
    case "swap_and_deposit":
      line = cancelled
        ? `User cancelled swap+deposit of ${input.sellAmount} ${input.sellToken}`
        : `Swapped ${input.sellAmount} ${input.sellToken} and saved in ${VAULT_FRIENDLY_NAMES[input.vaultId] || input.vaultId}`;
      break;
    case "create_goal":
      line = `Set goal '${input.name}' — ${input.targetAmount} ${input.currency} in ${VAULT_FRIENDLY_NAMES[input.vaultId] || input.vaultId}`;
      break;
    default:
      return "";
  }

  if (failed && !cancelled) {
    line += ` (failed: ${String(parsed.error || "unknown error").slice(0, 100)})`;
  }

  return `- Action: ${line}`;
}

/**
 * Extracts a structured recap from older messages.
 * Preserves action tool results and user/assistant text.
 */
function extractRecap(older: UIMessage[]): string {
  const facts: string[] = [];

  for (const msg of older) {
    if (msg.id === "welcome") continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    const parts = (msg.parts || []) as (ToolPart & { text?: string })[];

    // Single pass: collect action facts and text parts
    let hasAction = false;
    const texts: string[] = [];

    for (const p of parts) {
      if (p.type?.startsWith("tool-")) {
        const toolName = p.type.slice(5);
        if (ACTION_TOOLS.has(toolName) && p.state === "output-available") {
          const fact = formatActionFact(toolName, p.input || {}, p.output);
          if (fact) { facts.push(fact); hasAction = true; }
        }
      } else if (p.type === "text" && p.text) {
        texts.push(p.text);
      }
    }

    // Skip text extraction if message already contributed action facts
    if (hasAction) continue;

    const text = texts.join(" ");
    if (!text.trim()) continue;

    if (msg.role === "user") {
      facts.push(`- User asked: ${text.slice(0, 500)}`);
    } else {
      facts.push(`- Assistant: ${text.slice(0, 300)}`);
    }
  }

  if (facts.length === 0) return "";

  // Cap at MAX_RECAP_LINES, keeping the most recent facts
  const capped = facts.length > MAX_RECAP_LINES
    ? facts.slice(-MAX_RECAP_LINES)
    : facts;

  return [`Recap of ${older.length} earlier messages:`, ...capped].join("\n");
}

/**
 * Returns a conversation recap string for older messages.
 * Empty string if no windowing is needed.
 */
export function extractConversationRecap(messages: UIMessage[]): string {
  if (messages.length <= RECENT_WINDOW) return "";
  const older = messages.slice(0, messages.length - RECENT_WINDOW);
  return extractRecap(older);
}

/**
 * Windows a message array — returns only the recent window.
 * The recap is handled separately via extractConversationRecap → system prompt.
 */
export function windowMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= RECENT_WINDOW) return messages;
  return messages.slice(-RECENT_WINDOW);
}
