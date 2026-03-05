import type { TokenConfig } from '../../constants/tokens'
import { useTokenTransfer } from '../../hooks/useTokenTransfer'
import { AccountInfo } from './AccountInfo'
import { ConfirmationPanel } from './ConfirmationPanel'
import { TransferForm } from './TransferForm'
import { TransactionResult } from './TransactionResult'

export function TokenTransfer({ token, step }: { token: TokenConfig; step: number }) {
  const {
    eoaAddress,
    isDelegated,
    balance,
    recipient,
    setRecipient,
    amount,
    setAmount,
    loading,
    error,
    txStatus,
    txHash,
    pendingResult,
    authItem,
    userOpItem,
    decodedCalls,
    needsAuthorization,
    prepareTransfer,
    confirmAndSend,
    cancelConfirm,
  } = useTokenTransfer(token)

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold">
          {step}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{token.symbol} 转账</h2>
          <p className="text-xs text-slate-500">EIP-7702 Smart EOA，Gas 由 Alchemy 赞助</p>
          <p className="text-xs text-slate-600 font-mono">
            合约:
            <a
              href={`https://sepolia.etherscan.io/token/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-blue-400 ml-1"
            >
              {token.address}
            </a>
          </p>
        </div>
      </div>

      {!eoaAddress ? (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
          <p className="text-sm text-slate-400">请先连接钱包</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <AccountInfo
              eoaAddress={eoaAddress}
              balance={balance}
              tokenSymbol={token.symbol}
              isDelegated={isDelegated}
            />

            {txStatus === 'confirming' && pendingResult ? (
              <ConfirmationPanel
                token={token}
                authItem={authItem}
                userOpItem={userOpItem}
                decodedCalls={decodedCalls}
                needsAuthorization={needsAuthorization}
                loading={loading}
                onConfirm={confirmAndSend}
                onCancel={cancelConfirm}
              />
            ) : (
              <TransferForm
                tokenSymbol={token.symbol}
                recipient={recipient}
                onRecipientChange={setRecipient}
                amount={amount}
                onAmountChange={setAmount}
                balance={balance}
                isDelegated={isDelegated}
                loading={loading}
                txStatus={txStatus}
                onSubmit={prepareTransfer}
              />
            )}

            <TransactionResult txStatus={txStatus} txHash={txHash} />
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
          )}
        </>
      )}
    </div>
  )
}
