import type { TxStatus } from '../../hooks/useTokenTransfer'
import { Spinner } from '../common/Spinner'

export function TransferForm({
  tokenSymbol,
  recipient,
  onRecipientChange,
  amount,
  onAmountChange,
  balance,
  isDelegated,
  loading,
  txStatus,
  onSubmit,
}: {
  tokenSymbol: string
  recipient: string
  onRecipientChange: (v: string) => void
  amount: string
  onAmountChange: (v: string) => void
  balance: string
  isDelegated: boolean
  loading: boolean
  txStatus: TxStatus
  onSubmit: () => void
}) {
  return (
    <>
      <div>
        <label className="block text-xs text-slate-400 mb-1">接收地址</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => onRecipientChange(e.target.value)}
          placeholder="0x..."
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">转账金额 ({tokenSymbol})</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(balance) < parseFloat(amount)}
        className="w-full py-3 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner />
            {txStatus === 'preparing' ? '准备交易...' : '转账中...'}
          </span>
        ) : (
          `转账 ${amount} ${tokenSymbol}`
        )}
      </button>

      <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
        <p className="text-xs text-blue-400">
          <strong>工作原理：</strong> 使用 EIP-7702 将 EOA 升级为 Smart EOA，{tokenSymbol} 直接从当前地址转出。
          Gas 由 Alchemy 代付。
          {!isDelegated && ' 首次交易需要额外一次委托签名（仅一次）。'}
        </p>
      </div>
    </>
  )
}
