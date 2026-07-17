/**
 * x402 paying client backed by Bottie's Openfort backend wallet.
 *
 * When the AI advisor calls a premium x402-protected endpoint, this module
 * handles the 402 → sign → retry flow automatically. The Openfort TEE-secured
 * backend wallet signs the ERC-3009 payment authorization — the private key
 * never touches application code.
 *
 * Lazily initialized on first use; singleton for the server process lifetime.
 */
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createOpenfortAccount } from "./openfort-account";
import { OPENFORT_API } from "./openfort";
import type { Address } from "viem";

let _fetchWithPayment: ReturnType<typeof wrapFetchWithPayment> | null = null;
let _httpClient: x402HTTPClient | null = null;

async function resolveBackendWalletAddress(): Promise<{
  id: string;
  address: Address;
}> {
  const walletId = process.env.OPENFORT_BACKEND_WALLET_ID;
  if (!walletId) throw new Error("OPENFORT_BACKEND_WALLET_ID is not set");

  const res = await fetch(
    `${OPENFORT_API}/v2/accounts/backend/${walletId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENFORT_SECRET_KEY}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch Openfort backend wallet (${res.status}): ${text}`,
    );
  }
  const json = await res.json();
  return { id: walletId, address: json.address as Address };
}

export async function getX402Agent(): Promise<{
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>;
  httpClient: x402HTTPClient;
}> {
  if (_fetchWithPayment && _httpClient) {
    return { fetchWithPayment: _fetchWithPayment, httpClient: _httpClient };
  }

  const { id, address } = await resolveBackendWalletAddress();

  // Create a viem LocalAccount that delegates signing to Openfort's TEE
  const signer = createOpenfortAccount(id, address);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));

  _fetchWithPayment = wrapFetchWithPayment(fetch, client);
  _httpClient = new x402HTTPClient(client);

  return { fetchWithPayment: _fetchWithPayment, httpClient: _httpClient };
}
