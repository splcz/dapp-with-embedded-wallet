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
import { type SwapToken } from '../constants/swapTokens'

export type TxStatus = 'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'

export function useSwapTransfer(token: SwapToken) {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { scaAddress, eoaAddress, isScaDeployed, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState('0')
  const [scaEthBalance, setScaEthBalance] = useState('0')
  const [allowance, setAllowance] = useState(0n)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [pendingOp, setPendingOp] = useState<UserOperationItem | null>(null)
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null)

  // Fetch balance & allowance
  useEffect(() => {
    if (!publicClient || !eoaAddress) return

    const fetchData = async () => {
      try {
        if (token.isNative) {
          const [eoaBal, scaBal] = await Promise.all([
            publicClient.getBalance({ address: eoaAddress }),
            scaAddress
              ? publicClient.getBalance({ address: scaAddress as Address })
              : Promise.resolve(0n),
          ])
          setBalance(formatUnits(eoaBal, 18))
          setScaEthBalance(formatUnits(scaBal, 18))
        } else {
          const [bal, alw] = await Promise.all([
            publicClient.readContract({
              address: token.address as Address,
              abi: token.abi,
              functionName: 'balanceOf',
              args: [eoaAddress],
            }) as Promise<bigint>,
            scaAddress
              ? publicClient.readContract({
                  address: token.address as Address,
                  abi: token.abi,
                  functionName: 'allowance',
                  args: [eoaAddress, scaAddress as Address],
                }) as Promise<bigint>
              : Promise.resolve(0n),
          ])
          setBalance(formatUnits(bal, token.decimals))
          setAllowance(alw)
        }
      } catch (err) {
        console.error(`Failed to fetch ${token.symbol} data:`, err)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [publicClient, eoaAddress, scaAddress, token])

  // Reset form state when switching tokens
  useEffect(() => {
    setAmount('')
    setPendingOp(null)
    setSwapQuote(null)
    setTxStatus('idle')
    setError('')
    setTxHash(null)
  }, [token.symbol])

  const needsApproval = useCallback((amt: string) => {
    if (token.isNative || !amt || !scaAddress) return false
    try {
      return allowance < parseUnits(amt, token.decimals)
    } catch {
      return false
    }
  }, [token, allowance, scaAddress])

  const needsDeposit = useCallback((amt: string) => {
    if (!token.isNative || !amt) return false
    try {
      const needed = parseUnits(amt, 18)
      const scaBal = parseUnits(scaEthBalance, 18)
      return scaBal < needed
    } catch {
      return false
    }
  }, [token, scaEthBalance])

  const approveToken = useCallback(async () => {
    if (token.isNative || !connector || !eoaAddress || !scaAddress) return

    setApproving(true)
    setError('')
    try {
      const wc = await getWalletClient(config, { connector })
      const maxAmount = parseUnits('1000000000', token.decimals)

      if (token.requiresZeroApprove && allowance > 0n) {
        await wc.writeContract({
          address: token.address as Address,
          abi: token.abi,
          functionName: 'approve',
          args: [scaAddress as Address, 0n],
        })
      }

      await wc.writeContract({
        address: token.address as Address,
        abi: token.abi,
        functionName: 'approve',
        args: [scaAddress as Address, maxAmount],
      })

      setAllowance(maxAmount)
    } catch (err) {
      console.error('Approve failed:', err)
      setError(err instanceof Error ? err.message : '授权失败')
    } finally {
      setApproving(false)
    }
  }, [token, connector, eoaAddress, scaAddress, allowance])

  const depositEth = useCallback(async () => {
    if (!token.isNative || !connector || !scaAddress || !amount) return

    setDepositing(true)
    setError('')
    try {
      const wc = await getWalletClient(config, { connector })
      const depositAmount = parseUnits(amount, 18)

      await wc.sendTransaction({
        to: scaAddress as Address,
        value: depositAmount,
      })

      // Refresh SCA balance
      if (publicClient) {
        const newBal = await publicClient.getBalance({ address: scaAddress as Address })
        setScaEthBalance(formatUnits(newBal, 18))
      }
    } catch (err) {
      console.error('Deposit failed:', err)
      setError(err instanceof Error ? err.message : '充值失败')
    } finally {
      setDepositing(false)
    }
  }, [token, connector, scaAddress, amount, publicClient])

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
      const tokenAmount = parseUnits(amount, token.decimals)
      const hexAmount = `0x${tokenAmount.toString(16)}`

      const quoteResult = await requestQuote({
        from: scaAddress,
        chainId: CHAIN_ID,
        fromToken: token.address,
        toToken: USDC_ADDRESS,
        fromAmount: hexAmount,
        returnRawCalls: true,
        capabilities: {
          paymasterService: {
            policyId: import.meta.env.VITE_ALCHEMY_POLICY_ID,
          },
        },
      })

      console.log(`[swap] ${token.symbol} → USDC quote:`, quoteResult.quote)
      setSwapQuote(quoteResult.quote)

      if (!quoteResult.calls?.length) {
        throw new Error('Swap API returned no calls')
      }

      // Build combined calls
      const preCalls: Array<{ to: string; data: string; value: string }> = []

      if (!token.isNative) {
        // ERC-20: pull tokens from EOA to SCA via transferFrom
        const pullData = encodeFunctionData({
          abi: token.abi,
          functionName: 'transferFrom',
          args: [eoaAddress, scaAddress as Address, tokenAmount],
        })
        preCalls.push({ to: token.address, data: pullData, value: '0x0' })
      }
      // For ETH: SCA already holds ETH from deposit, no preCalls needed

      const transferUsdcData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as Address, BigInt(quoteResult.quote.minimumToAmount)],
      })

      const combinedCalls = [
        ...preCalls,
        ...quoteResult.calls,
        { to: USDC_ADDRESS as string, data: transferUsdcData, value: '0x0' },
      ]

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
  }, [connector, scaAddress, publicClient, eoaAddress, recipient, amount, token])

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
    balance,
    scaEthBalance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    approving,
    depositing,
    error,
    txStatus,
    txHash,
    pendingOp,
    swapQuote,
    needsApproval,
    needsDeposit,
    approveToken,
    depositEth,
    prepareSwapTransfer,
    confirmAndSend,
    cancelConfirm,
  }
}
