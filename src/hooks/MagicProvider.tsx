"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createMagic, type Magic } from "@/lib/magic";

export type MagicUser = { address: string; email?: string };

type MagicContextType = {
  magic: Magic | null;
  ready: boolean;
  authenticated: boolean;
  user: MagicUser | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Opens the email-capture modal and resolves once login succeeds. */
  requestLogin: () => Promise<void>;
  loginModalOpen: boolean;
  loginError: string | null;
  submitLoginEmail: (email: string) => Promise<void>;
  cancelLogin: () => void;
};

const MagicContext = createContext<MagicContextType>({
  magic: null,
  ready: false,
  authenticated: false,
  user: null,
  login: async () => {},
  logout: async () => {},
  requestLogin: async () => {},
  loginModalOpen: false,
  loginError: null,
  submitLoginEmail: async () => {},
  cancelLogin: () => {},
});

export const useMagicAuth = () => useContext(MagicContext);

export function MagicProvider({ children }: { children: ReactNode }) {
  const [magic, setMagic] = useState<Magic | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MagicUser | null>(null);

  useEffect(() => {
    const m = createMagic();
    setMagic(m);
    if (!m) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const isLoggedIn = await m.user.isLoggedIn();
        if (isLoggedIn) {
          const info = await m.user.getInfo();
          const address = info.wallets?.ethereum?.publicAddress;
          if (address) {
            setUser({ address, email: info.email ?? undefined });
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(
    async (email: string) => {
      if (!magic) throw new Error("Magic not ready");
      await magic.auth.loginWithEmailOTP({ email });
      const info = await magic.user.getInfo();
      const address = info.wallets?.ethereum?.publicAddress;
      if (!address) throw new Error("Magic login did not return an address");
      const didToken = await magic.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ didToken }),
      });
      if (!res.ok) throw new Error("Failed to establish session");
      setUser({ address, email: info.email ?? undefined });
    },
    [magic],
  );

  const logout = useCallback(async () => {
    if (magic) await magic.user.logout();
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, [magic]);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const loginCallbackRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  // Tracks the in-flight requestLogin promise so concurrent calls get the same promise
  // rather than overwriting loginCallbackRef and stranding the first caller forever.
  const loginPromiseRef = useRef<Promise<void> | null>(null);

  const requestLogin = useCallback(() => {
    if (loginPromiseRef.current) return loginPromiseRef.current;
    setLoginError(null);
    setLoginModalOpen(true);
    loginPromiseRef.current = new Promise<void>((resolve, reject) => {
      loginCallbackRef.current = { resolve, reject };
    });
    return loginPromiseRef.current;
  }, []);

  const submitLoginEmail = useCallback(
    async (email: string) => {
      setLoginError(null);
      try {
        await login(email);
        setLoginModalOpen(false);
        loginCallbackRef.current?.resolve();
        loginCallbackRef.current = null;
        loginPromiseRef.current = null;
      } catch (err) {
        // Never expose raw SDK error strings to the consumer UI
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("cancel") || msg.includes("reject")) {
          // Magic's own OTP UI was dismissed — treat as user-initiated cancel
          setLoginModalOpen(false);
          setLoginError(null);
          loginCallbackRef.current?.reject(new Error("Login cancelled"));
          loginCallbackRef.current = null;
          loginPromiseRef.current = null;
          return;
        }
        setLoginError("Something went wrong — please try again.");
      }
    },
    [login],
  );

  const cancelLogin = useCallback(() => {
    setLoginModalOpen(false);
    setLoginError(null);
    loginCallbackRef.current?.reject(new Error("Login cancelled"));
    loginCallbackRef.current = null;
    loginPromiseRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      magic,
      ready,
      authenticated: !!user,
      user,
      login,
      logout,
      requestLogin,
      loginModalOpen,
      loginError,
      submitLoginEmail,
      cancelLogin,
    }),
    [magic, ready, user, login, logout, requestLogin, loginModalOpen, loginError, submitLoginEmail, cancelLogin],
  );

  return <MagicContext.Provider value={value}>{children}</MagicContext.Provider>;
}
