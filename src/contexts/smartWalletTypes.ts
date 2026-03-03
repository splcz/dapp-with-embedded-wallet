import { createContext } from 'react'
import { type Address } from 'viem'

export interface SmartWalletContextType {
  scaAddress: Address | null
  isDelegated: boolean
  isInitializing: boolean
  error: string | null
  eoaAddress: Address | undefined
  refreshScaStatus: () => Promise<void>
}

export const SmartWalletContext = createContext<SmartWalletContextType | null>(null)
