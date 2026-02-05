import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useWalletClient, usePublicClient } from 'wagmi'
import { createSmartWalletClient, type SmartWalletClient } from '@account-kit/wallet-client'
import { WalletClientSigner } from '@aa-sdk/core'
import { alchemy, sepolia } from '@account-kit/infra'
import { type Address } from 'viem'
import { SmartWalletContext } from './smartWalletTypes'

export function SmartWalletProvider({ children }: { children: ReactNode }) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [smartClient, setSmartClient] = useState<SmartWalletClient | null>(null)
  const [scaAddress, setScaAddress] = useState<Address | null>(null)
  const [isScaDeployed, setIsScaDeployed] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eoaAddress = walletClient?.account?.address

  // 检查 SCA 是否已部署
  const checkScaDeployed = useCallback(async (address: Address) => {
    if (!publicClient) return false
    try {
      const code = await publicClient.getCode({ address })
      return !!code && code !== '0x'
    } catch {
      return false
    }
  }, [publicClient])

  // 刷新 SCA 状态
  const refreshScaStatus = useCallback(async () => {
    if (!scaAddress) return
    const deployed = await checkScaDeployed(scaAddress)
    setIsScaDeployed(deployed)
  }, [scaAddress, checkScaDeployed])

  // 初始化 SmartWalletClient
  useEffect(() => {
    if (!walletClient) {
      setSmartClient(null)
      setScaAddress(null)
      setIsScaDeployed(false)
      setError(null)
      return
    }

    const init = async () => {
      setIsInitializing(true)
      setError(null)

      try {
        const signer = new WalletClientSigner(walletClient, 'external-wallet')
        const client = createSmartWalletClient({
          transport: alchemy({ apiKey: import.meta.env.VITE_ALCHEMY_API_KEY }),
          chain: sepolia,
          signer,
          policyId: import.meta.env.VITE_ALCHEMY_POLICY_ID,
        })
        setSmartClient(client)

        // 获取 SCA 地址（确定性计算，不需要链上交互）
        const account = await client.requestAccount()
        const address = account.address as Address
        setScaAddress(address)

        // 检查是否已部署
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
  }, [walletClient, checkScaDeployed])

  return (
    <SmartWalletContext.Provider
      value={{
        smartClient,
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
