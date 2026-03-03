import { useUsdcTransfer } from '../hooks/useUsdcTransfer'
import { AccountInfo } from './AccountInfo'
import { ConfirmationPanel } from './ConfirmationPanel'
import { TransferForm } from './TransferForm'
import { TransactionResult } from './TransactionResult'

export function UsdcTransfer() {
  const {
    eoaAddress,
    scaAddress,
    isScaDeployed,
    eoaBalance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    error,
    txStatus,
    txHash,
    pendingOp,
    decodedCalls,
    prepareTransfer,
    confirmAndSend,
    cancelConfirm,
  } = useUsdcTransfer()

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold">
          2
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">USDC 转账</h2>
          <p className="text-xs text-slate-500">从 EOA 转账，Gas 由 Alchemy 赞助</p>
        </div>
      </div>

      {!eoaAddress ? (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
          <p className="text-sm text-slate-400">请先连接钱包</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AccountInfo
            eoaAddress={eoaAddress}
            eoaBalance={eoaBalance}
            scaAddress={scaAddress}
            isScaDeployed={isScaDeployed}
          />

          {txStatus === 'confirming' && pendingOp ? (
            <ConfirmationPanel
              pendingOp={pendingOp}
              decodedCalls={decodedCalls}
              loading={loading}
              onConfirm={confirmAndSend}
              onCancel={cancelConfirm}
            />
          ) : (
            <TransferForm
              recipient={recipient}
              onRecipientChange={setRecipient}
              amount={amount}
              onAmountChange={setAmount}
              eoaBalance={eoaBalance}
              scaAddress={scaAddress}
              isScaDeployed={isScaDeployed}
              loading={loading}
              txStatus={txStatus}
              onSubmit={prepareTransfer}
            />
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
