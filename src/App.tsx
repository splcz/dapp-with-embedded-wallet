import { WalletConnect } from './components/WalletConnect'
import { UsdcTransfer } from './components/UsdcTransfer'
import { UsdtSwapTransfer } from './components/UsdtSwapTransfer'
import { SmartWalletProvider } from './contexts/SmartWalletContext'

function App() {
  return (
    <SmartWalletProvider>
      <div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center py-12 px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
            Alchemy Relayer Demo
          </h1>
          <p className="text-orange-400 text-sm whitespace-pre-wrap">
            {'Demo 运行在 Ethereum 主网'}
          </p>
          <p className="text-slate-400 text-sm whitespace-pre-wrap">
            {'使用 EIP-2612 Permit + transferFrom 执行转账\nGas 由 Alchemy 赞助'}
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-lg bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
          {/* Step 1: Connect Wallet */}
          <WalletConnect />

          {/* Divider */}
          <div className="h-px bg-linear-to-r from-transparent via-slate-700 to-transparent" />

          {/* Step 2: USDC Transfer */}
          <UsdcTransfer />

          {/* Divider */}
          <div className="h-px bg-linear-to-r from-transparent via-slate-700 to-transparent" />

          {/* Step 3: USDT Swap & Transfer */}
          <UsdtSwapTransfer />
        </div>

        {/* Footer */}
        <p className="mt-8 text-slate-600 text-xs">
          Powered by Alchemy Account Kit • Ethereum Mainnet
        </p>
      </div>
    </SmartWalletProvider>
  )
}

export default App
