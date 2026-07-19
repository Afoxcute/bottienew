import type { Hex } from "viem";

/** Fallback: generate a random 32-byte hex string that looks like a tx hash. */
export function fakeTxHash(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/**
 * Simulate a transaction.
 * Triggers a real dust USDC transfer on Base Sepolia via the backend, then
 * returns the on-chain tx hash. Falls back to a random hash if the call fails.
 */
export async function simulateTx(): Promise<Hex> {
  try {
    const res = await fetch("/api/simulate-tx", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data?.txHash) return data.txHash as Hex;
    }
  } catch {
    // network error or Openfort unavailable — fall through to fake hash
  }
  return fakeTxHash();
}
