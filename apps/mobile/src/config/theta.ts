import type { Address } from 'viem'

import {
  PONDER_GRAPHQL_URL,
  THETA_DEPLOYMENT,
} from '@/config/contracts.generated'

/** ThetaSingleton on Polygon — auto-synced from ponder/deployments/polygon.json after deploy */
export const THETA_SINGLETON_ADDRESS = THETA_DEPLOYMENT.thetaSingleton

export const BET_TOKEN_ADDRESS = THETA_DEPLOYMENT.betToken as Address
export const AZURO_LP_ADDRESS = THETA_DEPLOYMENT.azuroLP as Address
export const AZURO_CORE_ADDRESS = THETA_DEPLOYMENT.azuroCore as Address

export { PONDER_GRAPHQL_URL }

export const BET_TOKEN_DECIMALS = 6

export const thetaSingletonAbi = [
  {
    type: 'function',
    name: 'createVault',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerTipsterName',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'pubKeyX', type: 'bytes32' },
      { name: 'pubKeyY', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'tipsterPubKeyX',
    inputs: [{ name: 'tipster', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tipsterPubKeyY',
    inputs: [{ name: 'tipster', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lookupTipsterByName',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: 'tipster', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tipsterNames',
    inputs: [{ name: 'tipster', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultIdOfTipster',
    inputs: [{ name: 'tipster', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultOf',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultFreeBalance',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultTotalAssets',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const tipsterVaultAbi = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const TIPSTER_NAME_PATTERN = /^[a-z0-9_]{3,20}$/
export const TIPSTER_NAME_NO_EDGE_UNDERSCORE = /^(?!_)(?!.*_$)/

export function formatBetToken(amount: bigint | string | number, digits = 2) {
  const value = typeof amount === 'bigint' ? Number(amount) / 10 ** BET_TOKEN_DECIMALS : Number(amount)
  if (!Number.isFinite(value)) return '0.00'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function calcWinRate(wins: number, losses: number) {
  const total = wins + losses
  if (total === 0) return null
  return (wins / total) * 100
}

export function calcRoiPercent(totalStaked: bigint, totalPayout: bigint) {
  if (totalStaked <= 0n) return null
  const staked = Number(totalStaked) / 10 ** BET_TOKEN_DECIMALS
  const payout = Number(totalPayout) / 10 ** BET_TOKEN_DECIMALS
  return ((payout - staked) / staked) * 100
}

export function isThetaDeployed() {
  return THETA_SINGLETON_ADDRESS !== '0x0000000000000000000000000000000000000000'
}
