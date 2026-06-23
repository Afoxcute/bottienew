"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { YieldProvider } from "@yo-protocol/react";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { MagicProvider } from "@/hooks/MagicProvider";
import { ZeroDevProvider } from "@/hooks/ZeroDevProvider";
import { UniversalAccountProvider } from "@/hooks/UniversalAccountProvider";
import { LoginEmailModal } from "@/components/auth/login-email-modal";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <MagicProvider>
      <ZeroDevProvider>
        <UniversalAccountProvider>
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              <YieldProvider>
                {children}
                <LoginEmailModal />
              </YieldProvider>
            </WagmiProvider>
          </QueryClientProvider>
        </UniversalAccountProvider>
      </ZeroDevProvider>
    </MagicProvider>
  );
}
