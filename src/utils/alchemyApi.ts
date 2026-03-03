import { type Hex } from 'viem'

const ALCHEMY_RPC_URL = `https://api.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`

let rpcId = 0

async function alchemyRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(ALCHEMY_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ++rpcId,
      jsonrpc: '2.0',
      method,
      params,
    }),
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error))
  }
  return data.result as T
}

// --- wallet_requestAccount ---

export interface RequestAccountResult {
  accountAddress: string
  id: string
}

export async function requestAccount(signerAddress: string) {
  return alchemyRpc<RequestAccountResult>('wallet_requestAccount', [{
    signerAddress,
    creationHint: { accountType: 'sma-b' },
  }])
}

// --- wallet_prepareCalls ---

export interface PrepareCallsParams {
  calls: Array<{ to: string; data?: string; value?: string }>
  from: string
  chainId: string
  capabilities?: {
    paymasterService?: { policyId: string }
  }
}

export interface UserOperationItem {
  type: 'user-operation-v070' | 'user-operation-v060'
  data: Record<string, string>
  chainId: string
  signatureRequest: {
    type: 'personal_sign' | 'eth_signTypedData_v4'
    data: { raw: Hex } | Record<string, unknown>
    rawPayload: Hex
  }
  feePayment?: { sponsored: boolean; tokenAddress: string; maxAmount: string }
  details?: {
    type: string
    data: {
      hash: string
      calls: Array<{ to: string; data?: string; value?: string }>
    }
  }
}

export async function prepareCalls(params: PrepareCallsParams) {
  return alchemyRpc<UserOperationItem>('wallet_prepareCalls', [params])
}

// --- wallet_sendPreparedCalls ---

export interface SignedUserOperation {
  type: string
  data: Record<string, unknown>
  chainId: string
  signature: {
    type: 'secp256k1'
    data: string
  }
}

export interface SendPreparedCallsResult {
  id: string
  preparedCallIds: string[]
}

export async function sendPreparedCalls(params: SignedUserOperation) {
  return alchemyRpc<SendPreparedCallsResult>('wallet_sendPreparedCalls', [params])
}

// --- wallet_getCallsStatus ---

export interface CallsStatusResult {
  id: string
  chainId: string
  status: number
  receipts?: Array<{
    status: string
    transactionHash: Hex
    blockHash: string
    blockNumber: string
    gasUsed: string
    logs: unknown[]
  }>
}

export async function getCallsStatus(callId: string) {
  return alchemyRpc<CallsStatusResult>('wallet_getCallsStatus', [callId])
}
