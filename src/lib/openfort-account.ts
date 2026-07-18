/**
 * Bridges an Openfort backend wallet to a viem-compatible LocalAccount.
 *
 * Openfort's TEE-secured signing API (/v2/accounts/backend/{id}/sign) accepts
 * a raw hex-encoded hash. For EIP-712 typed data (required by x402's
 * ExactEvmScheme / ERC-3009), we compute the hash client-side with viem and
 * send only the hash to Openfort — the private key never leaves Openfort's TEE.
 */
import { hashMessage, hashTypedData } from "viem";
import type { LocalAccount, Address, Hex, Hash } from "viem";
import { OPENFORT_API } from "./openfort";

async function openfortSign(walletId: string, hash: Hash): Promise<Hex> {
  const res = await fetch(
    `${OPENFORT_API}/v2/accounts/backend/${walletId}/sign`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENFORT_SECRET_KEY}`,
      },
      body: JSON.stringify({ data: hash }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Openfort sign failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.signature || typeof json.signature !== "string") {
    throw new Error("Openfort sign: response missing signature field");
  }
  return json.signature as Hex;
}

/**
 * Returns a viem LocalAccount whose signing methods delegate to Openfort's
 * backend wallet signing API. Pass this account to x402's ExactEvmScheme.
 */
export function createOpenfortAccount(
  walletId: string,
  address: Address,
): LocalAccount {
  return {
    address,
    type: "local" as const,
    source: "openfort",
    publicKey: "0x" as Hex,

    async sign({ hash }: { hash: Hash }): Promise<Hex> {
      return openfortSign(walletId, hash);
    },

    async signMessage({
      message,
    }: {
      message: string | { raw: Uint8Array | Hex };
    }): Promise<Hex> {
      const hash = hashMessage(message);
      return openfortSign(walletId, hash);
    },

    async signTypedData(params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex> {
      const hash = hashTypedData(params as any);
      return openfortSign(walletId, hash);
    },

    async signTransaction(): Promise<never> {
      throw new Error(
        "signTransaction is not supported on Openfort backend accounts via x402",
      );
    },
  } as LocalAccount;
}
