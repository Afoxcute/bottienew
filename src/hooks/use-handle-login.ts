"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

const PENDING_KEY = "bottie:pending-redirect";

export function useHandleLogin() {
  const router = useRouter();
  const { ready, authenticated, login } = useAuth();

  useEffect(() => {
    if (ready && authenticated && localStorage.getItem(PENDING_KEY)) {
      localStorage.removeItem(PENDING_KEY);
      router.push("/app");
    }
  }, [ready, authenticated, router]);

  const handleLogin = () => {
    if (authenticated) {
      router.push("/app");
      return;
    }
    localStorage.setItem(PENDING_KEY, "1");
    login();
  };

  return handleLogin;
}
