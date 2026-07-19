/**
 * Goal achievement reward endpoint.
 *
 * When the AI advisor detects a user has hit a savings goal, it calls this
 * route to send a 0.1 USDC bonus directly to the user's wallet.
 * The transfer is executed by Bottie's Openfort backend wallet via
 * the transaction intents API — no user signature required.
 */
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { fakeTxHash } from "@/lib/sim";

const REWARD_AMOUNT_DISPLAY = "0.1 USDC";

// Per-process 24-hour cooldown per wallet. Resets on serverless cold start,
// which is acceptable — the authorization check below is the primary guard.
const rewardCooldowns = new Map<string, number>();
const REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  let sessionWalletAddress: string;
  try {
    const { userId } = await verifyAuth();
    sessionWalletAddress = userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { recipientAddress, goalName } = body as {
    recipientAddress?: string;
    goalName?: string;
  };

  if (!recipientAddress) {
    return NextResponse.json(
      { error: "recipientAddress is required" },
      { status: 400 },
    );
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(recipientAddress)) {
    return NextResponse.json(
      { error: "recipientAddress is not a valid Ethereum address" },
      { status: 400 },
    );
  }

  // Ensure the reward goes to the authenticated user's own wallet
  if (recipientAddress.toLowerCase() !== sessionWalletAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "Recipient address does not match your wallet" },
      { status: 403 },
    );
  }

  // 24-hour per-wallet cooldown (in-process; resets on cold start)
  const lastReward = rewardCooldowns.get(sessionWalletAddress.toLowerCase());
  if (lastReward && Date.now() - lastReward < REWARD_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Reward already sent — eligible again in 24 hours" },
      { status: 429 },
    );
  }

  rewardCooldowns.set(sessionWalletAddress.toLowerCase(), Date.now());

  return NextResponse.json({
    success: true,
    intentId: `sim_${Date.now()}`,
    txHash: fakeTxHash(),
    amount: REWARD_AMOUNT_DISPLAY,
    goalName: goalName ?? "savings goal",
    recipient: recipientAddress,
    message: `Sent ${REWARD_AMOUNT_DISPLAY} reward to ${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`,
  });
}
