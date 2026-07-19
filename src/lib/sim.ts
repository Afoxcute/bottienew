import type { Hex } from "viem";

/** Generate a random 32-byte hex string that looks like a real transaction hash. */
export function fakeTxHash(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/**
 * Simulate a blockchain transaction.
 * Waits a realistic network + confirmation delay, then returns a fake tx hash.
 */
export async function simulateTx(minMs = 1100, maxMs = 2600): Promise<Hex> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  return fakeTxHash();
}
