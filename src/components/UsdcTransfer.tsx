import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePublicClient, useConnection } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { config } from '../wagmi'
import { useSmartWallet } from '../hooks/useSmartWallet'
import { type Address, type Hex, parseUnits, formatUnits, encodeFunctionData, decodeFunctionData } from 'viem'
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

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address

const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const SEPOLIA_CHAIN_ID = '0xaa36a7'

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

interface DecodedCall {
  to: string
  functionName: string | null
  description: string
  rawData?: string
}

function decodeUsdcCall(call: { to: string; data?: string; value?: string }): DecodedCall {
  if (!call.data || call.data === '0x') {
    return { to: call.to, functionName: null, description: '原生转账', rawData: call.data }
  }

  try {
    const decoded = decodeFunctionData({ abi: USDC_ABI, data: call.data as Hex })

    if (decoded.functionName === 'transfer') {
      const [to, amount] = decoded.args as [string, bigint]
      return {
        to: call.to,
        functionName: 'transfer',
        description: `转 ${formatUnits(amount, 6)} USDC 到 ${shortenAddress(to)}`,
      }
    }

    return {
      to: call.to,
      functionName: decoded.functionName,
      description: `调用 ${decoded.functionName}(...)`,
    }
  } catch {
    return {
      to: call.to,
      functionName: null,
      description: '合约调用',
      rawData: call.data.length > 20 ? `${call.data.slice(0, 10)}...` : call.data,
    }
  }
}

export function UsdcTransfer() {
  const { connector } = useConnection()
  const publicClient = usePublicClient()
  const { eoaAddress, isDelegated, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('0xd1122C8c941fE716C8b0C57b832c90acB4401a05')
  const [amount, setAmount] = useState('1')
  const [eoaBalance, setEoaBalance] = useState<string>('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'confirming' | 'sending' | 'success' | 'error'>('idle')
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
      const transferAmount = parseUnits(amount, 6)

      const transferData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as Address, transferAmount],
      })

      const prepareParams: PrepareCallsParams = {
        calls: [{ to: USDC_ADDRESS, data: transferData, value: '0x0' }],
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
  }, [connector, eoaAddress, recipient, amount])

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

  const decodedCalls = userOpItem?.details?.data.calls.map(decodeUsdcCall) ?? []
  const needsAuthorization = !!authItem

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold">
          2
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">USDC 转账</h2>
          <p className="text-xs text-slate-500">EIP-7702 Smart EOA，Gas 由 Alchemy 赞助</p>
        </div>
      </div>

      {!eoaAddress ? (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
          <p className="text-sm text-slate-400">请先连接钱包</p>
        </div>
      ) : (<>
      <div className="space-y-4">
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${isDelegated ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <p className="text-xs text-slate-400">
                Smart EOA (7702) {isDelegated ? '' : '- 首次交易将自动委托'}
              </p>
            </div>
            <p className="text-sm text-white font-mono break-all">{eoaAddress}</p>
            <p className="text-lg text-white font-semibold mt-1">{eoaBalance} USDC</p>
          </div>
        </div>

        {txStatus === 'confirming' && pendingResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 space-y-3">
              <h3 className="text-sm font-semibold text-amber-400">确认交易详情</h3>

              {needsAuthorization && (
                <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                  <p className="text-xs text-purple-400 font-medium mb-1">EIP-7702 委托授权</p>
                  <p className="text-xs text-slate-300">
                    将 EOA 委托给智能合约: {shortenAddress(authItem!.data.address)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    此操作仅需执行一次，后续交易只需单次签名
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-slate-400 font-medium">执行操作：</p>
                {decodedCalls.map((call, i) => (
                  <div key={i} className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-500 font-mono w-5 shrink-0">#{i + 1}</span>
                      {call.functionName && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono">
                          {call.functionName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white mt-1">{call.description}</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      合约: {shortenAddress(call.to)}
                      {call.to.toLowerCase() === USDC_ADDRESS.toLowerCase() && (
                        <span className="ml-1 text-slate-400">(USDC)</span>
                      )}
                    </p>
                    {call.rawData && (
                      <p className="text-xs text-slate-600 font-mono mt-1">data: {call.rawData}</p>
                    )}
                  </div>
                ))}
              </div>

              {userOpItem?.feePayment && (
                <div className="pt-2 border-t border-amber-500/20">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Gas 费用</span>
                    <span className={userOpItem.feePayment.sponsored ? 'text-green-400' : 'text-amber-400'}>
                      {userOpItem.feePayment.sponsored ? '已赞助（免费）' : '用户支付'}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-amber-500/20 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">签名次数</span>
                  <span className="text-slate-300">
                    {needsAuthorization ? '2 次（委托 + UserOp）' : '1 次（仅 UserOp）'}
                  </span>
                </div>
                {userOpItem && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">UserOp 类型</span>
                    <span className="text-slate-300 font-mono">{userOpItem.type}</span>
                  </div>
                )}
                {userOpItem?.details?.data.hash && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 shrink-0">UserOp Hash</span>
                    <span className="text-slate-500 font-mono truncate ml-2">
                      {userOpItem.details.data.hash}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelConfirm}
                disabled={loading}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium rounded-xl transition-all"
              >
                取消
              </button>
              <button
                onClick={confirmAndSend}
                disabled={loading}
                className="flex-1 py-3 bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    发送中...
                  </span>
                ) : (
                  '确认并签名'
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-slate-400 mb-1">接收地址</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">转账金额 (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={prepareTransfer}
              disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(eoaBalance) < parseFloat(amount)}
              className="w-full py-3 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  准备交易...
                </span>
              ) : (
                `转账 ${amount} USDC`
              )}
            </button>

            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
              <p className="text-xs text-blue-400">
                <strong>工作原理：</strong> 使用 EIP-7702 将 EOA 升级为 Smart EOA，USDC 直接从当前地址转出。
                Gas 由 Alchemy 代付。
                {!isDelegated && ' 首次交易需要额外一次委托签名（仅一次）。'}
              </p>
            </div>
          </>
        )}

        {txStatus === 'success' && txHash && (
          <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-400 font-medium">转账成功</span>
            </div>
            <p className="text-xs text-slate-400 font-mono break-all mb-2">{txHash}</p>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              在 Etherscan 查看 →
            </a>
          </div>
        )}

        {txStatus === 'error' && (
          <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
            <p className="text-sm text-red-400">转账失败</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
      )}
      </>)}
    </div>
  )
}
