/**
 * x402 resource server (seller side).
 * Protects premium API endpoints with HTTP 402 Payment Required.
 * Uses the Exact EVM scheme — requires USDC payment on Base mainnet.
 */
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
});

export const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register("eip155:*", new ExactEvmScheme());

/**
 * CAIP-2 chain identifier for x402 micro-payments.
 * Uses Base Sepolia testnet (84532) so the public x402.org facilitator can
 * settle payments without requiring real USDC. The app's savings logic
 * continues to run on Base mainnet (8453).
 */
export const X402_NETWORK = "eip155:84532" as const;

/** Price per premium API call — micro-payment in USDC */
export const X402_PRICE = "$0.001";

/** Address that receives x402 payments (Bottie's treasury) */
export const X402_PAYTO_ADDRESS = (
  process.env.X402_PAYTO_ADDRESS ?? ""
) as `0x${string}`;
