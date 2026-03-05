import { useState, useCallback, useEffect } from 'react'
import { usePublicClient, useConnection } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { config } from '../wagmi'
import { useSmartWallet } from './useSmartWallet'
import { type Address, type Hex, parseUnits, formatUnits, encodeFunctionData } from 'viem'
import {
  requestQuote,
  prepareCalls,
  sendPreparedCalls,
  getCallsStatus,
  type PrepareCallsParams,
  type UserOperationItem,
  type SignedUserOperation,
  type SwapQuote,
} from '../utils/alchemyApi'
import { USDC_ADDRESS, USDC_ABI, CHAIN_ID } from '../constants/usdc'
import { USDT_ADDRESS, USDT_ABI } from '../constants/usdt'

export type TxStatus = 'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'

export function useUsdtSwapTransfer() {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { scaAddress, eoaAddress, isScaDeployed, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [usdtBalance, setUsdtBalance] = useState('0')
  const [allowance, setAllowance] = useState(0n)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [pendingOp, setPendingOp] = useState<UserOperationItem | null>(null)
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null)

  useEffect(() => {
    if (!publicClient || !eoaAddress || !scaAddress) return

    const fetch = async () => {
      try {
        const [bal, alw] = await Promise.all([
          publicClient.readContract({
            address: USDT_ADDRESS,
            abi: USDT_ABI,
            functionName: 'balanceOf',
            args: [eoaAddress],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: USDT_ADDRESS,
            abi: USDT_ABI,
            functionName: 'allowance',
            args: [eoaAddress, scaAddress],
          }) as Promise<bigint>,
        ])
        setUsdtBalance(formatUnits(bal, 6))
        setAllowance(alw)
      } catch (err) {
        console.error('Failed to fetch USDT balance/allowance:', err)
      }
    }

    fetch()
    const interval = setInterval(fetch, 10000)
    return () => clearInterval(interval)
  }, [publicClient, eoaAddress, scaAddress])

  const needsApproval = useCallback((usdtAmount: string) => {
    if (!usdtAmount || !scaAddress) return false
    try {
      return allowance < parseUnits(usdtAmount, 6)
    } catch {
      return false
    }
  }, [allowance, scaAddress])

  const approveUsdt = useCallback(async () => {
    if (!connector || !eoaAddress || !scaAddress) return

    setApproving(true)
    setError('')
    try {
      const wc = await getWalletClient(config, { connector })
      const maxAmount = parseUnits('1000000000', 6)

      // USDT requires setting to 0 first if current allowance > 0
      if (allowance > 0n) {
        await wc.writeContract({
          address: USDT_ADDRESS,
          abi: USDT_ABI,
          functionName: 'approve',
          args: [scaAddress, 0n],
        })
      }

      await wc.writeContract({
        address: USDT_ADDRESS,
        abi: USDT_ABI,
        functionName: 'approve',
        args: [scaAddress, maxAmount],
      })

      setAllowance(maxAmount)
    } catch (err) {
      console.error('Approve failed:', err)
      setError(err instanceof Error ? err.message : '授权失败')
    } finally {
      setApproving(false)
    }
  }, [connector, eoaAddress, scaAddress, allowance])

  const signUserOperation = useCallback(async (
    item: UserOperationItem,
  ): Promise<SignedUserOperation> => {
    const wc = await getWalletClient(config, { connector })
    const { signatureRequest } = item
    let signature: Hex

    if (signatureRequest.type === 'personal_sign') {
      const rawData = signatureRequest.data as { raw: Hex }
      signature = await wc.signMessage({
        message: { raw: rawData.raw as `0x${string}` },
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

  const prepareSwapTransfer = useCallback(async () => {
    if (!scaAddress || !publicClient || !eoaAddress || !recipient || !amount || !connector) return

    setLoading(true)
    setTxStatus('preparing')
    setError('')
    setTxHash(null)
    setPendingOp(null)
    setSwapQuote(null)

    try {
      const usdtAmount = parseUnits(amount, 6)
      const usdtHex = `0x${usdtAmount.toString(16)}`

      // 1. Get swap quote with raw calls
      const quoteResult = await requestQuote({
        from: scaAddress,
        chainId: CHAIN_ID,
        fromToken: USDT_ADDRESS,
        toToken: USDC_ADDRESS,
        fromAmount: usdtHex,
        returnRawCalls: true,
        capabilities: {
          paymasterService: {
            policyId: import.meta.env.VITE_ALCHEMY_POLICY_ID,
          },
        },
      })

      console.log('[swap] Quote:', quoteResult.quote)
      setSwapQuote(quoteResult.quote)

      if (!quoteResult.calls?.length) {
        throw new Error('Swap API returned no calls')
      }

      // 2. Build combined calls: pull USDT from EOA → swap → transfer USDC to recipient
      const pullUsdtData = encodeFunctionData({
        abi: USDT_ABI,
        functionName: 'transferFrom',
        args: [eoaAddress, scaAddress, usdtAmount],
      })

      const transferUsdcData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as Address, BigInt(quoteResult.quote.minimumToAmount)],
      })

      const combinedCalls = [
        { to: USDT_ADDRESS as string, data: pullUsdtData, value: '0x0' },
        ...quoteResult.calls,
        { to: USDC_ADDRESS as string, data: transferUsdcData, value: '0x0' },
      ]

      // 3. Prepare UserOp
      const prepareParams: PrepareCallsParams = {
        calls: combinedCalls,
        from: scaAddress,
        chainId: CHAIN_ID,
        capabilities: {
          paymasterService: {
            policyId: import.meta.env.VITE_ALCHEMY_POLICY_ID,
          },
        },
      }

      const prepared = await prepareCalls(prepareParams)
      setPendingOp(prepared)
      setTxStatus('confirming')
    } catch (err) {
      console.error('Prepare swap failed:', err)
      setError(err instanceof Error ? err.message : '准备交易失败')
      setTxStatus('error')
    } finally {
      setLoading(false)
    }
  }, [connector, scaAddress, publicClient, eoaAddress, recipient, amount])

  const confirmAndSend = useCallback(async () => {
    if (!pendingOp) return

    setLoading(true)
    setTxStatus('sending')
    setError('')

    try {
      const signed = await signUserOperation(pendingOp)
      const result = await sendPreparedCalls(signed)
      const callId = result.preparedCallIds[0] ?? result.id
      if (!callId) throw new Error('Missing call id')

      const hash = await waitForConfirmation(callId)

      setTxHash(hash)
      setTxStatus('success')
      setPendingOp(null)
      await refreshScaStatus()
    } catch (err) {
      console.error('Send failed:', err)
      setError(err instanceof Error ? err.message : '发送交易失败')
      setTxStatus('error')
    } finally {
      setLoading(false)
    }
  }, [pendingOp, signUserOperation, waitForConfirmation, refreshScaStatus])

  const cancelConfirm = useCallback(() => {
    setPendingOp(null)
    setSwapQuote(null)
    setTxStatus('idle')
    setError('')
  }, [])

  return {
    eoaAddress,
    scaAddress,
    isScaDeployed,
    usdtBalance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    approving,
    error,
    txStatus,
    txHash,
    pendingOp,
    swapQuote,
    needsApproval,
    approveUsdt,
    prepareSwapTransfer,
    confirmAndSend,
    cancelConfirm,
  }
}
