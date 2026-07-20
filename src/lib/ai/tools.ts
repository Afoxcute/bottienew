import { tool } from "ai";
import { z } from "zod";
import { parseUnits } from "viem";
import { eq } from "drizzle-orm";
import {
  VAULT_FRIENDLY_NAMES,
  DEFAULT_CHAIN_ID,
  BASE_TOKENS,
  BASE_TOKEN_DECIMALS,
  ALLOWANCE_HOLDER,
} from "@/lib/constants";
import { formatApy } from "@/lib/format";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { getX402Agent } from "@/lib/x402-agent";
import { OPENFORT_API } from "@/lib/openfort";

const YO_API = "https://api.yo.xyz/api/v1";

export function createTools(walletAddress?: string, userId?: string) {
  return {
    get_vault_rates: tool({
      description:
        "Get current interest rates for all savings accounts on Base chain",
      inputSchema: z.object({}),
      execute: async () => {
        const res = await fetch(`${YO_API}/vault/stats`);
        const json = await res.json();
        const vaults = (json as any).data || [];
        const baseVaults = vaults.filter(
          (v: any) => v.chain?.id === DEFAULT_CHAIN_ID,
        );
        return baseVaults.map((v: any) => ({
          name: VAULT_FRIENDLY_NAMES[v.id] || v.name,
          id: v.id,
          symbol: v.asset?.symbol,
          apy: formatApy(v.yield?.["7d"]),
          tvl: v.tvl?.formatted || v.tvl || "N/A",
        }));
      },
    }),

    get_wallet_balance: tool({
      description:
        "Get the user's wallet balance to see how much they can save",
      inputSchema: z.object({}),
      execute: async () => {
        if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) return { error: "No wallet connected" };
        const res = await fetch(
          `${YO_API}/user/balance/${walletAddress}`,
        );
        const json = await res.json();
        const balanceData = (json as any).data || json;
        return {
          totalUsd: balanceData.totalBalanceUsd,
          tokens:
            (balanceData.assets || []).map((b: any) => ({
              symbol: b.symbol,
              balance: b.balance,
              usd: b.balanceUsd,
            })),
        };
      },
    }),

    get_user_positions: tool({
      description:
        "Get the user's current savings positions — how much they have saved in each account and what interest they're earning",
      inputSchema: z.object({}),
      execute: async () => {
        if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) return { error: "No wallet connected" };
        const [posRes, vaultRes] = await Promise.all([
          fetch(`${YO_API}/user/positions/${walletAddress}`),
          fetch(`${YO_API}/vault/stats`),
        ]);
        const posJson = await posRes.json();
        const vaultJson = await vaultRes.json();
        const vaults = ((vaultJson as any).data || []) as any[];
        const apyMap = Object.fromEntries(
          vaults.map((v: any) => [v.id, v.yield?.["7d"]]),
        );
        const positions = ((posJson as any).data || [])
          .filter((p: any) => p.chainId === DEFAULT_CHAIN_ID)
          .map((p: any) => ({
            vaultName: VAULT_FRIENDLY_NAMES[p.vaultId] || p.vaultName,
            vaultId: p.vaultId,
            deposited: p.position?.assets?.formatted,
            tokenSymbol: p.asset?.symbol,
            apy: apyMap[p.vaultId] ? formatApy(apyMap[p.vaultId]) : "N/A",
          }));
        return positions.length > 0
          ? positions
          : { message: "No savings yet" };
      },
    }),

    get_swap_quote: tool({
      description:
        "Get a quote to swap tokens. Use when the user wants to save in a different currency than they hold (e.g. swap USDC to WETH to save in Ether Savings).",
      inputSchema: z.object({
        sellToken: z
          .string()
          .describe("Token symbol to sell (e.g. USDC, WETH, cbBTC)"),
        buyToken: z
          .string()
          .describe("Token symbol to buy (e.g. WETH, USDC, cbBTC)"),
        sellAmount: z
          .string()
          .describe(
            "Amount to sell in human-readable units (e.g. '5' for 5 USDC)",
          ),
      }),
      execute: async ({ sellToken, buyToken, sellAmount }) => {
        // Case-insensitive lookup preserving original key capitalisation (e.g. 'cbBTC' ≠ 'CBBTC')
        const normalizeToken = (sym: string) =>
          Object.keys(BASE_TOKENS).find(k => k.toLowerCase() === sym.toLowerCase()) ?? sym.toUpperCase();
        const sellSym = normalizeToken(sellToken);
        const buySym = normalizeToken(buyToken);
        const sellAddr = BASE_TOKENS[sellSym];
        const buyAddr = BASE_TOKENS[buySym];
        if (!sellAddr || !buyAddr) {
          return {
            error: `Unsupported token. Supported: ${Object.keys(BASE_TOKENS).join(", ")}`,
          };
        }

        const sellDecimals = BASE_TOKEN_DECIMALS[sellSym];
        const buyDecimals = BASE_TOKEN_DECIMALS[buySym];
        const sellAmountWei = parseUnits(sellAmount, sellDecimals).toString();

        const taker =
          walletAddress || "0x0000000000000000000000000000000000000000";

        const params = new URLSearchParams({
          chainId: String(DEFAULT_CHAIN_ID),
          sellToken: sellAddr,
          buyToken: buyAddr,
          sellAmount: sellAmountWei,
          taker,
          slippageBps: "100",
        });

        const res = await fetch(
          `https://api.0x.org/swap/allowance-holder/quote?${params}`,
          {
            headers: {
              "0x-api-key": process.env.ZERO_X_API_KEY!,
              "0x-version": "v2",
            },
          },
        );

        const quote = await res.json();
        if (!res.ok || quote.code) {
          return {
            error:
              quote.reason || quote.message || "Failed to get swap quote",
          };
        }

        const buyAmount =
          Number(quote.buyAmount) / 10 ** buyDecimals;
        const minBuyAmount =
          Number(quote.minBuyAmount) / 10 ** buyDecimals;

        return {
          sellToken: sellSym,
          buyToken: buySym,
          sellAmount,
          buyAmount: buyAmount.toFixed(8),
          minBuyAmount: minBuyAmount.toFixed(8),
          rate: `1 ${sellSym} ≈ ${(buyAmount / Number(sellAmount)).toFixed(8)} ${buySym}`,
        };
      },
    }),

    swap: tool({
      description:
        "Swap/convert one currency to another (e.g. convert USDC to ETH). Always call get_swap_quote first to show the user the rate.",
      inputSchema: z.object({
        sellToken: z
          .string()
          .describe("Token to sell (e.g. USDC, ETH, WETH)"),
        buyToken: z
          .string()
          .describe("Token to buy (e.g. WETH, USDC, cbBTC)"),
        sellAmount: z
          .string()
          .describe("Amount to sell in human-readable units"),
        expectedBuyAmount: z
          .string()
          .describe("Expected amount to receive from the swap"),
      }),
    }),

    deposit: tool({
      description:
        "Save money into a savings account. The user must confirm before this executes.",
      inputSchema: z.object({
        vaultId: z
          .string()
          .describe("The vault ID (e.g. yoUSD, yoETH, yoBTC)"),
        amount: z
          .string()
          .describe(
            "The amount to save in token units (e.g. '100' for 100 USDC)",
          ),
        tokenSymbol: z
          .string()
          .describe("The token symbol (e.g. USDC, WETH, WBTC)"),
      }),
    }),

    withdraw: tool({
      description:
        "Withdraw money from a savings account. The user must confirm before this executes.",
      inputSchema: z.object({
        vaultId: z
          .string()
          .describe("The vault ID (e.g. yoUSD, yoETH, yoBTC)"),
        amount: z
          .string()
          .describe("The amount to withdraw in token units"),
        tokenSymbol: z
          .string()
          .describe("The token symbol (e.g. USDC, WETH, WBTC)"),
      }),
    }),

    swap_and_deposit: tool({
      description:
        "Swap tokens and deposit into a savings account in one step. Always call get_swap_quote first to show the user the rate.",
      inputSchema: z.object({
        sellToken: z
          .string()
          .describe("Token to sell (e.g. USDC)"),
        buyToken: z
          .string()
          .describe("Token to buy / deposit (e.g. WETH)"),
        sellAmount: z
          .string()
          .describe("Amount to sell in human-readable units"),
        expectedBuyAmount: z
          .string()
          .describe("Expected amount to receive from the swap"),
        vaultId: z
          .string()
          .describe("Vault to deposit into (e.g. yoETH)"),
      }),
    }),

    create_goal: tool({
      description:
        "Set a savings goal for the user. Each savings account can have one goal. Use when the user tells you what they're saving for.",
      inputSchema: z.object({
        vaultId: z
          .string()
          .describe("The savings account ID (e.g. yoUSD, yoETH)"),
        name: z
          .string()
          .describe("A friendly name for the goal (e.g. 'Vacation', 'Emergency fund')"),
        targetAmount: z
          .string()
          .describe("The target amount to save (e.g. '1000')"),
        currency: z
          .string()
          .describe("The currency symbol (e.g. USDC, WETH)"),
      }),
      execute: async ({ vaultId, name, targetAmount, currency }) => {
        if (!userId) return { error: "Not authenticated" };
        try {
          await db
            .insert(goals)
            .values({ userId, vaultId, name, targetAmount, currency })
            .onConflictDoUpdate({
              target: [goals.userId, goals.vaultId],
              set: { name, targetAmount, currency, updatedAt: new Date() },
            });
          return {
            success: true,
            goal: {
              vaultId,
              name,
              targetAmount,
              currency,
              friendlyVault: VAULT_FRIENDLY_NAMES[vaultId] || vaultId,
            },
          };
        } catch (err: any) {
          return { error: err?.message || "Failed to create goal" };
        }
      },
    }),

    get_goals: tool({
      description:
        "Get the user's savings goals to see what they're working towards",
      inputSchema: z.object({}),
      execute: async () => {
        if (!userId) return { error: "Not authenticated" };
        try {
          const userGoals = await db
            .select()
            .from(goals)
            .where(eq(goals.userId, userId));
          if (userGoals.length === 0) return { message: "No goals set yet" };
          return userGoals.map((g) => ({
            name: g.name,
            vaultId: g.vaultId,
            friendlyVault: VAULT_FRIENDLY_NAMES[g.vaultId] || g.vaultId,
            targetAmount: g.targetAmount,
            currency: g.currency,
          }));
        } catch (err: any) {
          return { error: err?.message || "Failed to fetch goals" };
        }
      },
    }),

    get_premium_insights: tool({
      description:
        "Get premium yield analytics and market intelligence from Bottie's AI advisor service. " +
        "Returns trend direction (rising/falling/stable), risk scores, top savings pick, and live " +
        "ETH/BTC prices. Automatically paid for by Bottie's AI treasury via x402 micro-payment — " +
        "call this when recommending the best savings account or when the user asks about rates or market conditions.",
      inputSchema: z.object({}),
      execute: async () => {
        const walletId = process.env.OPENFORT_BACKEND_WALLET_ID;
        if (!walletId) {
          return { error: "Premium insights not available — Openfort backend wallet not configured" };
        }

        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");

        try {
          const { fetchWithPayment } = await getX402Agent();
          const res = await fetchWithPayment(`${appUrl}/api/market-data`);
          if (!res.ok) {
            return { error: "Premium analytics temporarily unavailable" };
          }
          return await res.json();
        } catch (err: any) {
          return { error: err?.message || "Premium analytics unavailable" };
        }
      },
    }),

    award_goal_reward: tool({
      description:
        "Award a 0.1 USDC bonus to the user when they achieve a savings goal. " +
        "Call this after confirming the user has reached their savings target. " +
        "Bottie's AI treasury (Openfort backend wallet) sends the reward automatically.",
      inputSchema: z.object({
        goalName: z
          .string()
          .describe("The name of the goal the user achieved (e.g. 'Japan trip')"),
        recipientAddress: z
          .string()
          .describe("The user's wallet address to send the USDC reward to"),
      }),
      execute: async ({ goalName, recipientAddress }) => {
        if (!recipientAddress) {
          return { error: "No wallet address provided" };
        }

        if (!/^0x[0-9a-fA-F]{40}$/.test(recipientAddress)) {
          return { error: "Invalid wallet address" };
        }

        // Enforce that the reward goes to the authenticated user's own wallet only.
        // walletAddress in the createTools closure is the session user's EOA.
        if (walletAddress && recipientAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          return { error: "Reward can only be sent to your own wallet" };
        }

        const backendWalletId = process.env.OPENFORT_BACKEND_WALLET_ID;
        const secretKey = process.env.OPENFORT_SECRET_KEY;

        if (!backendWalletId || !secretKey) {
          return { error: "AI treasury not configured — reward unavailable" };
        }

        // ERC-20 transfer(address,uint256) calldata
        const selector = "a9059cbb";
        const paddedTo = recipientAddress.replace(/^0x/i, "").padStart(64, "0");
        const paddedAmount = BigInt("100000").toString(16).padStart(64, "0"); // 0.1 USDC (6 decimals)
        const calldata = `0x${selector}${paddedTo}${paddedAmount}`;

        try {
          const res = await fetch(`${OPENFORT_API}/v1/transaction_intents`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secretKey}`,
            },
            body: JSON.stringify({
              chainId: DEFAULT_CHAIN_ID,
              account: backendWalletId,
              interactions: [{ to: BASE_TOKENS.USDC, data: calldata }],
            }),
          });

          if (!res.ok) {
            return { error: "Reward could not be sent — please try again later" };
          }

          const intent = await res.json();
          return {
            success: true,
            amount: "0.1 USDC",
            goalName,
            recipient: recipientAddress,
            intentId: intent.id,
            txHash: intent.response?.transactionHash ?? null,
            message: `🎉 Sent 0.1 USDC reward for achieving "${goalName}"!`,
          };
        } catch (err: any) {
          return { error: err?.message || "Failed to send reward" };
        }
      },
    }),
  };
}
