import { useState } from 'react'
import { useSwapTransfer } from '../hooks/useSwapTransfer'
import { SWAP_TOKENS, type SwapToken } from '../constants/swapTokens'
import { shortenAddress } from '../constants/usdc'
import { Spinner } from './Spinner'
import { TransactionResult } from './TransactionResult'
import { formatUnits } from 'viem'

function computeRate(quote: { fromAmount: string; minimumToAmount: string }, fromDecimals: number) {
  const from = parseFloat(formatUnits(BigInt(quote.fromAmount), fromDecimals))
  const to = parseFloat(formatUnits(BigInt(quote.minimumToAmount), 6))
  if (from === 0) return '—'
  return (to / from).toFixed(fromDecimals <= 6 ? 4 : 2)
}

export function SwapTransfer() {
  const [selectedToken, setSelectedToken] = useState<SwapToken>(SWAP_TOKENS[0])

  const {
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
  } = useSwapTransfer(selectedToken)

  const showWrap = selectedToken.isNative && needsWrap
  const showApprove = !selectedToken.isNative && needsApproval
  const canSubmit = amount && parseFloat(amount) > 0 && !showApprove && !(selectedToken.isNative && needsWrap)

  const displayDecimals = selectedToken.isNative ? 18 : selectedToken.decimals

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
          3
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Swap → USDC 转账</h2>
          <p className="text-xs text-slate-500">输入收款方期望的 USDC 金额，自动计算所需 {selectedToken.symbol}</p>
        </div>
      </div>

      {!eoaAddress ? (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
          <p className="text-sm text-slate-400">请先连接钱包</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account & Balance */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-xs text-slate-400">EOA 账户</p>
              </div>
              <p className="text-sm text-white font-mono break-all">{eoaAddress}</p>
              <p className="text-lg text-white font-semibold mt-1">
                {balance} {selectedToken.symbol}
              </p>
              {selectedToken.isNative && (
                <p className="text-xs text-slate-500 mt-0.5">
                  可用 WETH: {wethBalance}（已包装，可直接用于 swap）
                </p>
              )}
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

          {/* Confirm Panel */}
          {txStatus === 'confirming' && pendingOp && swapQuote ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 space-y-3">
                <h3 className="text-sm font-semibold text-amber-400">确认 Swap & 转账</h3>

                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30 space-y-1">
                  <p className="text-xs text-emerald-400 font-medium">Swap 报价</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">需消耗</span>
                    <span className="text-white">
                      {formatUnits(BigInt(swapQuote.fromAmount), displayDecimals)} {selectedToken.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">收款方获得</span>
                    <span className="text-white font-medium">
                      {amount} USDC
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">汇率</span>
                    <span className="text-emerald-300">
                      1 {selectedToken.symbol} ≈ {computeRate(swapQuote, displayDecimals)} USDC
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">报价有效期</span>
                    <span className="text-slate-300">
                      {new Date(parseInt(swapQuote.expiry) * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">接收方</p>
                  <p className="text-sm text-white font-mono">{shortenAddress(recipient)}</p>
                  <p className="text-xs text-slate-500 mt-1">将收到 {amount} USDC</p>
                </div>

                {pendingOp.feePayment && (
                  <div className="flex justify-between text-xs pt-2 border-t border-amber-500/20">
                    <span className="text-slate-400">Gas 费用</span>
                    <span className={pendingOp.feePayment.sponsored ? 'text-green-400' : 'text-amber-400'}>
                      {pendingOp.feePayment.sponsored ? '已赞助（免费）' : '用户支付'}
                    </span>
                  </div>
                )}
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
                      <Spinner /> 发送中...
                    </span>
                  ) : '确认并签名'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Token selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">使用代币</label>
                <div className="flex gap-2">
                  {SWAP_TOKENS.map((t) => (
                    <button
                      key={t.symbol}
                      onClick={() => setSelectedToken(t)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                        selectedToken.symbol === t.symbol
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              </div>

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
                <label className="block text-xs text-slate-400 mb-1">
                  收款方获得的 USDC 金额
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-600 mt-1">
                  将自动从你的 {selectedToken.symbol} 余额中扣除等值数量
                </p>
              </div>

              {/* ETH: Wrap WETH & Approve */}
              {showWrap && (
                <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30 space-y-2">
                  <p className="text-xs text-blue-400">
                    首次使用 ETH swap 需先将 ETH 包装为 WETH 并授权 SCA（仅需一次）
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={wrapEthAmount}
                      onChange={(e) => setWrapEthAmount(e.target.value)}
                      placeholder="要包装的 ETH 数量"
                      min="0"
                      step="0.01"
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={wrapAndApprove}
                      disabled={wrapping || !wrapEthAmount || parseFloat(wrapEthAmount) <= 0}
                      className="px-4 py-2 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap"
                    >
                      {wrapping ? <Spinner /> : 'Wrap & 授权'}
                    </button>
                  </div>
                </div>
              )}

              {/* ERC-20: Approve */}
              {showApprove && (
                <button
                  onClick={approveToken}
                  disabled={approving}
                  className="w-full py-3 bg-linear-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
                >
                  {approving ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> 授权中...
                    </span>
                  ) : `授权 SCA 使用 ${selectedToken.symbol}（仅需一次，EOA 支付 Gas）`}
                </button>
              )}

              {/* Swap & Transfer */}
              <button
                onClick={prepareSwapTransfer}
                disabled={loading || !canSubmit}
                className="w-full py-3 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    {txStatus === 'preparing' ? '获取报价...' : '处理中...'}
                  </span>
                ) : `用 ${selectedToken.symbol} 支付 ${amount || '0'} USDC`}
              </button>

              <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
                <p className="text-xs text-blue-400">
                  <strong>工作原理：</strong> 输入收款方期望的 USDC 金额，Alchemy Swap API 自动计算所需的 {selectedToken.symbol} 数量并完成兑换 + 转账。
                  Gas 由 Alchemy 赞助。
                </p>
              </div>
            </>
          )}

          <TransactionResult txStatus={txStatus} txHash={txHash} />

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
