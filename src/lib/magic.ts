import { EVMExtension } from "@magic-ext/evm";
import { Magic as MagicBase } from "magic-sdk";
import { base } from "viem/chains";

export type Magic = MagicBase<[EVMExtension]>;

export function createMagic(): Magic | null {
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY;
  if (!apiKey) return null;

  return new MagicBase(apiKey, {
    extensions: [
      new EVMExtension([
        {
          rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || base.rpcUrls.default.http[0],
          chainId: base.id,
          default: true,
        },
      ]),
    ],
  });
}
