"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useUniversalAccount } from "@/hooks/UniversalAccountProvider";
import { simulateTx } from "@/lib/sim";
import { useChatSheet } from "@/contexts/chat-context";

type Step = "idle" | "processing" | "success" | "error";
type DestChain = "solana" | "ethereum";

const DEST_CHAINS: { id: DestChain; label: string; chainId: number }[] = [
  { id: "solana", label: "Solana USDC", chainId: 101 },
  { id: "ethereum", label: "Ethereum USDC", chainId: 1 },
];

interface ConvertSheetProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ConvertSheet({ onClose, onSuccess }: ConvertSheetProps) {
  const { isDelegated } = useUniversalAccount();
  const [destChain, setDestChain] = useState<DestChain>("solana");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [transactionId, setTransactionId] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const canConvert = amountNum > 0 && step === "idle";

  const handleConvert = useCallback(async () => {
    if (!canConvert) return;
    setStep("processing");
    try {
      const txHash = await simulateTx();
      setTransactionId(txHash);
      setStep("success");
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof Error && /cancel|reject/i.test(err.message)) {
        setStep("idle");
        return;
      }
      setErrorMsg(null);
      setStep("error");
    }
  }, [canConvert, onSuccess]);

  const { setActiveSheet } = useChatSheet();
  const handleConvertRef = useRef(handleConvert);
  const onCloseRef = useRef(onClose);
  handleConvertRef.current = handleConvert;
  onCloseRef.current = onClose;

  useEffect(() => {
    setActiveSheet({
      type: "swap",
      onConfirm: () => { if (step === "error") { setStep("idle"); setErrorMsg(null); } else { handleConvertRef.current(); } },
      onCancel: () => onCloseRef.current(),
      step,
    });
  }, [step, setActiveSheet]);

  useEffect(() => {
    return () => setActiveSheet(null);
  }, [setActiveSheet]);

  return createPortal(
    <>
      <motion.div
        key="convert-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-ink/10"
        onClick={step === "idle" || step === "success" ? onClose : undefined}
      />
      <motion.div
        key="convert-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        drag={step === "idle" || step === "success" ? "y" : false}
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose();
        }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border-t border-border bg-cream px-6 pb-[calc(max(env(safe-area-inset-bottom),24px)+72px)] pt-4"
      >
        <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-border" />

        <div className="flex items-center justify-between">
          <span className="font-display text-xl text-ink">Convert</span>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors duration-200 hover:bg-ink/[0.04]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-ink-light">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {step === "success" ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-sage">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="font-display text-2xl text-ink">Converted!</p>
            {transactionId && (
              <p className="font-mono text-[10px] text-ink-light">Tx ID: {transactionId}</p>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 font-body text-xs text-ink-light">
              Move assets from Base to another chain via Particle&apos;s Universal Account.
            </p>

            <div className="mt-5 flex gap-2">
              {DEST_CHAINS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDestChain(d.id)}
                  className={`rounded-full px-4 py-1.5 font-mono text-xs transition-colors duration-200 ${
                    destChain === d.id ? "bg-ink text-cream" : "bg-cream-dark text-ink-light"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <label className="label-mono text-[10px]">Amount (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value))
                    setAmount(e.target.value);
                }}
                disabled={step === "processing"}
                className="mt-1 w-full border-b border-border bg-transparent pb-2 font-display text-3xl text-ink outline-none placeholder:text-ink/20"
              />
            </div>

            {!isDelegated && (
              <p className="mt-3 font-mono text-[10px] text-ink-light">
                First conversion will request a one-time delegation on Base.
              </p>
            )}

            {step === "error" && (
              <p className="mt-4 text-center font-mono text-xs text-fail">
                {errorMsg ?? "Conversion failed. Try again."}
              </p>
            )}
          </>
        )}
        <div className="absolute -bottom-48 inset-x-0 h-48 bg-cream" />
      </motion.div>
    </>,
    document.body,
  );
}
