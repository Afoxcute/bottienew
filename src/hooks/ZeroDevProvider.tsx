"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  constants as zerodevConstants,
} from "@zerodev/sdk";

const { KERNEL_V3_1 } = zerodevConstants;
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { useMagicAuth } from "./MagicProvider";

const ENTRY_POINT = { address: entryPoint07Address, version: "0.7" as const };

type KernelSendCall = { to: Address; data?: `0x${string}`; value?: bigint };
type KernelClient = { sendTransaction: (args: { calls: KernelSendCall[] }) => Promise<`0x${string}`> };

type ZeroDevContextType = {
  client: KernelClient | null;
  address: Address | undefined;
  ready: boolean;
};

const ZeroDevContext = createContext<ZeroDevContextType>({
  client: null,
  address: undefined,
  ready: false,
});

export const useZeroDevAccount = () => useContext(ZeroDevContext);

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const publicClient = createPublicClient({
  chain: base,
  transport: http(
    alchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` : undefined,
  ),
});

export function ZeroDevProvider({ children }: { children: ReactNode }) {
  const { magic, authenticated, user } = useMagicAuth();
  const [client, setClient] = useState<KernelClient | null>(null);
  const [address, setAddress] = useState<Address | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authenticated || !magic || !user) {
      setClient(null);
      setAddress(undefined);
      setReady(!authenticated);
      return;
    }

    const rpcProjectId = process.env.NEXT_PUBLIC_ZERODEV_RPC_URL;
    if (!rpcProjectId) {
      console.error("[ZeroDev] NEXT_PUBLIC_ZERODEV_RPC_URL is not set");
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    (async () => {
      const walletClient = createWalletClient({
        account: user.address as Address,
        chain: base,
        transport: custom(magic.rpcProvider as any),
      });

      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: walletClient,
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
      });

      const account = await createKernelAccount(publicClient, {
        plugins: { sudo: ecdsaValidator },
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
      });

      const paymasterRpcUrl = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC_URL;
      const paymasterClient = paymasterRpcUrl
        ? createZeroDevPaymasterClient({ chain: base, transport: http(paymasterRpcUrl) })
        : undefined;

      const kernelClient = createKernelAccountClient({
        account,
        chain: base,
        bundlerTransport: http(rpcProjectId),
        client: publicClient,
        paymaster: paymasterClient
          ? {
              getPaymasterData: (userOperation) =>
                paymasterClient.sponsorUserOperation({ userOperation }),
            }
          : undefined,
      });

      if (cancelled) return;
      setClient(kernelClient as unknown as KernelClient);
      setAddress(account.address);
      setReady(true);
    })().catch((err) => {
      console.error("[ZeroDev] Failed to create kernel account:", err);
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [authenticated, magic, user]);

  const value = useMemo(() => ({ client, address, ready }), [client, address, ready]);

  return <ZeroDevContext.Provider value={value}>{children}</ZeroDevContext.Provider>;
}
