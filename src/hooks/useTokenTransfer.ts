import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePublicClient, useConnection } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { config } from '../wagmi'
import { useSmartWallet } from './useSmartWallet'
import { type Address, type Hex, parseUnits, formatUnits, encodeFunctionData } from 'viem'
import { hashAuthorization } from 'viem/utils'
import {
  prepareCalls,
  sendPreparedCalls,
  getCallsStatus,
  isArrayResult,
  isAuthorizationItem,
  type PrepareCallsParams,
  type PrepareCallsResult,
  type UserOperationItem,
  type AuthorizationItem,
  type SignedItem,
  type SignedArrayPayload,
  type SendPreparedCallsParams,
} from '../utils/alchemyApi'
import { SEPOLIA_CHAIN_ID, decodeTokenCall, type TokenConfig, type DecodedCall } from '../constants/tokens'

export type TxStatus = 'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'

export function useTokenTransfer(token: TokenConfig) {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { eoaAddress, isDelegated, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('0xd1122C8c941fE716C8b0C57b832c90acB4401a05')
  const [amount, setAmount] = useState('0.2')
  const [balance, setBalance] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [pendingResult, setPendingResult] = useState<PrepareCallsResult | null>(null)

  const { authItem, userOpItem } = useMemo(() => {
    if (!pendingResult) return { authItem: null, userOpItem: null }
    if (isArrayResult(pendingResult)) {
      const auth = pendingResult.data.find(isAuthorizationItem) as AuthorizationItem | undefined
      const op = pendingResult.data.find(item => !isAuthorizationItem(item)) as UserOperationItem | undefined
      return { authItem: auth ?? null, userOpItem: op ?? null }
    }
    return { authItem: null, userOpItem: pendingResult }
  }, [pendingResult])

  useEffect(() => {
    if (!publicClient || !eoaAddress) return

    const fetchBalance = async () => {
      try {
        const raw = await publicClient.readContract({
          address: token.address,
          abi: token.abi,
          functionName: 'balanceOf',
          args: [eoaAddress],
        }) as bigint
        setBalance(formatUnits(raw, token.decimals))
      } catch (err) {
        console.error(`Failed to fetch ${token.symbol} balance:`, err)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 10000)
    return () => clearInterval(interval)
  }, [publicClient, eoaAddress, token])

  const signAuthorizationItem = useCallback(async (
    item: AuthorizationItem,
  ): Promise<SignedItem> => {
    const contractAddress = item.data.address as Address
    const chainId = parseInt(item.chainId, 16)
    const nonce = parseInt(item.data.nonce, 16)

    const computedHash = hashAuthorization({ contractAddress, chainId, nonce })
    if (computedHash !== item.signatureRequest.rawPayload) {
      console.warn('[7702] Authorization hash mismatch!', {
        computed: computedHash,
        rawPayload: item.signatureRequest.rawPayload,
      })
      throw new Error('Authorization hash mismatch - delegation address may not be trusted')
    }

    console.log('[7702] Signing authorization for delegation to:', contractAddress)

    const provider = await connector?.getProvider() as { request: (args: { method: string; params: unknown[] }) => Promise<string> }
    if (!provider) throw new Error('No wallet provider')

    let lastError: unknown

    const rpcMethods = ['wallet_signAuthorization', 'eth_signAuthorization']
    for (const method of rpcMethods) {
      try {
        console.log(`[7702] Trying ${method}...`)
        const signature = await provider.request({
          method,
          params: [{ chainId: item.chainId, address: contractAddress, nonce: item.data.nonce }],
        })
        console.log(`[7702] ${method} succeeded`)
        return {
          type: item.type,
          data: item.data as unknown as Record<string, unknown>,
          chainId: item.chainId,
          signature: { type: 'secp256k1', data: signature },
        }
      } catch (e) {
        console.log(`[7702] ${method} failed:`, e)
        lastError = e
      }
    }

    throw new Error(
      `当前钱包不支持签名 EIP-7702 授权。MetaMask 不支持签名第三方 EIP-7702 授权，请使用支持 signAuthorization 的钱包（如 Coinbase Wallet 或嵌入式钱包）。原始错误: ${lastError}`
    )
  }, [connector])

  const signUserOperation = useCallback(async (
    item: UserOperationItem,
  ): Promise<SignedItem> => {
    const wc = await getWalletClient(config, { connector })

    const { signatureRequest } = item
    let signature: Hex

    if (signatureRequest.type === 'personal_sign' || signatureRequest.type === 'eip7702Auth') {
      const raw = (signatureRequest.data as { raw?: Hex })?.raw ?? signatureRequest.rawPayload
      signature = await wc.signMessage({
        message: { raw: raw as `0x${string}` },
      })
    } else if (signatureRequest.type === 'eth_signTypedData_v4') {
      const typedData = signatureRequest.data as {
        domain: Record<string, unknown>
        types: Record<string, Array<{ name: string; type: string }>>
        primaryType: string
        message: Record<string, unknown>
      }
      signature = await wc.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      })
    } else {
      throw new Error(`Unsupported signature type: ${signatureRequest.type}`)
    }

    return {
      type: item.type,
      data: item.data as unknown as Record<string, unknown>,
      chainId: item.chainId,
      signature: { type: 'secp256k1', data: signature },
    }
  }, [connector])

  const waitForConfirmation = useCallback(async (callId: string): Promise<Hex> => {
    const MAX_POLLS = 60
    for (let i = 0; i < MAX_POLLS; i++) {
      const status = await getCallsStatus(callId)

      if (status.status === 200) {
        if (!status.receipts?.length || status.receipts[0].status !== '0x1') {
          throw new Error('Transaction reverted')
        }
        return status.receipts[0].transactionHash
      }

      if (status.status >= 400) {
        throw new Error(`Transaction failed with status ${status.status}`)
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    throw new Error('Transaction timed out')
  }, [])

  const prepareTransfer = useCallback(async () => {
    if (!eoaAddress || !recipient || !amount || !connector) return

    setLoading(true)
    setTxStatus('preparing')
    setError('')
    setTxHash(null)
    setPendingResult(null)

    try {
      const transferAmount = parseUnits(amount, token.decimals)

      const transferData = encodeFunctionData({
        abi: token.abi,
        functionName: 'transfer',
        args: [recipient as Address, transferAmount],
      })

      const prepareParams: PrepareCallsParams = {
        calls: [{ to: token.address, data: transferData, value: '0x0' }],
        from: eoaAddress,
        chainId: SEPOLIA_CHAIN_ID,
        capabilities: {
          paymasterService: {
            policyId: import.meta.env.VITE_ALCHEMY_POLICY_ID,
          },
        },
      }

      const result = await prepareCalls(prepareParams)
      console.log('[7702] prepareCalls result:', result)
      setPendingResult(result)
      setTxStatus('confirming')
    } catch (err) {
      console.error('Prepare failed:', err)
      setError(err instanceof Error ? err.message : '准备交易失败')
      setTxStatus('error')
    } finally {
      setLoading(false)
    }
  }, [connector, eoaAddress, recipient, amount, token])

  const confirmAndSend = useCallback(async () => {
    if (!pendingResult) return

    setLoading(true)
    setTxStatus('sending')
    setError('')

    try {
      let sendParams: SendPreparedCallsParams

      if (isArrayResult(pendingResult)) {
        const signedItems: SignedItem[] = []
        for (const item of pendingResult.data) {
          if (isAuthorizationItem(item)) {
            signedItems.push(await signAuthorizationItem(item))
          } else {
            signedItems.push(await signUserOperation(item as UserOperationItem))
          }
        }
        sendParams = { type: 'array', data: signedItems } satisfies SignedArrayPayload
      } else {
        sendParams = await signUserOperation(pendingResult)
      }

      const result = await sendPreparedCalls(sendParams)
      const callId = result.preparedCallIds[0] ?? result.id
      if (!callId) throw new Error('Missing call id')

      const hash = await waitForConfirmation(callId)

      setTxHash(hash)
      setTxStatus('success')
      setPendingResult(null)
      await refreshScaStatus()
    } catch (err) {
      console.error('Send failed:', err)
      setError(err instanceof Error ? err.message : '发送交易失败')
      setTxStatus('error')
    } finally {
      setLoading(false)
    }
  }, [pendingResult, signAuthorizationItem, signUserOperation, waitForConfirmation, refreshScaStatus])

  const cancelConfirm = useCallback(() => {
    setPendingResult(null)
    setTxStatus('idle')
    setError('')
  }, [])

  const decodedCalls: DecodedCall[] = userOpItem?.details?.data.calls.map(
    call => decodeTokenCall(token, call),
  ) ?? []

  const needsAuthorization = !!authItem

  return {
    eoaAddress,
    isDelegated,
    balance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    error,
    txStatus,
    txHash,
    pendingResult,
    authItem,
    userOpItem,
    decodedCalls,
    needsAuthorization,
    prepareTransfer,
    confirmAndSend,
    cancelConfirm,
  }
}
