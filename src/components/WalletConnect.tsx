import { useConnection } from 'wagmi'
import { Account } from './Account'
import { ConnectButton } from './ConnectButton'

export function WalletConnect() {
  const { isConnected } = useConnection()

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">
          1
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">连接钱包</h2>
          <p className="text-xs text-slate-500">使用 MetaMask 或其他钱包</p>
        </div>
      </div>
      {isConnected ? <Account /> : <ConnectButton />}
    </div>
  )
}
