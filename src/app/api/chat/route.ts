import { deepseek } from "@ai-sdk/deepseek";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { windowMessages, extractConversationRecap } from "@/lib/ai/window-messages";
import { verifyAuth } from "@/lib/auth";

export async function POST(req: Request) {
  let userId: string;
  try {
    const auth = await verifyAuth();
    userId = auth.userId;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const {
    messages,
    walletAddress,
    walletBalanceUsd,
    totalSavingsUsd,
    userName,
    hasPositions,
  } = body as {
    messages: UIMessage[];
    walletAddress?: string;
    walletBalanceUsd?: number;
    totalSavingsUsd?: number;
    userName?: string;
    hasPositions?: boolean;
  };

  const tools = createTools(walletAddress, userId);
  const recap = extractConversationRecap(messages);
  const windowed = windowMessages(messages);

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system: buildSystemPrompt({
      userName,
      walletAddress,
      walletBalanceUsd,
      totalSavingsUsd,
      hasPositions,
      conversationRecap: recap || undefined,
    }),
    messages: await convertToModelMessages(windowed),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
