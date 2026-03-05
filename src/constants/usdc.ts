import { type Address, type Hex, formatUnits, decodeFunctionData } from 'viem'

export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

export const USDC_ABI = [
  {
    name: 'transferFrom',
    type: 'function',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'nonces',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'permit',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export const CHAIN_ID = '0x1' // Ethereum mainnet

export const PERMIT_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 1,
  verifyingContract: USDC_ADDRESS,
} as const

export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export interface DecodedCall {
  to: string
  functionName: string | null
  description: string
  rawData?: string
}

export function decodeUsdcCall(call: { to: string; data?: string; value?: string }): DecodedCall {
  if (!call.data || call.data === '0x') {
    return { to: call.to, functionName: null, description: '原生转账', rawData: call.data }
  }

  try {
    const decoded = decodeFunctionData({ abi: USDC_ABI, data: call.data as Hex })

    if (decoded.functionName === 'permit') {
      const [owner, spender, value] = decoded.args as [string, string, bigint]
      return {
        to: call.to,
        functionName: 'permit',
        description: `授权 ${shortenAddress(spender)} 花费 ${formatUnits(value, 6)} USDC（签署者: ${shortenAddress(owner)}）`,
      }
    }

    if (decoded.functionName === 'transferFrom') {
      const [from, to, amount] = decoded.args as [string, string, bigint]
      return {
        to: call.to,
        functionName: 'transferFrom',
        description: `从 ${shortenAddress(from)} 转 ${formatUnits(amount, 6)} USDC 到 ${shortenAddress(to)}`,
      }
    }

    return {
      to: call.to,
      functionName: decoded.functionName,
      description: `调用 ${decoded.functionName}(...)`,
    }
  } catch {
    return {
      to: call.to,
      functionName: null,
      description: '合约调用',
      rawData: call.data.length > 20 ? `${call.data.slice(0, 10)}...` : call.data,
    }
  }
}
