import { useState, useCallback, useEffect } from 'react'
import { usePublicClient, useConnection } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { config } from '../wagmi'
import { useSmartWallet } from './useSmartWallet'
import { type Address, type Hex, parseUnits, formatUnits, encodeFunctionData, parseSignature } from 'viem'
import {
  prepareCalls,
  sendPreparedCalls,
  getCallsStatus,
  type PrepareCallsParams,
  type UserOperationItem,
  type SignedUserOperation,
} from '../utils/alchemyApi'
import {
  USDC_ADDRESS,
  USDC_ABI,
  SEPOLIA_CHAIN_ID,
  PERMIT_DOMAIN,
  PERMIT_TYPES,
  decodeUsdcCall,
  type DecodedCall,
} from '../constants/usdc'

export type TxStatus = 'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'

export function useUsdcTransfer() {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { scaAddress, eoaAddress, isScaDeployed, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('0xd1122C8c941fE716C8b0C57b832c90acB4401a05')
  const [amount, setAmount] = useState('1')
  const [eoaBalance, setEoaBalance] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [pendingOp, setPendingOp] = useState<UserOperationItem | null>(null)

  useEffect(() => {
    if (!publicClient || !eoaAddress) return

    const fetchBalance = async () => {
      try {
        const balance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [eoaAddress],
        }) as bigint
        setEoaBalance(formatUnits(balance, 6))
      } catch (err) {
        console.error('Failed to fetch balance:', err)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 10000)
    return () => clearInterval(interval)
  }, [publicClient, eoaAddress])

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

  const prepareTransfer = useCallback(async () => {
    if (!scaAddress || !publicClient || !eoaAddress || !recipient || !amount || !connector) return

    setLoading(true)
    setTxStatus('preparing')
    setError('')
    setTxHash(null)
    setPendingOp(null)

    try {
      const walletClient = await getWalletClient(config, { connector })
      const transferAmount = parseUnits(amount, 6)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const nonce = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'nonces',
        args: [eoaAddress],
      }) as bigint

      const permitSignature = await walletClient.signTypedData({
        account: walletClient.account!,
        domain: PERMIT_DOMAIN,
        types: PERMIT_TYPES,
        primaryType: 'Permit',
        message: {
          owner: eoaAddress,
          spender: scaAddress,
          value: transferAmount,
          nonce,
          deadline,
        },
      })

      const { r, s, v } = parseSignature(permitSignature)

      const permitData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'permit',
        args: [eoaAddress, scaAddress, transferAmount, deadline, Number(v), r, s],
      })

      const transferFromData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transferFrom',
        args: [eoaAddress, recipient as Address, transferAmount],
      })

      const prepareParams: PrepareCallsParams = {
        calls: [
          { to: USDC_ADDRESS, data: permitData, value: '0x0' },
          { to: USDC_ADDRESS, data: transferFromData, value: '0x0' },
        ],
        from: scaAddress,
        chainId: SEPOLIA_CHAIN_ID,
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
      console.error('Prepare failed:', err)
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
    setTxStatus('idle')
    setError('')
  }, [])

  const decodedCalls: DecodedCall[] = pendingOp?.details?.data.calls.map(decodeUsdcCall) ?? []

  return {
    eoaAddress,
    scaAddress,
    isScaDeployed,
    eoaBalance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    error,
    txStatus,
    txHash,
    pendingOp,
    decodedCalls,
    prepareTransfer,
    confirmAndSend,
    cancelConfirm,
  }
}
