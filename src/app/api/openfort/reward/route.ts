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
import { DEFAULT_CHAIN_ID, BASE_TOKENS } from "@/lib/constants";
import { OPENFORT_API } from "@/lib/openfort";

// 0.1 USDC in atomic units (6 decimals)
const REWARD_AMOUNT_ATOMIC = "100000";
const REWARD_AMOUNT_DISPLAY = "0.1 USDC";

// Per-process 24-hour cooldown per wallet. Resets on serverless cold start,
// which is acceptable — the authorization check below is the primary guard.
const rewardCooldowns = new Map<string, number>();
const REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Encode ERC-20 transfer(address,uint256) calldata without viem to keep this route lightweight. */
function encodeTransfer(to: string, amountHex: string): string {
  const selector = "a9059cbb"; // keccak256("transfer(address,uint256)") first 4 bytes
  const paddedTo = to.replace(/^0x/i, "").padStart(64, "0");
  const paddedAmount = BigInt(amountHex).toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

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

  const backendWalletId = process.env.OPENFORT_BACKEND_WALLET_ID;
  const secretKey = process.env.OPENFORT_SECRET_KEY;

  if (!backendWalletId || !secretKey) {
    // Gracefully degrade — reward is a bonus feature, not critical path
    return NextResponse.json(
      { error: "Openfort backend wallet not configured" },
      { status: 503 },
    );
  }

  const calldata = encodeTransfer(recipientAddress, REWARD_AMOUNT_ATOMIC);

  const res = await fetch(`${OPENFORT_API}/v1/transaction_intents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({
      chainId: DEFAULT_CHAIN_ID,
      account: backendWalletId,
      interactions: [
        {
          to: BASE_TOKENS.USDC,
          data: calldata,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[Openfort reward] Transaction intent failed:", text);
    return NextResponse.json(
      { error: "Failed to create transaction intent" },
      { status: 502 },
    );
  }

  const intent = await res.json();

  rewardCooldowns.set(sessionWalletAddress.toLowerCase(), Date.now());

  return NextResponse.json({
    success: true,
    intentId: intent.id,
    txHash: intent.response?.transactionHash ?? null,
    amount: REWARD_AMOUNT_DISPLAY,
    goalName: goalName ?? "savings goal",
    recipient: recipientAddress,
    message: `Sent ${REWARD_AMOUNT_DISPLAY} reward to ${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`,
  });
}
