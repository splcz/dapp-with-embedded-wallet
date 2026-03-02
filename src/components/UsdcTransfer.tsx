import { useState, useCallback, useEffect } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { useSmartWallet } from '../hooks/useSmartWallet'
import { type Address, type Hex, parseUnits, formatUnits, encodeFunctionData } from 'viem'
import {
  prepareCalls,
  sendPreparedCalls,
  getCallsStatus,
  type PrepareCallsParams,
  type UserOperationItem,
  type SignedUserOperation,
} from '../utils/alchemyApi'

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address

const USDC_ABI = [
  {
    name: 'transferFrom',
    type: 'function',
    inputs: [
      { name: 'from', type: 'address' },
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
  {
    name: 'nonces',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'permit',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

const SEPOLIA_CHAIN_ID = '0xaa36a7' // 11155111

export function UsdcTransfer() {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { scaAddress, eoaAddress, isScaDeployed, refreshScaStatus } = useSmartWallet()

  const [recipient, setRecipient] = useState('0xd1122C8c941fE716C8b0C57b832c90acB4401a05')
  const [amount, setAmount] = useState('1')
  const [eoaBalance, setEoaBalance] = useState<string>('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txStatus, setTxStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)

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
    if (!walletClient) throw new Error('Wallet not connected')

    const { signatureRequest } = item
    let signature: Hex

    if (signatureRequest.type === 'personal_sign') {
      const rawData = signatureRequest.data as { raw: Hex }
      signature = await walletClient.signMessage({
        message: { raw: rawData.raw as `0x${string}` },
      })
    } else if (signatureRequest.type === 'eth_signTypedData_v4') {
      const typedData = signatureRequest.data as {
        domain: Record<string, unknown>
        types: Record<string, Array<{ name: string; type: string }>>
        primaryType: string
        message: Record<string, unknown>
      }
      signature = await walletClient.signTypedData({
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
  }, [walletClient])

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

  const transferUsdc = useCallback(async () => {
    if (!walletClient || !scaAddress || !publicClient || !eoaAddress || !recipient || !amount) return

    setLoading(true)
    setTxStatus('sending')
    setError('')
    setTxHash(null)

    try {
      const transferAmount = parseUnits(amount, 6)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

      // 1. 获取 EOA 在 USDC 合约的 nonce
      const nonce = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'nonces',
        args: [eoaAddress],
      }) as bigint

      // 2. 构建 EIP-2612 Permit 签名数据
      const domain = {
        name: 'USDC',
        version: '2',
        chainId: 11155111,
        verifyingContract: USDC_ADDRESS,
      }

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      }

      const message = {
        owner: eoaAddress,
        spender: scaAddress,
        value: transferAmount,
        nonce: nonce,
        deadline: deadline,
      }

      // 3. EOA 签名 Permit（免 Gas）
      const permitSignature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: 'Permit',
        message,
      })

      const r = permitSignature.slice(0, 66) as Hex
      const s = ('0x' + permitSignature.slice(66, 130)) as Hex
      const v = parseInt(permitSignature.slice(130, 132), 16)

      // 4. 编码 permit 调用
      const permitData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'permit',
        args: [eoaAddress, scaAddress, transferAmount, deadline, v, r, s],
      })

      // 5. 编码 transferFrom 调用
      const transferFromData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transferFrom',
        args: [eoaAddress, recipient as Address, transferAmount],
      })

      // 6. wallet_prepareCalls（从 SCA 发起，批量执行 permit + transferFrom）
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

      // 7. 签名 UserOperation
      const signed = await signUserOperation(prepared)

      // 8. wallet_sendPreparedCalls
      const result = await sendPreparedCalls(signed)
      const callId = result.preparedCallIds[0] ?? result.id
      if (!callId) throw new Error('Missing call id')

      // 9. 轮询 wallet_getCallsStatus
      const hash = await waitForConfirmation(callId)

      setTxHash(hash)
      setTxStatus('success')
      await refreshScaStatus()
    } catch (err) {
      console.error('Transfer failed:', err)
      setError(err instanceof Error ? err.message : '转账失败')
      setTxStatus('error')
    } finally {
      setLoading(false)
    }
  }, [walletClient, scaAddress, publicClient, eoaAddress, recipient, amount, signUserOperation, waitForConfirmation, refreshScaStatus])

  if (!eoaAddress) {
    return null
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold">
          2
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">USDC 转账</h2>
          <p className="text-xs text-slate-500">从 EOA 转账，Gas 由 Alchemy 赞助</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* 账户信息 */}
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs text-slate-400">EOA 账户</p>
            </div>
            <p className="text-sm text-white font-mono break-all">{eoaAddress}</p>
            <p className="text-lg text-white font-semibold mt-1">{eoaBalance} USDC</p>
          </div>

          <div className="pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${isScaDeployed ? 'bg-blue-500' : 'bg-yellow-500'}`} />
              <p className="text-xs text-slate-400">
                智能账户 (SCA) {isScaDeployed ? '' : '- 将在首次交易时自动创建'}
              </p>
            </div>
            {scaAddress && (
              <p className="text-sm text-slate-300 font-mono break-all">{scaAddress}</p>
            )}
          </div>
        </div>

        {/* 目标地址 */}
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

        {/* 转账金额 */}
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

        {/* 转账按钮 */}
        <button
          onClick={transferUsdc}
          disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(eoaBalance) < parseFloat(amount) || !scaAddress}
          className="w-full py-3 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {!isScaDeployed ? '创建智能账户并转账...' : '转账中...'}
            </span>
          ) : (
            `转账 ${amount} USDC`
          )}
        </button>

        {/* 说明 */}
        <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
          <p className="text-xs text-blue-400">
            <strong>工作原理：</strong> EOA 签名 Permit 授权（免 Gas），SCA 执行 permit + transferFrom。
            Gas 由 Alchemy 代付，USDC 直接从 EOA 扣除。
            {!isScaDeployed && ' 首次转账会自动创建智能账户。'}
          </p>
        </div>

        {/* 交易结果 */}
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
    </div>
  )
}
