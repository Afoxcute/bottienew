import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base, mainnet, arbitrum } from "viem/chains";

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google", "passkey"],
  appearance: {
    theme: "light",
    accentColor: "#8FAE82",
    walletChainType: "ethereum-only",
    walletList: ["metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
    showWalletUIs: false,
  },
  defaultChain: base,
  supportedChains: [base, mainnet, arbitrum],
};
