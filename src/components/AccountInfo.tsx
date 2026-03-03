export function AccountInfo({
  eoaAddress,
  eoaBalance,
  scaAddress,
  isScaDeployed,
}: {
  eoaAddress: string
  eoaBalance: string
  scaAddress: string | null
  isScaDeployed: boolean
}) {
  return (
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
  )
}
