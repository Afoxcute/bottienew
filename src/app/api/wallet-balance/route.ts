/**
 * Reads live wallet balances directly from Base Sepolia.
 * Returns ETH and USDC (and any other configured tokens) for the given address.
 */
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(4000), next: { revalidate: 60 } },
    );
    if (res.ok) {
      const data = await res.json();
      return data?.ethereum?.usd ?? 2500;
    }
  } catch {}
  return 2500; // reasonable fallback
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") as `0x${string}` | null;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const [ethBalance, usdcBalance, ethPrice] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: USDC_SEPOLIA,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    getEthPrice(),
  ]);

  const ethAmount = parseFloat(formatEther(ethBalance));
  const usdcAmount = parseFloat(formatUnits(usdcBalance, 6));
  const ethUsd = ethAmount * ethPrice;
  const usdcUsd = usdcAmount;

  const assets: { symbol: string; balance: string; balanceUsd: string }[] = [];

  if (ethAmount > 0) {
    assets.push({
      symbol: "ETH",
      balance: ethAmount.toFixed(6),
      balanceUsd: ethUsd.toFixed(2),
    });
  }
  if (usdcAmount > 0) {
    assets.push({
      symbol: "USDC",
      balance: usdcAmount.toFixed(2),
      balanceUsd: usdcUsd.toFixed(2),
    });
  }

  const totalBalanceUsd = (ethUsd + usdcUsd).toFixed(2);

  return NextResponse.json(
    { totalBalanceUsd, assets },
    { headers: { "Cache-Control": "no-store" } },
  );
}
