/**
 * x402-protected premium yield analytics endpoint.
 *
 * Requires a micro-payment (0.001 USDC on Base) before returning data.
 * The Bottie AI advisor pays automatically using the Openfort backend wallet
 * via x402's 402→sign→retry flow — invisible to the end user.
 *
 * Seller side: uses withX402 from @x402/next.
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import {
  x402Server,
  X402_PAYTO_ADDRESS,
  X402_NETWORK,
  X402_PRICE,
} from "@/lib/x402-server";

const YO_API = "https://api.yo.xyz/api/v1";
const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,coinbase-wrapped-btc,euro-coin&vs_currencies=usd&include_24hr_change=true";

const handler = async (_: NextRequest) => {
  const [vaultRes, priceRes] = await Promise.all([
    fetch(`${YO_API}/vault/stats`),
    fetch(COINGECKO),
  ]);

  const vaultJson = await vaultRes.json();
  const prices = priceRes.ok ? await priceRes.json() : {};

  const vaults: any[] = ((vaultJson as any).data || []).filter(
    (v: any) => v.chain?.id === 8453,
  );

  const vaultInsights = vaults.map((v: any) => {
    const apy7d: number = v.yield?.["7d"] ?? 0;
    const apy30d: number = v.yield?.["30d"] ?? 0;
    const trend =
      apy7d > apy30d ? "rising" : apy7d < apy30d ? "falling" : "stable";
    const riskScore =
      apy7d > 0.15 ? "high" : apy7d > 0.08 ? "medium" : "low";
    const recommendation =
      trend === "rising" && apy7d > 0.05 ? "strong buy" : "hold";

    return {
      id: v.id,
      name: v.name,
      apy7d: (apy7d * 100).toFixed(2) + "%",
      apy30d: (apy30d * 100).toFixed(2) + "%",
      trend,
      tvl: v.tvl?.formatted ?? null,
      riskScore,
      recommendation,
    };
  });

  // Sort by 7-day APY descending so the AI can easily pick the best option
  vaultInsights.sort(
    (a, b) => parseFloat(b.apy7d) - parseFloat(a.apy7d),
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    poweredBy: "Bottie Premium Analytics · paid via x402 · signed by Openfort",
    vaultInsights,
    topPick: vaultInsights[0]?.id ?? null,
    prices: {
      ETH: {
        usd: prices?.ethereum?.usd ?? null,
        change24h: prices?.ethereum?.usd_24h_change?.toFixed(2) ?? null,
      },
      BTC: {
        usd: prices?.["coinbase-wrapped-btc"]?.usd ?? null,
        change24h:
          prices?.["coinbase-wrapped-btc"]?.usd_24h_change?.toFixed(2) ?? null,
      },
      USDC: { usd: prices?.["usd-coin"]?.usd ?? 1 },
    },
  });
};

export const GET = withX402(
  handler,
  {
    accepts: [
      {
        scheme: "exact",
        price: X402_PRICE,
        network: X402_NETWORK,
        payTo: X402_PAYTO_ADDRESS,
      },
    ],
    description:
      "Bottie premium yield analytics — real-time vault insights, trend data, risk scores, and AI-ready market context. Paid via x402 micro-payment.",
    mimeType: "application/json",
  },
  x402Server,
);
