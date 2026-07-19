"use client";

/**
 * Tracks simulated balance changes locally so the UI stays consistent
 * with what the user expects after a simulated deposit/withdraw/send.
 *
 * The on-chain balance never changes (transactions are simulated), so we
 * overlay these adjustments on top of the real queried balance.
 */

import { useEffect, useState } from "react";

const KEY = "bottie:sim-ledger-v1";
const EV = "sim-ledger-update";

type LedgerEntry = {
  walletAddress: string; // lowercased
  tokenSymbol: string;   // uppercased
  delta: number;         // negative = removed from wallet, positive = returned to wallet
  timestamp: number;
};

function read(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(entries: LedgerEntry[]) {
  try {
    // Keep the latest 500 entries; older ones are stale noise
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-500)));
  } catch {}
}

/**
 * Record a simulated balance change.
 * delta < 0 → wallet loses tokens (deposit, send, convert-out)
 * delta > 0 → wallet gains tokens (withdrawal)
 */
export function recordDelta(walletAddress: string, tokenSymbol: string, delta: number) {
  if (!delta) return;
  const entries = read();
  entries.push({
    walletAddress: walletAddress.toLowerCase(),
    tokenSymbol: tokenSymbol.toUpperCase(),
    delta,
    timestamp: Date.now(),
  });
  write(entries);
  // Notify any listening hooks so they re-derive the adjusted balance
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EV));
  }
}

/** React hook — re-renders whenever recordDelta is called. */
export function useSimDeltas(walletAddress: string | undefined): Record<string, number> {
  const [deltas, setDeltas] = useState<Record<string, number>>(() =>
    walletAddress ? getAdjustments(walletAddress) : {},
  );

  useEffect(() => {
    const refresh = () =>
      setDeltas(walletAddress ? getAdjustments(walletAddress) : {});
    refresh();
    window.addEventListener(EV, refresh);
    return () => window.removeEventListener(EV, refresh);
  }, [walletAddress]);

  return deltas;
}

/** Return the cumulative balance adjustments keyed by token symbol (uppercase). */
export function getAdjustments(walletAddress: string): Record<string, number> {
  const adj: Record<string, number> = {};
  for (const e of read()) {
    if (e.walletAddress !== walletAddress.toLowerCase()) continue;
    adj[e.tokenSymbol] = (adj[e.tokenSymbol] ?? 0) + e.delta;
  }
  return adj;
}
