import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useWalletClient, usePublicClient } from 'wagmi'
import { type Address } from 'viem'
import { SmartWalletContext } from './smartWalletTypes'
import { requestAccount } from '../utils/alchemyApi'

export function SmartWalletProvider({ children }: { children: ReactNode }) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [scaAddress, setScaAddress] = useState<Address | null>(null)
  const [isScaDeployed, setIsScaDeployed] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eoaAddress = walletClient?.account?.address

  const checkScaDeployed = useCallback(async (address: Address) => {
    if (!publicClient) return false
    try {
      const code = await publicClient.getCode({ address })
      return !!code && code !== '0x'
    } catch {
      return false
    }
  }, [publicClient])

  const refreshScaStatus = useCallback(async () => {
    if (!scaAddress) return
    const deployed = await checkScaDeployed(scaAddress)
    setIsScaDeployed(deployed)
  }, [scaAddress, checkScaDeployed])

  useEffect(() => {
    if (!walletClient || !eoaAddress) {
      setScaAddress(null)
      setIsScaDeployed(false)
      setError(null)
      return
    }

    const init = async () => {
      setIsInitializing(true)
      setError(null)
      try {
        const result = await requestAccount(eoaAddress)
        const address = result.accountAddress as Address
        setScaAddress(address)

        const deployed = await checkScaDeployed(address)
        setIsScaDeployed(deployed)
      } catch (err) {
        console.error('Smart wallet init failed:', err)
        setError(err instanceof Error ? err.message : '初始化失败')
      } finally {
        setIsInitializing(false)
      }
    }

    init()
  }, [walletClient, eoaAddress, checkScaDeployed])

  return (
    <SmartWalletContext.Provider
      value={{
        scaAddress,
        isScaDeployed,
        isInitializing,
        error,
        eoaAddress,
        refreshScaStatus,
      }}
    >
      {children}
    </SmartWalletContext.Provider>
  )
}
