import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

const mainnetRpcUrl = import.meta.env.VITE_ALCHEMY_API_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`
  : undefined

export const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(mainnetRpcUrl),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
