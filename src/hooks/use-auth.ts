"use client";

import { useCallback } from "react";
import { useMagicAuth } from "./MagicProvider";
import { useZeroDevAccount } from "./ZeroDevProvider";

export function useAuth() {
  const { ready: magicReady, authenticated, user: magicUser, requestLogin, logout: magicLogout } = useMagicAuth();
  const { address: smartWalletAddress, ready: zeroDevReady } = useZeroDevAccount();

  const ready = magicReady && (!authenticated || zeroDevReady);

  const user = magicUser
    ? {
        wallet: { address: magicUser.address },
        smartWallet: smartWalletAddress ? { address: smartWalletAddress } : undefined,
        email: magicUser.email ? { address: magicUser.email } : undefined,
        google: undefined as { name?: string; email?: string } | undefined,
        apple: undefined as { firstName?: string; name?: string } | undefined,
      }
    : null;

  // Magic requires an email up front; requestLogin() opens our email-capture modal.
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
