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
import { type SwapToken, WETH_ADDRESS, WETH_ABI } from '../constants/swapTokens'

export type TxStatus = 'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'

export function useSwapTransfer(token: SwapToken) {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { scaAddress, eoaAddress, isScaDeployed, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('0x4aD8C3db80ef9f384F8680d49d89E66aD8b22e49')
  const [amount, setAmount] = useState('')
  const [ethBalance, setEthBalance] = useState('0')
  const [wethBalance, setWethBalance] = useState('0')
  const [erc20Balance, setErc20Balance] = useState('0')
  const [allowance, setAllowance] = useState(0n)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [wrapping, setWrapping] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [pendingOp, setPendingOp] = useState<UserOperationItem | null>(null)
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null)

  const balance = token.isNative ? ethBalance : erc20Balance

  // Fetch balances & allowance
  useEffect(() => {
    if (!publicClient || !eoaAddress) return

    const fetchData = async () => {
      try {
        if (token.isNative) {
          const [ethBal, wBal, alw] = await Promise.all([
            publicClient.getBalance({ address: eoaAddress }),
            publicClient.readContract({
              address: WETH_ADDRESS,
              abi: WETH_ABI,
              functionName: 'balanceOf',
              args: [eoaAddress],
            }) as Promise<bigint>,
            scaAddress
              ? publicClient.readContract({
                  address: WETH_ADDRESS,
                  abi: WETH_ABI,
                  functionName: 'allowance',
                  args: [eoaAddress, scaAddress as Address],
                }) as Promise<bigint>
              : Promise.resolve(0n),
          ])
          setEthBalance(formatUnits(ethBal, 18))
          setWethBalance(formatUnits(wBal, 18))
          setAllowance(alw)
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
          setErc20Balance(formatUnits(bal, token.decimals))
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

  useEffect(() => {
    setAmount('')
    setPendingOp(null)
    setSwapQuote(null)
    setTxStatus('idle')
    setError('')
    setTxHash(null)
  }, [token.symbol])

  /** ETH: needs wrap if WETH balance is zero or very low */
  const needsWrap = token.isNative && parseFloat(wethBalance) === 0

  /** ERC-20 / WETH: needs approve if allowance is zero */
  const needsApproval = allowance === 0n && !!scaAddress

  const [wrapEthAmount, setWrapEthAmount] = useState('')

  /** ETH: wrap ETH → WETH + approve SCA in one flow */
  const wrapAndApprove = useCallback(async () => {
    if (!token.isNative || !connector || !eoaAddress || !scaAddress || !wrapEthAmount) return

    setWrapping(true)
    setError('')
    try {
      const wc = await getWalletClient(config, { connector })
      const wrapAmount = parseUnits(wrapEthAmount, 18)

      await wc.writeContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: 'deposit',
        value: wrapAmount,
      })

      if (allowance === 0n) {
        const maxAmount = parseUnits('1000000000', 18)
        await wc.writeContract({
          address: WETH_ADDRESS,
          abi: WETH_ABI,
          functionName: 'approve',
          args: [scaAddress as Address, maxAmount],
        })
        setAllowance(maxAmount)
      }

      // Refresh balances
      if (publicClient) {
        const [newEthBal, newWethBal] = await Promise.all([
          publicClient.getBalance({ address: eoaAddress }),
          publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: 'balanceOf',
            args: [eoaAddress],
          }) as Promise<bigint>,
        ])
        setEthBalance(formatUnits(newEthBal, 18))
        setWethBalance(formatUnits(newWethBal, 18))
      }
    } catch (err) {
      console.error('Wrap & approve failed:', err)
      setError(err instanceof Error ? err.message : 'Wrap 失败')
    } finally {
      setWrapping(false)
    }
  }, [token, connector, eoaAddress, scaAddress, wrapEthAmount, allowance, publicClient])

  /** ERC-20: one-time approve */
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
      // amount is the desired USDC output (6 decimals)
      const usdcAmount = parseUnits(amount, 6)
      const usdcHex = `0x${usdcAmount.toString(16)}`
      const contractAddress = token.isNative ? WETH_ADDRESS : token.address

      const quoteResult = await requestQuote({
        from: scaAddress,
        chainId: CHAIN_ID,
        fromToken: token.swapAddress,
        toToken: USDC_ADDRESS,
        minimumToAmount: usdcHex,
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

      const fromTokenDecimals = token.isNative ? 18 : token.decimals
      const fromAmount = BigInt(quoteResult.quote.fromAmount)

      // Pull the exact fromAmount determined by the quote
      const pullData = encodeFunctionData({
        abi: token.abi,
        functionName: 'transferFrom',
        args: [eoaAddress, scaAddress as Address, fromAmount],
      })

      const transferUsdcData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as Address, usdcAmount],
      })

      // Check if EOA has enough source tokens
      const balInSourceToken = parseUnits(
        token.isNative ? wethBalance : erc20Balance,
        fromTokenDecimals,
      )
      if (balInSourceToken < fromAmount) {
        const needed = formatUnits(fromAmount, fromTokenDecimals)
        throw new Error(
          `${token.isNative ? 'WETH' : token.symbol} 余额不足，需要 ${needed}，` +
          `当前 ${token.isNative ? wethBalance : erc20Balance}`
        )
      }

      const combinedCalls = [
        { to: contractAddress as string, data: pullData, value: '0x0' },
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
  }, [connector, scaAddress, publicClient, eoaAddress, recipient, amount, token, wethBalance, erc20Balance])

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
    wethBalance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    wrapEthAmount,
    setWrapEthAmount,
    loading,
    approving,
    wrapping,
    error,
    txStatus,
    txHash,
    pendingOp,
    swapQuote,
    needsWrap,
    needsApproval,
    wrapAndApprove,
    approveToken,
    prepareSwapTransfer,
    confirmAndSend,
    cancelConfirm,
  }
}
