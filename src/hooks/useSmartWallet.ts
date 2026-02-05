import { useContext } from 'react'
import { SmartWalletContext } from '../contexts/smartWalletTypes'

export function useSmartWallet() {
  const context = useContext(SmartWalletContext)
  if (!context) {
    throw new Error('useSmartWallet must be used within SmartWalletProvider')
  }
  return context
}
