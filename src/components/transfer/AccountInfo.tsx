export function AccountInfo({
  eoaAddress,
  balance,
  tokenSymbol,
  isDelegated,
}: {
  eoaAddress: string
  balance: string
  tokenSymbol: string
  isDelegated: boolean
}) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${isDelegated ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <p className="text-xs text-slate-400">
            Smart EOA (7702) {isDelegated ? '' : '- 首次交易将自动委托'}
          </p>
        </div>
        <p className="text-sm text-white font-mono break-all">{eoaAddress}</p>
        <p className="text-lg text-white font-semibold mt-1">{balance} {tokenSymbol}</p>
      </div>
    </div>
  )
}
