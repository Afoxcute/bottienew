import { createConfig } from "@privy-io/wagmi";
import { base, mainnet, arbitrum } from "viem/chains";
import { http } from "wagmi";

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

export const wagmiConfig = createConfig({
  chains: [base, mainnet, arbitrum],
  transports: {
    [base.id]: http(
      alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : undefined
    ),
    [mainnet.id]: http(
      alchemyKey
        ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : undefined
    ),
    [arbitrum.id]: http(
      alchemyKey
        ? `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : undefined
    ),
  },
});
