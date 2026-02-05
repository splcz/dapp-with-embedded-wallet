import { createContext } from 'react'
import { type SmartWalletClient } from '@account-kit/wallet-client'
import { type Address } from 'viem'

export interface SmartWalletContextType {
  smartClient: SmartWalletClient | null
  scaAddress: Address | null
  isScaDeployed: boolean
  isInitializing: boolean
  error: string | null
  eoaAddress: Address | undefined
  refreshScaStatus: () => Promise<void>
}

export const SmartWalletContext = createContext<SmartWalletContextType | null>(null)
