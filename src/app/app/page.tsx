"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import type { VaultStatsItem } from "@yo-protocol/core";
import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useActivities } from "@/hooks/use-activities";
import { useAppGoals } from "@/contexts/goals-context";
import { useChatSheet } from "@/contexts/chat-context";
import { OverviewScreen } from "@/components/dashboard/overview-screen";
import { DepositSheet } from "@/components/dashboard/deposit-sheet";
import { WithdrawSheet } from "@/components/dashboard/withdraw-sheet";
import { SendSheet } from "@/components/dashboard/send-sheet";
import { ReceiveSheet } from "@/components/dashboard/receive-sheet";

export default function DashboardPage() {
  const data = useDashboardData();
  const { activities, refetch: refetchActivities } = useActivities();
  const { goals: goalsMap } = useAppGoals();
  const { registerDashboardData, openSidebar } = useChatSheet();
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();

  const walletAddress = user?.smartWallet?.address ?? user?.wallet?.address;

  useEffect(() => {
    registerDashboardData(data);
  }, [data, registerDashboardData]);

  const [depositVault, setDepositVault] = useState<VaultStatsItem | null>(null);
  const [withdrawVault, setWithdrawVault] = useState<VaultStatsItem | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const handleTransactionSuccess = (clearSheet: () => void) => {
    clearSheet();
    setTimeout(() => refetchActivities(), 1500);
    setTimeout(() => {
      data.refetchPositions();
      data.refetchBalances();
    }, 4000);
  };

  const handleDepositSuccess = () => handleTransactionSuccess(() => setDepositVault(null));
  const handleWithdrawSuccess = () => handleTransactionSuccess(() => setWithdrawVault(null));
  const handleSendSuccess = () => handleTransactionSuccess(() => setSendOpen(false));

  const handleAddFunds = useCallback(() => {
    if (walletAddress) fundWallet({
      address: walletAddress,
      options: {
        chain: base,
        asset: "USDC",
        card: { preferredProvider: "moonpay" },
      },
    });
  }, [walletAddress, fundWallet]);

  const mappedActivities = useMemo(
    () =>
      activities.map((a) => ({
        type: a.type as "deposit" | "withdraw" | "swap",
        amount: a.amount,
        tokenSymbol: a.tokenSymbol,
        vaultId: a.vaultId ?? undefined,
        txHash: a.txHash ?? undefined,
        createdAt: a.createdAt,
      })),
    [activities],
  );

  const withdrawPosition = withdrawVault
    ? data.positions.find((p) => p.vault.id === withdrawVault.id)
    : undefined;

  return (
    <div className="relative">
      {/* Header */}
      <div className="fixed top-0 right-0 left-0 z-30 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <button
          onClick={openSidebar}
          className="rounded-full p-2 transition-colors duration-200 hover:bg-ink/[0.04]"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-light">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <OverviewScreen
        data={data}
        activities={mappedActivities}
        goals={goalsMap}
        onVaultTap={setDepositVault}
        onPositionTap={setWithdrawVault}
        onAddFunds={handleAddFunds}
        onSend={() => setSendOpen(true)}
        onReceive={() => setReceiveOpen(true)}
        onRefresh={async () => {
          await Promise.all([
            data.refetchPositions(),
            data.refetchBalances(),
            refetchActivities(),
          ]);
        }}
      />

      {/* Sheets */}
      <AnimatePresence>
        {depositVault && (
          <DepositSheet
            key="deposit"
            vault={depositVault}
            prices={data.prices}
            walletAssets={data.walletAssets}
            onClose={() => setDepositVault(null)}
            onSuccess={handleDepositSuccess}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {withdrawVault && withdrawPosition && (
          <WithdrawSheet
            key="withdraw"
            vault={withdrawVault}
            position={withdrawPosition.position}
            prices={data.prices}
            onClose={() => setWithdrawVault(null)}
            onSuccess={handleWithdrawSuccess}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sendOpen && (
          <SendSheet
            key="send"
            walletBalanceUsd={data.walletBalanceUsd}
            walletAssets={data.walletAssets}
            onClose={() => setSendOpen(false)}
            onSuccess={handleSendSuccess}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiveOpen && (
          <ReceiveSheet
            key="receive"
            onClose={() => setReceiveOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
