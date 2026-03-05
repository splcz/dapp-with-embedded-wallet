import { type Address } from 'viem'

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'transferFrom',
    type: 'function',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

export interface SwapToken {
  symbol: string
  address: string
  decimals: number
  isNative: boolean
  abi: typeof ERC20_ABI
  requiresZeroApprove?: boolean
}

export const SWAP_TOKENS: SwapToken[] = [
  {
    symbol: 'USDT',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
    decimals: 6,
    isNative: false,
    abi: ERC20_ABI,
    requiresZeroApprove: true,
  },
  {
    symbol: 'ETH',
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    isNative: true,
    abi: ERC20_ABI,
  },
]
