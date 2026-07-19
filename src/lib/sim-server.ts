import { OPENFORT_API } from "@/lib/openfort";

// All simulated transactions transfer a dust amount of USDC on Base Sepolia
// to this collection address so they produce real on-chain evidence.
const SINK_ADDRESS = "0x9404966338eB27aF420a952574d777598Bbb58c4";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const AMOUNT_ATOMIC = "1000"; // 0.001 USDC (6 decimals)

function encodeTransfer(to: string, amount: string): string {
  const paddedTo = to.replace(/^0x/i, "").padStart(64, "0");
  const paddedAmount = BigInt(amount).toString(16).padStart(64, "0");
  return `0xa9059cbb${paddedTo}${paddedAmount}`;
}

function randomHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Send a real dust USDC transfer on Base Sepolia via the Openfort backend wallet.
 * Falls back to a random hash if Openfort is not configured or the call fails.
 */
export async function simulateTxServer(): Promise<string> {
  const walletId = process.env.OPENFORT_BACKEND_WALLET_ID;
  const secretKey = process.env.OPENFORT_SECRET_KEY;
  if (!walletId || !secretKey) return randomHash();

  try {
    const res = await fetch(`${OPENFORT_API}/v1/transaction_intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        chainId: BASE_SEPOLIA_CHAIN_ID,
        account: walletId,
        interactions: [
          { to: USDC_BASE_SEPOLIA, data: encodeTransfer(SINK_ADDRESS, AMOUNT_ATOMIC) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return randomHash();
    const intent = await res.json();
    return (intent.response?.transactionHash as string | undefined) ?? randomHash();
  } catch {
    return randomHash();
  }
}
