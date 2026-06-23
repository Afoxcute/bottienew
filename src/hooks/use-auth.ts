"use client";

import { useCallback } from "react";
import { useMagicAuth } from "./MagicProvider";
import { useZeroDevAccount } from "./ZeroDevProvider";

/**
 * Drop-in replacement for Privy's usePrivy(), shaped the same way
 * (user.smartWallet.address / user.wallet.address / user.email.address)
 * so existing wallet-address-resolution call sites don't need to change.
 */
export function useAuth() {
  const { ready: magicReady, authenticated, user: magicUser, requestLogin, logout: magicLogout } = useMagicAuth();
  const { address: smartWalletAddress, ready: zeroDevReady } = useZeroDevAccount();

  const ready = magicReady && (!authenticated || zeroDevReady);

  const user = magicUser
    ? {
        wallet: { address: magicUser.address },
        smartWallet: smartWalletAddress ? { address: smartWalletAddress } : undefined,
        email: magicUser.email ? { address: magicUser.email } : undefined,
        // Magic only supports email OTP login — no Google/Apple identity to surface.
        google: undefined as { name?: string; email?: string } | undefined,
        apple: undefined as { firstName?: string; name?: string } | undefined,
      }
    : null;

  // Privy's login() opens a hosted modal with no params; Magic needs an email
  // up front, so requestLogin() opens our own email-capture modal instead.
  const login = useCallback(() => requestLogin(), [requestLogin]);
  const logout = useCallback(() => magicLogout(), [magicLogout]);

  return { ready, authenticated, user, login, logout };
}

export function useLogout(opts?: { onSuccess?: () => void }) {
  const { logout: doLogout } = useAuth();
  const logout = useCallback(async () => {
    await doLogout();
    opts?.onSuccess?.();
  }, [doLogout, opts]);
  return { logout };
}

export function useSmartWallets() {
  const { client } = useZeroDevAccount();
  return { client };
}
