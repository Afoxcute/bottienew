"use client";

import { useState, useCallback } from "react";
import type { Address, Hex } from "viem";
import { useAuth } from "@/hooks/use-auth";
import { simulateTx } from "@/lib/sim";

type Step = "idle" | "processing" | "success" | "error";

export function useVaultDeposit({
  vault: _vault,
  onConfirmed,
  onError,
}: {
  vault: Address;
  onConfirmed?: (hash: Hex) => void;
  onError?: (err: Error) => void;
}) {
  const { user } = useAuth();
  const walletAddress = (user?.smartWallet?.address ??
    user?.wallet?.address) as Address | undefined;
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<Hex | undefined>();

  const deposit = useCallback(
    async (_: { token: Address; amount: bigint; chainId?: number }) => {
      if (!walletAddress) return;
      setStep("processing");
      try {
        const txHash = await simulateTx();
        setHash(txHash);
        setStep("success");
        onConfirmed?.(txHash);
      } catch (err: any) {
        setStep("error");
        onError?.(
          err instanceof Error
            ? err
            : new Error(err?.message || "Transaction failed"),
        );
      }
    },
    [walletAddress, onConfirmed, onError],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setHash(undefined);
  }, []);

  return {
    deposit,
    step,
    isLoading: step === "processing",
    isSuccess: step === "success",
    hash,
    reset,
  };
}

export function useVaultRedeem({
  vault: _vault,
  onConfirmed,
  onError,
}: {
  vault: Address;
  onConfirmed?: (hash: Hex) => void;
  onError?: (err: Error) => void;
}) {
  const { user } = useAuth();
  const walletAddress = (user?.smartWallet?.address ??
    user?.wallet?.address) as Address | undefined;
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<Hex | undefined>();

  const redeem = useCallback(
    async (_shares: bigint) => {
      if (!walletAddress) return;
      setStep("processing");
      try {
        const txHash = await simulateTx();
        setHash(txHash);
        setStep("success");
        onConfirmed?.(txHash);
      } catch (err: any) {
        setStep("error");
        onError?.(
          err instanceof Error
            ? err
            : new Error(err?.message || "Transaction failed"),
        );
      }
    },
    [walletAddress, onConfirmed, onError],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setHash(undefined);
  }, []);

  return {
    redeem,
    step,
    isLoading: step === "processing",
    isSuccess: step === "success",
    hash,
    instant: true,
    reset,
  };
}
