import { http, createConfig } from "wagmi";
import { celo } from "viem/chains";
import { injected } from "wagmi/connectors";

// Detect if running inside MiniPay wallet
export const isMiniPay =
  typeof window !== "undefined" &&
  !!(window as any).ethereum?.isMiniPay;

export const config = createConfig({
  chains: [celo],
  connectors: [
    injected({ target: isMiniPay ? "metaMask" : undefined }),
  ],
  transports: {
    [celo.id]: http(),
  },
});
