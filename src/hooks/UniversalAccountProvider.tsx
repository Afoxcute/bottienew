"use client";

import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
  type IAssetsResponse,
} from "@particle-network/universal-account-sdk";
import { BrowserProvider, getBytes, Signature } from "ethers";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMagicAuth } from "./MagicProvider";

const BASE_CHAIN_ID = 8453;

type AccountInfo = {
  ownerAddress: string;
  evmSmartAccount: string;
  solanaSmartAccount: string;
};

type UAContextType = {
  universalAccount: UniversalAccount | null;
  accountInfo: AccountInfo;
  primaryAssets: IAssetsResponse | null;
  isDelegated: boolean;
  refreshBalance: () => Promise<void>;
  ensureDelegated: () => Promise<void>;
  signAndSend: (transaction: { rootHash: string } & Record<string, any>) => Promise<{ transactionId: string }>;
  loading: boolean;
};

const UAContext = createContext<UAContextType>({
  universalAccount: null,
  accountInfo: { ownerAddress: "", evmSmartAccount: "", solanaSmartAccount: "" },
  primaryAssets: null,
  isDelegated: false,
  refreshBalance: async () => {},
  ensureDelegated: async () => {},
  signAndSend: async () => ({ transactionId: "" }),
  loading: false,
});

export const useUniversalAccount = () => useContext(UAContext);

export function UniversalAccountProvider({ children }: { children: ReactNode }) {
  const { magic, user: magicUser } = useMagicAuth();
  const [universalAccount, setUniversalAccount] = useState<UniversalAccount | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    ownerAddress: "",
    evmSmartAccount: "",
    solanaSmartAccount: "",
  });
  const [primaryAssets, setPrimaryAssets] = useState<IAssetsResponse | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);
  const [loading, setLoading] = useState(false);

  const userAddress = magicUser?.address;

  useEffect(() => {
    if (!userAddress) {
      setUniversalAccount(null);
      return;
    }

    const ua = new UniversalAccount({
      projectId: process.env.NEXT_PUBLIC_PARTICLE_PROJECT_ID!,
      projectClientKey: process.env.NEXT_PUBLIC_PARTICLE_CLIENT_KEY!,
      projectAppUuid: process.env.NEXT_PUBLIC_PARTICLE_APP_ID!,
      smartAccountOptions: {
        useEIP7702: true,
        name: "UNIVERSAL",
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: userAddress,
      },
      tradeConfig: {
        slippageBps: 100,
        universalGas: false,
      },
    });

    setUniversalAccount(ua);
  }, [userAddress]);

  const refreshDelegationStatus = useCallback(async () => {
    if (!universalAccount) return;
    const deployments = await universalAccount.getEIP7702Deployments();
    const baseDeployment = deployments.find((d: any) => d.chainId === BASE_CHAIN_ID);
    setIsDelegated((baseDeployment as any)?.isDelegated ?? false);
  }, [universalAccount]);

  useEffect(() => {
    if (!universalAccount || !userAddress) return;

    const fetchAccountData = async () => {
      setLoading(true);
      try {
        const options = await universalAccount.getSmartAccountOptions();
        setAccountInfo({
          ownerAddress: userAddress,
          evmSmartAccount: options.smartAccountAddress || "",
          solanaSmartAccount: options.solanaSmartAccountAddress || "",
        });

        await refreshDelegationStatus();

        const assets = await universalAccount.getPrimaryAssets();
        setPrimaryAssets(assets);
      } catch (err) {
        console.error("Failed to fetch UA data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountData();
  }, [universalAccount, userAddress, refreshDelegationStatus]);

  const refreshBalance = useCallback(async () => {
    if (!universalAccount) return;
    try {
      const assets = await universalAccount.getPrimaryAssets();
      setPrimaryAssets(assets);
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    }
  }, [universalAccount]);

  const signEip7702Auth = useCallback(
    async (contractAddress: string, chainId: number, nonce?: number) => {
      if (!magic) throw new Error("Magic not ready");
      return magic.wallet.sign7702Authorization({
        contractAddress,
        chainId,
        ...(nonce !== undefined && { nonce }),
      });
    },
    [magic],
  );

  // Pre-delegate the EOA on Base via a Type-4 transaction.
  // Magic SDK cannot sign EIP-7702 authorizations with chainId 0 (chain-agnostic),
  // so we pre-delegate with chain-specific auth before creating UA transactions.
  const ensureDelegated = useCallback(async () => {
    if (!universalAccount || !magic || !userAddress) {
      throw new Error("Universal Account or wallet not ready");
    }

    const deployments = await universalAccount.getEIP7702Deployments();
    const baseDeployment = deployments.find((d: any) => d.chainId === BASE_CHAIN_ID);
    if (!baseDeployment || (baseDeployment as any).isDelegated) {
      await refreshDelegationStatus();
      return;
    }

    await magic.evm.switchChain(BASE_CHAIN_ID);

    const [auth] = await universalAccount.getEIP7702Auth([BASE_CHAIN_ID]);
    const authorization = await signEip7702Auth(auth.address, BASE_CHAIN_ID, auth.nonce + 1);

    await magic.wallet.send7702Transaction({
      to: userAddress,
      data: "0x",
      authorizationList: [authorization],
    });

    await refreshDelegationStatus();
  }, [universalAccount, magic, userAddress, signEip7702Auth, refreshDelegationStatus]);

  const signAndSend = useCallback(
    async (transaction: { rootHash: string; userOps?: any[] } & Record<string, any>) => {
      if (!universalAccount || !magic || !userAddress) {
        throw new Error("Universal Account or wallet not ready");
      }

      type EIP7702Authorization = { userOpHash: string; signature: string };
      const authorizations: EIP7702Authorization[] = [];
      const nonceMap = new Map<number, string>();

      if (transaction.userOps) {
        for (const userOp of transaction.userOps) {
          if (userOp.eip7702Auth && !userOp.eip7702Delegated) {
            let signatureSerialized = nonceMap.get(userOp.eip7702Auth.nonce);

            if (!signatureSerialized) {
              const authorization = await signEip7702Auth(
                userOp.eip7702Auth.address,
                userOp.eip7702Auth.chainId || userOp.chainId,
                userOp.eip7702Auth.nonce,
              );

              const sig = Signature.from({
                r: authorization.r,
                s: authorization.s,
                v: authorization.v,
              });
              signatureSerialized = sig.serialized;
              nonceMap.set(userOp.eip7702Auth.nonce, signatureSerialized);
            }

            if (signatureSerialized) {
              authorizations.push({
                userOpHash: userOp.userOpHash,
                signature: signatureSerialized,
              });
            }
          }
        }
      }

      const provider = new BrowserProvider((magic as any).rpcProvider);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(getBytes(transaction.rootHash));
      const result = await universalAccount.sendTransaction(
        transaction as any,
        signature,
        authorizations.length > 0 ? authorizations : undefined,
      );
      return result;
    },
    [universalAccount, magic, userAddress, signEip7702Auth],
  );

  const value = useMemo(
    () => ({
      universalAccount,
      accountInfo,
      primaryAssets,
      isDelegated,
      refreshBalance,
      ensureDelegated,
      signAndSend,
      loading,
    }),
    [universalAccount, accountInfo, primaryAssets, isDelegated, refreshBalance, ensureDelegated, signAndSend, loading],
  );

  return <UAContext.Provider value={value}>{children}</UAContext.Provider>;
}
