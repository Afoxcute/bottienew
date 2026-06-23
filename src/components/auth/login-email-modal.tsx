"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMagicAuth } from "@/hooks/MagicProvider";

export function LoginEmailModal() {
  const { loginModalOpen, loginError, submitLoginEmail, cancelLogin } = useMagicAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (typeof document === "undefined") return null;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail || submitting) return;
    setSubmitting(true);
    try {
      await submitLoginEmail(email);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {loginModalOpen && (
        <>
          <motion.div
            key="login-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-ink/20"
            onClick={() => !submitting && cancelLogin()}
          />
          <motion.div
            key="login-modal"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 top-1/2 z-[101] mx-auto w-[min(92vw,360px)] -translate-y-1/2 rounded-2xl border border-border bg-cream p-6"
          >
            <p className="font-display text-xl text-ink">Enter your email</p>
            <p className="mt-1 font-body text-sm text-ink-light">
              We&apos;ll send you a one-time code to sign in.
            </p>
            <form onSubmit={handleSubmit} className="mt-5">
              <input
                type="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                disabled={submitting}
                className="w-full rounded-xl border border-border bg-cream-dark px-4 py-3 font-body text-sm text-ink outline-none placeholder:text-ink-light/40"
              />
              {loginError && (
                <p className="mt-2 font-mono text-[10px] text-fail">{loginError}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={cancelLogin}
                  disabled={submitting}
                  className="flex-1 rounded-full border border-border py-2.5 font-body text-sm text-ink-light"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isValidEmail || submitting}
                  className="flex-1 rounded-full bg-sage py-2.5 font-body text-sm text-cream disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Continue"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
