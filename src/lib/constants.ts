export const YO_GATEWAY = "0xF1EeE0957267b1A474323Ff9CfF7719E964969FA" as const;
export const YO_REGISTRY = "0x56c3119DC3B1a75763C87D5B0A2C55E489502232" as const;
export const YO_ORACLE = "0x6E879d0CcC85085A709eBf5539224f53d0D396B0" as const;
export const YO_REDEEMER = "0x0439e941841f97dc1334d1a433379c6fcdcc2162" as const;

export const VAULTS = {
  yoUSD: {
    base: "0x0000000f2eB9f69274678c76222B35eEc7588a65" as const,
  },
  yoETH: {
    base: "0x3a43aec53490cb9fa922847385d82fe25d0e9de7" as const,
  },
  yoBTC: {
    base: "0xbCbc8cb4D1e8ED048a6276a5E94A3e952660BcbC" as const,
  },
} as const;

export const DEFAULT_CHAIN_ID = 8453;
export const SUPPORTED_CHAIN_IDS = [8453, 1, 42161] as const;

export const VAULT_DISPLAY_ORDER = ["yoUSD", "yoETH", "yoBTC", "yoEUR"] as const;

export const VAULT_FRIENDLY_NAMES: Record<string, string> = {
  yoUSD: "Dollar Savings",
  yoETH: "Ether Savings",
  yoBTC: "Bitcoin Savings",
  yoEUR: "Euro Savings",
  yoGOLD: "Gold Savings",
  yoUSDT: "Tether Savings",
};

export const BASE_TOKENS: Record<string, `0x${string}`> = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
};

export const BASE_TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  WETH: 18,
  ETH: 18,
  cbBTC: 8,
  EURC: 6,
};

export const ALLOWANCE_HOLDER =
  "0x0000000000001fF3684f28c67538d4D072C22734" as const;

/** Per-vault accent palette — subtle, cream-compatible tones */
export const VAULT_ACCENTS: Record<string, { color: string; bg: string; border: string }> = {
  yoUSD: { color: "#6B8F5E", bg: "rgba(107,143,94,0.08)", border: "rgba(107,143,94,0.25)" },
  yoETH: { color: "#6B89A8", bg: "rgba(107,137,168,0.08)", border: "rgba(107,137,168,0.25)" },
  yoBTC: { color: "#B8943E", bg: "rgba(184,148,62,0.08)", border: "rgba(184,148,62,0.25)" },
  yoEUR: { color: "#8B7BAA", bg: "rgba(139,123,170,0.08)", border: "rgba(139,123,170,0.25)" },
  yoGOLD: { color: "#A89460", bg: "rgba(168,148,96,0.08)", border: "rgba(168,148,96,0.25)" },
  yoUSDT: { color: "#5A9E82", bg: "rgba(90,158,130,0.08)", border: "rgba(90,158,130,0.25)" },
};

/** Token logos — local assets in /public/tokens/ */
export const VAULT_LOGOS: Record<string, string> = {
  yoUSD: "/tokens/usdc.png",
  yoETH: "/tokens/eth.png",
  yoBTC: "/tokens/btc.png",
  yoEUR: "/tokens/eur.png",
  yoGOLD: "/tokens/gold.png",
  yoUSDT: "/tokens/usdt.png",
};

/** Token logos keyed by token symbol */
export const TOKEN_LOGOS: Record<string, string> = {
  WETH: "/tokens/eth.png", ETH: "/tokens/eth.png",
  USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  cbBTC: "/tokens/btc.png", EURC: "/tokens/eur.png",
};

/** Friendly display names for token symbols */
export const TOKEN_DISPLAY_NAMES: Record<string, string> = {
  WETH: "ETH", cbBTC: "BTC", EURC: "EUR",
};

export const NARRATION_CACHE_KEY = "bottie:narration-cache";

/** Known token addresses on Base */
export const TOKEN_ADDRESSES: Record<string, string> = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

export const SYMBOL_TO_COINGECKO: Record<string, string> = {
  usdc: "usd-coin",
  weth: "ethereum",
  eth: "ethereum",
  cbbtc: "coinbase-wrapped-btc",
  eurc: "euro-coin",
  xaut: "tether-gold",
  usdt: "tether",
};
