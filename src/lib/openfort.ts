import Openfort from "@openfort/openfort-node";

let _client: Openfort | null = null;

export function getOpenfort(): Openfort {
  if (_client) return _client;
  const secretKey = process.env.OPENFORT_SECRET_KEY;
  if (!secretKey) throw new Error("OPENFORT_SECRET_KEY is not configured");
  const walletSecret = process.env.OPENFORT_WALLET_SECRET;
  _client = new Openfort(secretKey, walletSecret ? { walletSecret } : undefined);
  return _client;
}

export const OPENFORT_API = "https://api.openfort.io";
