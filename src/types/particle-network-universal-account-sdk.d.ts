// @particle-network/universal-account-sdk's package.json "exports" map
// doesn't declare a "types" condition, so moduleResolution "bundler" can't
// find its shipped .d.ts. Declare the surface area we actually use.
declare module "@particle-network/universal-account-sdk" {
  export interface IAssetsResponse {
    assets: unknown[];
    totalAmountInUSD: number;
  }

  export interface IUniversalAccountConfig {
    projectId: string;
    projectClientKey: string;
    projectAppUuid: string;
    smartAccountOptions: {
      useEIP7702?: boolean;
      name: string;
      version: string;
      ownerAddress: string;
    };
    tradeConfig?: {
      slippageBps?: number;
      universalGas?: boolean;
    };
  }

  export interface ISmartAccountOptions {
    smartAccountAddress: string;
    solanaSmartAccountAddress: string;
  }

  export interface IConvertTransaction {
    chainId: number;
    expectToken: { type: string; amount: string };
  }

  export interface ITransaction {
    rootHash: string;
    userOps?: unknown[];
    [key: string]: unknown;
  }

  export interface EIP7702Authorization {
    userOpHash: string;
    signature: string;
  }

  export const UNIVERSAL_ACCOUNT_VERSION: string;

  export class UniversalAccount {
    constructor(config: IUniversalAccountConfig);
    getPrimaryAssets(): Promise<IAssetsResponse>;
    getSmartAccountOptions(): Promise<ISmartAccountOptions>;
    createConvertTransaction(payload: IConvertTransaction, tradeConfig?: unknown): Promise<ITransaction>;
    sendTransaction(
      transaction: ITransaction,
      signature: string,
      authorizations?: EIP7702Authorization[],
    ): Promise<{ transactionId: string }>;
    getEIP7702Deployments(): Promise<unknown[]>;
    getEIP7702Auth(chainIds: number[]): Promise<{ address: string; nonce: number }[]>;
  }
}
