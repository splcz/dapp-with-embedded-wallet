import { useUsdtSwapTransfer } from '../hooks/useUsdtSwapTransfer'
import { shortenAddress } from '../constants/usdc'
import { Spinner } from './Spinner'
import { TransactionResult } from './TransactionResult'
import { formatUnits } from 'viem'

export function UsdtSwapTransfer() {
  const {
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
  } = useUsdtSwapTransfer()

  const showApprove = amount && needsApproval(amount)

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
          3
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">USDT → USDC Swap 转账</h2>
          <p className="text-xs text-slate-500">Swap USDT 为 USDC 后转给接收方，Gas 由 Alchemy 赞助</p>
        </div>
      </div>

      {!eoaAddress ? (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
          <p className="text-sm text-slate-400">请先连接钱包</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account Info */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-xs text-slate-400">EOA 账户</p>
              </div>
              <p className="text-sm text-white font-mono break-all">{eoaAddress}</p>
              <p className="text-lg text-white font-semibold mt-1">{usdtBalance} USDT</p>
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

          {/* Confirm Panel or Form */}
          {txStatus === 'confirming' && pendingOp && swapQuote ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 space-y-3">
                <h3 className="text-sm font-semibold text-amber-400">确认 Swap & 转账</h3>

                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30 space-y-1">
                  <p className="text-xs text-emerald-400 font-medium">Swap 报价</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">支出</span>
                    <span className="text-white">{formatUnits(BigInt(swapQuote.fromAmount), 6)} USDT</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">最少获得</span>
                    <span className="text-white">{formatUnits(BigInt(swapQuote.minimumToAmount), 6)} USDC</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">报价有效期</span>
                    <span className="text-slate-300">{new Date(parseInt(swapQuote.expiry) * 1000).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">接收方</p>
                  <p className="text-sm text-white font-mono">{shortenAddress(recipient)}</p>
                  <p className="text-xs text-slate-500 mt-1">将收到至少 {formatUnits(BigInt(swapQuote.minimumToAmount), 6)} USDC</p>
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
                      <Spinner />
                      发送中...
                    </span>
                  ) : '确认并签名'}
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
                <label className="block text-xs text-slate-400 mb-1">USDT 数量（将 swap 为 USDC 后转出）</label>
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

              {/* Approve button */}
              {showApprove && (
                <button
                  onClick={approveUsdt}
                  disabled={approving}
                  className="w-full py-3 bg-linear-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
                >
                  {approving ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      授权中...
                    </span>
                  ) : '授权 SCA 使用 USDT（仅需一次，EOA 支付 Gas）'}
                </button>
              )}

              {/* Swap & Transfer button */}
              <button
                onClick={prepareSwapTransfer}
                disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(usdtBalance) < parseFloat(amount) || !!showApprove}
                className="w-full py-3 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    {txStatus === 'preparing' ? '获取报价...' : '处理中...'}
                  </span>
                ) : `Swap ${amount || '0'} USDT → USDC 并转账`}
              </button>

              <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
                <p className="text-xs text-blue-400">
                  <strong>工作原理：</strong> 通过 Alchemy Swap API 将 USDT 兑换为 USDC，然后转给接收方。
                  整个过程在一笔 UserOp 中完成，Gas 由 Alchemy 赞助。
                  首次使用需授权 SCA 使用你的 USDT（EOA 支付少量 Gas）。
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
