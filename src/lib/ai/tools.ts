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
        if (!walletAddress) return { error: "No wallet connected" };
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
        if (!walletAddress) return { error: "No wallet connected" };
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
        const sellSym = sellToken.toUpperCase();
        const buySym = buyToken.toUpperCase();
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
  };
}
