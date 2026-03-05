import { type Address, type Hex, formatUnits, decodeFunctionData } from 'viem'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
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
] as const

export interface TokenConfig {
  symbol: string
  address: Address
  decimals: number
  abi: typeof ERC20_TRANSFER_ABI
}

export const USDC: TokenConfig = {
  symbol: 'USDC',
  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  decimals: 6,
  abi: ERC20_TRANSFER_ABI,
}

export const USDT: TokenConfig = {
  symbol: 'USDT',
  address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  decimals: 6,
  abi: ERC20_TRANSFER_ABI,
}

export const SUPPORTED_TOKENS = [USDC, USDT] as const

export const SEPOLIA_CHAIN_ID = '0xaa36a7'

export function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export interface DecodedCall {
  to: string
  functionName: string | null
  description: string
  rawData?: string
}

export function decodeTokenCall(
  token: TokenConfig,
  call: { to: string; data?: string; value?: string },
): DecodedCall {
  if (!call.data || call.data === '0x') {
    return { to: call.to, functionName: null, description: '原生转账', rawData: call.data }
  }

  try {
    const decoded = decodeFunctionData({ abi: token.abi, data: call.data as Hex })

    if (decoded.functionName === 'transfer') {
      const [to, amount] = decoded.args as [string, bigint]
      return {
        to: call.to,
        functionName: 'transfer',
        description: `转 ${formatUnits(amount, token.decimals)} ${token.symbol} 到 ${shortenAddress(to)}`,
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
