import { useConnection, useDisconnect, useEnsName } from 'wagmi'

export function Account() {
  const { address } = useConnection()
  const { mutate: disconnect } = useDisconnect()
  const { data: ensName } = useEnsName({ address })

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-slate-200 font-mono text-sm">
          {ensName ?? displayAddress}
        </span>
      </div>
      <button
        onClick={() => disconnect()}
        className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
      >
        断开
      </button>
    </div>
  )
}
