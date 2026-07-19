"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useVaults,
  useUserPositions,
  usePrices,
} from "@yo-protocol/react";
import type { VaultStatsItem, UserVaultPosition } from "@yo-protocol/core";
import type { Address } from "viem";
import { DEFAULT_CHAIN_ID, VAULT_DISPLAY_ORDER } from "@/lib/constants";
import { getAdjustments } from "@/lib/sim-ledger";
import { assetsToUsd, getPrice } from "@/lib/format";

export interface TypedPosition {
  vault: VaultStatsItem;
  position: UserVaultPosition;
}

export interface DashboardCache {
  totalSavingsUsd: number;
  walletBalanceUsd: number;
  positionVaultIds: string[];
  timestamp: number;
}

export interface WalletAsset {
  symbol: string;
  balance: string;
  balanceUsd: string;
}

export interface DashboardData {
  baseVaults: VaultStatsItem[];
  allVaults: VaultStatsItem[];
  vaultsLoading: boolean;

  walletAddress: Address | undefined;
  walletBalanceUsd: number;
  walletAssets: WalletAsset[];
  totalSavingsUsd: number;
  positions: TypedPosition[];
  hasPositions: boolean;
  userLoading: boolean;

  prices: Record<string, number>;

  cache: DashboardCache | null;

  refetchPositions: () => Promise<unknown>;
  refetchBalances: () => Promise<unknown>;
}

const CACHE_KEY = "bottie:dashboard-cache";

function readCache(): DashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useDashboardData(): DashboardData {
  const { user } = useAuth();
  const walletAddress = (user?.smartWallet?.address ?? user?.wallet?.address) as Address | undefined;

  const { vaults = [], isLoading: vaultsLoading } = useVaults();
  const {
    positions: rawPositions = [],
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = useUserPositions(walletAddress, { enabled: !!walletAddress });
  const {
    data: balances,
    isLoading: balancesLoading,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: ["wallet-balance-sepolia", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/wallet-balance?address=${walletAddress}`);
      if (!res.ok) return { totalBalanceUsd: "0", assets: [] };
      return res.json() as Promise<{ totalBalanceUsd: string; assets: { symbol: string; balance: string; balanceUsd: string }[] }>;
    },
    enabled: !!walletAddress,
    refetchInterval: 30_000,
  });
  const { prices = {} } = usePrices();

  const [cache] = useState<DashboardCache | null>(readCache);

  // Re-read ledger adjustments whenever a simulated tx fires the custom event
  const [ledgerTick, setLedgerTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setLedgerTick((t) => t + 1);
    window.addEventListener("sim-ledger-update", onUpdate);
    return () => window.removeEventListener("sim-ledger-update", onUpdate);
  }, []);

  const baseVaults = useMemo(() => {
    const filtered = vaults.filter(
      (v: VaultStatsItem) => v.chain.id === DEFAULT_CHAIN_ID,
    );
    return filtered.sort((a: VaultStatsItem, b: VaultStatsItem) => {
      const aIdx = VAULT_DISPLAY_ORDER.indexOf(a.id as (typeof VAULT_DISPLAY_ORDER)[number]);
      const bIdx = VAULT_DISPLAY_ORDER.indexOf(b.id as (typeof VAULT_DISPLAY_ORDER)[number]);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [vaults]);

  const positions = useMemo(() => {
    return rawPositions
      .map((p: { vault: unknown; position: UserVaultPosition }) => ({
        vault: p.vault as VaultStatsItem,
        position: p.position,
      }))
      .filter((p) => p.position.assets > 0n);
  }, [rawPositions]);

  const totalSavingsUsd = useMemo(() => {
    return positions.reduce((sum, p) => {
      const price = getPrice(prices, p.vault.asset.symbol);
      return sum + assetsToUsd(p.position.assets, p.vault.asset.decimals, price);
    }, 0);
  }, [positions, prices]);

  // Apply simulated balance deltas on top of the real on-chain balance.
  const walletAssets = useMemo<WalletAsset[]>(() => {
    const real = balances?.assets ?? [];
    if (!walletAddress) return real;
    const adj = getAdjustments(walletAddress);
    return real.map((a) => {
      const delta = adj[a.symbol.toUpperCase()] ?? 0;
      const realBal = parseFloat(a.balance);
      const realUsd = parseFloat(a.balanceUsd);
      const adjBal = Math.max(0, realBal + delta);
      const price = realBal > 0 ? realUsd / realBal : 1;
      return {
        symbol: a.symbol,
        balance: a.symbol === "ETH" ? adjBal.toFixed(6) : adjBal.toFixed(2),
        balanceUsd: (adjBal * price).toFixed(2),
      };
    }).filter((a) => parseFloat(a.balance) > 0);
  // ledgerTick re-evaluates this memo when a sim tx fires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, walletAddress, ledgerTick]);

  const walletBalanceUsd = useMemo(
    () => walletAssets.reduce((s, a) => s + (parseFloat(a.balanceUsd) || 0), 0),
    [walletAssets],
  );

  const userLoading = positionsLoading || balancesLoading;

  // Write to cache when fresh data arrives
  useEffect(() => {
    if (!userLoading && walletAddress) {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            totalSavingsUsd,
            walletBalanceUsd,
            positionVaultIds: positions.map((p) => p.vault.id),
            timestamp: Date.now(),
          }),
        );
      } catch {
        // silent fail
      }
    }
  }, [userLoading, walletAddress, totalSavingsUsd, walletBalanceUsd, positions]);

  return useMemo(
    () => ({
      baseVaults,
      allVaults: vaults,
      vaultsLoading,

      walletAddress,
      walletBalanceUsd,
      walletAssets,
      totalSavingsUsd,
      positions,
      hasPositions: positions.length > 0,
      userLoading,

      prices,

      cache,

      refetchPositions,
      refetchBalances,
    }),
    [
      baseVaults,
      vaults,
      vaultsLoading,
      walletAddress,
      walletBalanceUsd,
      walletAssets,
      totalSavingsUsd,
      positions,
      userLoading,
      prices,
      cache,
      refetchPositions,
      refetchBalances,
    ],
  );
}
