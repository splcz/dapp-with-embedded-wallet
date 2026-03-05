import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useConnection, usePublicClient } from 'wagmi'
import { type Address } from 'viem'
import { SmartWalletContext } from './smartWalletTypes'

export function SmartWalletProvider({ children }: { children: ReactNode }) {
  const { address: eoaAddress, isConnected } = useConnection()
  const publicClient = usePublicClient()

  const [isDelegated, setIsDelegated] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scaAddress = eoaAddress as Address | undefined ?? null

  const checkDelegation = useCallback(async (address: Address) => {
    if (!publicClient) return false
    try {
      const code = await publicClient.getCode({ address })
      return !!code && code !== '0x'
    } catch {
      return false
    }
  }, [publicClient])

  const refreshScaStatus = useCallback(async () => {
    if (!eoaAddress) return
    const delegated = await checkDelegation(eoaAddress)
    setIsDelegated(delegated)
  }, [eoaAddress, checkDelegation])

  useEffect(() => {
    if (!eoaAddress) {
      setIsDelegated(false)
      setError(null)
      return
    }

    let cancelled = false

    const init = async () => {
      setIsInitializing(true)
      setError(null)
      try {
        const delegated = await checkDelegation(eoaAddress)
        if (!cancelled) {
          setIsDelegated(delegated)
          console.log('[SmartWallet 7702] delegation status:', delegated)
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
  }, [isConnected, eoaAddress, publicClient, checkDelegation])

  return (
    <SmartWalletContext.Provider
      value={{
        scaAddress,
        isDelegated,
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
