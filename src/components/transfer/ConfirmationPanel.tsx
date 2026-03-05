import { shortenAddress, type DecodedCall } from '../../constants/tokens'
import type { TokenConfig } from '../../constants/tokens'
import type { AuthorizationItem, UserOperationItem } from '../../utils/alchemyApi'
import { Spinner } from '../common/Spinner'

export function ConfirmationPanel({
  token,
  authItem,
  userOpItem,
  decodedCalls,
  needsAuthorization,
  loading,
  onConfirm,
  onCancel,
}: {
  token: TokenConfig
  authItem: AuthorizationItem | null
  userOpItem: UserOperationItem | null
  decodedCalls: DecodedCall[]
  needsAuthorization: boolean
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 space-y-3">
        <h3 className="text-sm font-semibold text-amber-400">确认交易详情</h3>

        {needsAuthorization && authItem && (
          <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
            <p className="text-xs text-purple-400 font-medium mb-1">EIP-7702 委托授权</p>
            <p className="text-xs text-slate-300">
              将 EOA 委托给智能合约: {shortenAddress(authItem.data.address)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              此操作仅需执行一次，后续交易只需单次签名
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-medium">执行操作：</p>
          {decodedCalls.map((call, i) => (
            <div key={i} className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 font-mono w-5 shrink-0">#{i + 1}</span>
                {call.functionName && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono">
                    {call.functionName}
                  </span>
                )}
              </div>
              <p className="text-sm text-white mt-1">{call.description}</p>
              <p className="text-xs text-slate-500 font-mono mt-1">
                合约: {shortenAddress(call.to)}
                {call.to.toLowerCase() === token.address.toLowerCase() && (
                  <span className="ml-1 text-slate-400">({token.symbol})</span>
                )}
              </p>
              {call.rawData && (
                <p className="text-xs text-slate-600 font-mono mt-1">data: {call.rawData}</p>
              )}
            </div>
          ))}
        </div>

        {userOpItem?.feePayment && (
          <div className="pt-2 border-t border-amber-500/20">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Gas 费用</span>
              <span className={userOpItem.feePayment.sponsored ? 'text-green-400' : 'text-amber-400'}>
                {userOpItem.feePayment.sponsored ? '已赞助（免费）' : '用户支付'}
              </span>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-amber-500/20 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">签名次数</span>
            <span className="text-slate-300">
              {needsAuthorization ? '2 次（委托 + UserOp）' : '1 次（仅 UserOp）'}
            </span>
          </div>
          {userOpItem && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">UserOp 类型</span>
              <span className="text-slate-300 font-mono">{userOpItem.type}</span>
            </div>
          )}
          {userOpItem?.details?.data.hash && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 shrink-0">UserOp Hash</span>
              <span className="text-slate-500 font-mono truncate ml-2">
                {userOpItem.details.data.hash}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium rounded-xl transition-all"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-3 bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              发送中...
            </span>
          ) : (
            '确认并签名'
          )}
        </button>
      </div>
    </div>
  )
}
