import type { Hex } from 'viem'
import type { TxStatus } from '../hooks/useUsdcTransfer'

export function TransactionResult({ txStatus, txHash }: { txStatus: TxStatus; txHash: Hex | null }) {
  if (txStatus === 'success' && txHash) {
    return (
      <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-400 font-medium">转账成功</span>
        </div>
        <p className="text-xs text-slate-400 font-mono break-all mb-2">{txHash}</p>
        <a
          href={`https://etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          在 Etherscan 查看 →
        </a>
      </div>
    )
  }

  if (txStatus === 'error') {
    return (
      <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
        <p className="text-sm text-red-400">转账失败</p>
      </div>
    )
  }

  return null
}
