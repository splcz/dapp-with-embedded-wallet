import { useConnect, useConnectors } from 'wagmi'

export function ConnectButton() {
  const connectors = useConnectors()
  const { mutate: connect, isPending, error } = useConnect()

  return (
    <div className="flex flex-wrap gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="flex-1 min-w-[140px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 text-white text-sm rounded-xl transition-all"
        >
          {isPending ? '连接中...' : connector.name}
        </button>
      ))}
      {error && (
        <p className="w-full text-red-400 text-xs mt-2">{error.message}</p>
      )}
    </div>
  )
}
