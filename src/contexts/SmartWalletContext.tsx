import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useConnection, usePublicClient } from 'wagmi'
import { type Address } from 'viem'
import { SmartWalletContext } from './smartWalletTypes'
import { requestAccount } from '../utils/alchemyApi'

export function SmartWalletProvider({ children }: { children: ReactNode }) {
  const { address: eoaAddress, isConnected } = useConnection()
  const publicClient = usePublicClient()

  const [scaAddress, setScaAddress] = useState<Address | null>(null)
  const [isScaDeployed, setIsScaDeployed] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    console.log('[SmartWallet] useEffect triggered:', { isConnected, eoaAddress, hasPublicClient: !!publicClient })

    if (!eoaAddress) {
      setScaAddress(null)
      setIsScaDeployed(false)
      setError(null)
      return
    }

    let cancelled = false

    const init = async () => {
      setIsInitializing(true)
      setError(null)
      try {
        console.log('[SmartWallet] calling requestAccount for', eoaAddress)
        const result = await requestAccount(eoaAddress)
        if (cancelled) return
        const address = result.accountAddress as Address
        setScaAddress(address)

        if (publicClient) {
          const code = await publicClient.getCode({ address })
          if (!cancelled) setIsScaDeployed(!!code && code !== '0x')
        }
      } catch (err) {
        if (cancelled) return
        console.error('Smart wallet init failed:', err)
        setError(err instanceof Error ? err.message : '初始化失败')
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [isConnected, eoaAddress, publicClient])

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
