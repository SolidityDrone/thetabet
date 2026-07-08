import { chainsData, type BetClientData } from '@azuro-org/toolkit'
import { AZURO_CHAIN_ID } from '@/config/azuro'
import type { Address, Hex } from 'viem'

type VaultBetOrderBet = {
  conditionId: string
  outcomeId: string
  minOdds: string
  amount: string
  nonce: string
}

type CreateVaultBetParams = {
  bettor: Address
  betOwner: Address
  clientData: BetClientData
  bet: VaultBetOrderBet
  signature: Hex
}

/** Azuro toolkit `createBet` hardcodes betOwner = bettor; vault bets need betOwner = singleton. */
export async function createVaultBetOrder(params: CreateVaultBetParams) {
  const { bettor, betOwner, clientData, bet, signature } = params
  const { chainId } = clientData
  const { api, environment } = chainsData[chainId]

  const signedBet = {
    environment,
    bettor: bettor.toLowerCase(),
    betOwner: betOwner.toLowerCase(),
    clientBetData: {
      clientData,
      bet: {
        conditionId: String(bet.conditionId),
        outcomeId: Number(bet.outcomeId),
        minOdds: String(bet.minOdds),
        amount: String(bet.amount),
        nonce: String(bet.nonce),
      },
    },
    bettorSignature: signature,
  }

  const response = await fetch(`${api}/bet/orders/ordinar`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signedBet),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data?.errorMessage || `Status: ${response.status}`)
    if (data?.error) {
      ;(error as Error & { cause?: Error }).cause = new Error(data.error)
    }
    throw error
  }

  return data as {
    id: string
    state: string
    error?: string | null
    errorMessage?: string | null
    tokenId?: string | number | null
    tokenIds?: Array<string | number> | null
  }
}
