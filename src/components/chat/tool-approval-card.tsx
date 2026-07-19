"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { parseUnits } from "viem";
import type { Address, Hex } from "viem";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { simulateTx } from "@/lib/sim";
import { formatApy } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { useVaultDeposit, useVaultRedeem } from "@/hooks/use-vault-tx";
import { useChatSheet } from "@/contexts/chat-context";

type AddToolResultFn = (params: {
  tool: string;
  toolCallId: string;
  output: unknown;
}) => void;

interface ToolApprovalCardProps {
  toolName: "deposit" | "withdraw" | "swap_and_deposit" | "swap";
  toolCallId: string;
  args: Record<string, string>;
  state: string;
  result: unknown;
  addToolResult: AddToolResultFn;
  dashboardData: DashboardData | null;
}

export function ToolApprovalCard({
  toolName,
  toolCallId,
  args,
  state,
  result,
  addToolResult,
  dashboardData,
}: ToolApprovalCardProps) {
  // If tool already has a result, show the outcome
  if (state === "output-available" || result) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed =
        typeof result === "string"
          ? JSON.parse(result)
          : (result as Record<string, unknown>);
    } catch {
      parsed = { success: false, error: "Invalid result" };
    }
    const success = parsed?.success;
    const label =
      toolName === "swap_and_deposit"
        ? `Swapped ${args.sellAmount} ${args.sellToken} and saved in ${VAULT_FRIENDLY_NAMES[args.vaultId] || args.vaultId}`
        : toolName === "swap"
          ? `Converted ${args.sellAmount} ${args.sellToken} to ${args.buyToken}`
          : toolName === "deposit"
            ? `Saved ${args.amount} ${args.tokenSymbol}`
            : `Withdrawn ${args.amount} ${args.tokenSymbol}`;
    return (
      <div
        className={`my-2 rounded-xl border px-4 py-3 ${
          success
            ? "border-sage/20 bg-sage/5"
            : "border-fail/20 bg-fail/5"
        }`}
      >
        <p className="font-mono text-xs text-ink-light">
          {success ? label : String(parsed?.error || "Cancelled")}
        </p>
      </div>
    );
  }

  if (toolName === "swap" || toolName === "swap_and_deposit") {
    return (
      <SwapDepositPending
        toolCallId={toolCallId}
        args={args}
        addToolResult={addToolResult}
        dashboardData={dashboardData}
      />
    );
  }

  const { vaultId, amount, tokenSymbol } = args;
  const friendlyName = VAULT_FRIENDLY_NAMES[vaultId] || vaultId;
  const vault = dashboardData?.baseVaults.find((v) => v.id === vaultId);
  const apy = formatApy(vault?.yield?.["7d"]);

  return (
    <PendingApproval
      toolName={toolName}
      toolCallId={toolCallId}
      vaultId={vaultId}
      amount={amount}
      tokenSymbol={tokenSymbol}
      friendlyName={friendlyName}
      apy={apy}
      vault={vault}
      addToolResult={addToolResult}
      dashboardData={dashboardData}
    />
  );
}

/* ── Swap + Deposit Card ──────────────────────────────────── */

function SwapDepositPending({
  toolCallId,
  args,
  addToolResult,
  dashboardData,
}: {
  toolCallId: string;
  args: Record<string, string>;
  addToolResult: AddToolResultFn;
  dashboardData: DashboardData | null;
}) {
  const sellToken = args.sellToken || args.sell_token || "";
  const buyToken = args.buyToken || args.buy_token || "";
  const sellAmount = args.sellAmount || args.sell_amount || "0";
  const expectedBuyAmount = args.expectedBuyAmount || args.expected_buy_amount || "0";
  const vaultId = args.vaultId || args.vault_id || "";
  const friendlyName = VAULT_FRIENDLY_NAMES[vaultId] || vaultId;
  const vault = dashboardData?.baseVaults.find((v) => v.id === vaultId);
  const apy = formatApy(vault?.yield?.["7d"]);

  const { setActiveSheet } = useChatSheet();
  const [executing, setExecuting] = useState(false);

  const isSwapOnly = !vaultId;
  const toolKey = isSwapOnly ? "swap" : "swap_and_deposit";

  const sendResult = useCallback(
    (output: unknown) =>
      addToolResult({ tool: toolKey, toolCallId, output }),
    [addToolResult, toolCallId, toolKey],
  );

  const handleConfirm = useCallback(async () => {
    setExecuting(true);
    try {
      const txHash = await simulateTx();
      sendResult({ success: true, txHash });
      const tokenSym = (sellToken || "").toUpperCase();
      logActivity({
        type: isSwapOnly ? "swap" : "swap_and_deposit",
        amount: sellAmount,
        tokenSymbol: tokenSym,
        ...(vaultId ? { vaultId } : {}),
        txHash,
      });
      dashboardData?.refetchPositions();
      dashboardData?.refetchBalances();
    } catch (err: any) {
      sendResult({ success: false, error: err?.message || "Transaction failed" });
    } finally {
      setExecuting(false);
    }
  }, [sellToken, sellAmount, vaultId, isSwapOnly, sendResult, dashboardData]);

  const handleCancel = useCallback(() => {
    sendResult({ success: false, error: "User cancelled" });
  }, [sendResult]);

  // Morph input bar to show Cancel/Confirm
  const confirmRef = useRef(handleConfirm);
  const cancelRef = useRef(handleCancel);
  confirmRef.current = handleConfirm;
  cancelRef.current = handleCancel;

  const sheetType = isSwapOnly ? "swap" as const : "deposit" as const;
  const step = executing ? "processing" as const : "idle" as const;
  useEffect(() => {
    setActiveSheet({
      type: sheetType,
      onConfirm: () => confirmRef.current(),
      onCancel: () => cancelRef.current(),
      step,
    });
    return () => setActiveSheet((prev) => prev?.type === sheetType ? null : prev);
  }, [step, setActiveSheet]);

  return (
    <div className="my-2 rounded-xl border border-sage/20 bg-cream-dark/30 px-4 py-3">
      <p className="font-display text-lg text-ink">
        Swap {sellAmount} {sellToken?.toUpperCase() || "?"} &rarr;{" "}
        {Number(expectedBuyAmount || 0).toLocaleString("en-US", {
          maximumFractionDigits: 6,
        })}{" "}
        {buyToken?.toUpperCase() || "?"}
      </p>
      {!isSwapOnly && (
        <p className="mt-0.5 font-body text-xs text-ink-light">
          then save in {friendlyName}
          {apy !== "--" && ` · ${apy} interest`}
        </p>
      )}
    </div>
  );
}

/* ── Deposit / Withdraw Card ──────────────────────────────── */

function PendingApproval({
  toolName,
  toolCallId,
  vaultId,
  amount,
  tokenSymbol,
  friendlyName,
  apy,
  vault,
  addToolResult,
  dashboardData,
}: {
  toolName: "deposit" | "withdraw";
  toolCallId: string;
  vaultId: string;
  amount: string;
  tokenSymbol: string;
  friendlyName: string;
  apy: string;
  vault: any;
  addToolResult: AddToolResultFn;
  dashboardData: DashboardData | null;
}) {
  const vaultAddress = vault?.contracts?.vaultAddress as Address | undefined;

  const sendResult = (output: unknown) =>
    addToolResult({ tool: toolName, toolCallId, output });

  const { deposit, isLoading: depositLoading } = useVaultDeposit({
    vault: vaultAddress!,
    onConfirmed: (hash) => {
      sendResult({ success: true, txHash: hash });
      logActivity({ type: "deposit", amount, tokenSymbol, vaultId, txHash: hash });
      dashboardData?.refetchPositions();
      dashboardData?.refetchBalances();
    },
    onError: (err) => {
      sendResult({
        success: false,
        error: err?.message || "Transaction failed",
      });
    },
  });

  const { redeem, isLoading: redeemLoading } = useVaultRedeem({
    vault: vaultAddress!,
    onConfirmed: (hash) => {
      sendResult({ success: true, txHash: hash });
      logActivity({ type: "withdraw", amount, tokenSymbol, vaultId, txHash: hash });
      dashboardData?.refetchPositions();
      dashboardData?.refetchBalances();
    },
    onError: (err) => {
      sendResult({
        success: false,
        error: err?.message || "Transaction failed",
      });
    },
  });

  const executing = depositLoading || redeemLoading;

  const handleConfirm = async () => {
    if (!vault || !vaultAddress) {
      sendResult({ success: false, error: "Vault not found" });
      return;
    }

    if (toolName === "deposit") {
      const tokenAddress = vault.asset.address as Address;
      const decimals = vault.asset.decimals;
      const parsedAmount = parseUnits(amount, decimals);
      await deposit({
        token: tokenAddress,
        amount: parsedAmount,
        chainId: vault.chain.id,
      });
    } else {
      const position = dashboardData?.positions.find(
        (p) => p.vault.id === vaultId,
      );
      if (!position) {
        sendResult({
          success: false,
          error: "No position found in this account",
        });
        return;
      }
      const totalAssets =
        Number(position.position.assets) / 10 ** vault.asset.decimals;
      const ratio = Math.min(Number(amount) / totalAssets, 1);
      const sharesToRedeem =
        (position.position.shares * BigInt(Math.round(ratio * 10000))) /
        10000n;
      await redeem(sharesToRedeem);
    }
  };

  const handleCancel = () => {
    sendResult({ success: false, error: "User cancelled" });
  };

  // Morph input bar to show Cancel/Confirm
  const { setActiveSheet } = useChatSheet();
  const confirmRef = useRef(handleConfirm);
  const cancelRef = useRef(handleCancel);
  confirmRef.current = handleConfirm;
  cancelRef.current = handleCancel;

  const step = executing ? "processing" as const : "idle" as const;
  useEffect(() => {
    setActiveSheet({
      type: toolName as "deposit" | "withdraw",
      onConfirm: () => confirmRef.current(),
      onCancel: () => cancelRef.current(),
      step,
    });
    return () => setActiveSheet((prev) => prev?.type === toolName ? null : prev);
  }, [step, setActiveSheet, toolName]);

  return (
    <div className="my-2 rounded-xl border border-sage/20 bg-cream-dark/30 px-4 py-3">
      <p className="font-display text-lg text-ink">
        {toolName === "deposit" ? "Save" : "Withdraw"} {amount}{" "}
        {tokenSymbol}
      </p>
      <p className="mt-0.5 font-body text-xs text-ink-light">
        {friendlyName}
        {apy !== "--" && ` · ${apy} interest`}
      </p>
    </div>
  );
}
