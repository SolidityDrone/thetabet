import {
  createBet,
  getBet,
  getBetCalculation,
  getBetFee,
  getBetTypedData,
  ODDS_DECIMALS,
  BetOrderState,
  type BetClientData,
} from '@azuro-org/toolkit'
import { parseUnits, type Address, type Hex } from 'viem'
import {
  AZURO_CHAIN_ID,
  AZURO_ZERO_AFFILIATE,
  azuroBetToken,
  azuroContracts,
  formatAzuroOdds,
} from '@/config/azuro'
import { formatAzuroOrderError, logAzuroBetDebug } from '@/services/azuro/bet-errors'
import { fetchGameConditions } from '@/services/azuro/feed'
import { assertAzuroMarketIsOnChain } from '@/services/azuro/onchain-feed'
import { ensureBetTokenApproval, signAzuroTypedData } from '@/services/wdk-evm'
import type { AzuroBetSelection, AzuroPlacedBetRecord } from '@/types/azuro'

const BET_ATTENTION =
  'By signing this transaction, I agree to place this bet on Azuro Protocol.'

const ORDER_TTL_SECONDS = 5 * 60
const PREMATCH_EXPIRY_BUFFER_SECONDS = 30
const DEFAULT_SLIPPAGE_PERCENT = 10

export type BetPlacementStage =
  | 'quoting'
  | 'approving'
  | 'waiting-approval'
  | 'signing'
  | 'submitting'
  | 'confirming'

type PlaceBetParams = {
  bettor: Address
  selection: AzuroBetSelection
  amount: string
  onStage?: (stage: BetPlacementStage) => void
}

/** Toolkit calcMinOdds truncates odds like 1.2 → 1.0 (formatToFixed bug). */
function calcMinOddsScaled(decimalOdds: number, slippagePercent = DEFAULT_SLIPPAGE_PERCENT): string {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return parseUnits('1', ODDS_DECIMALS).toString()
  }
  if (slippagePercent >= 100) {
    return parseUnits('1', ODDS_DECIMALS).toString()
  }

  const minDecimal = 1 + (decimalOdds - 1) * ((100 - slippagePercent) / 100)
  return parseUnits(minDecimal.toFixed(ODDS_DECIMALS), ODDS_DECIMALS).toString()
}

function resolveDecimalOdds(selection: AzuroBetSelection): number {
  if (selection.decimalOdds > 0) return selection.decimalOdds
  return formatAzuroOdds(selection.rawOdds)
}

/** Azuro expects unix seconds; prematch orders must expire before kickoff. */
function resolveBetExpiresAt(gameStartsAt?: string | number): number {
  const nowSec = Math.floor(Date.now() / 1000)
  const defaultExpiry = nowSec + ORDER_TTL_SECONDS

  if (gameStartsAt === undefined || gameStartsAt === null || gameStartsAt === '') {
    return defaultExpiry
  }

  const startsAtSec = Number(gameStartsAt)
  if (!Number.isFinite(startsAtSec) || startsAtSec <= 0) {
    return defaultExpiry
  }

  if (startsAtSec > nowSec) {
    const capped = Math.min(defaultExpiry, startsAtSec - PREMATCH_EXPIRY_BUFFER_SECONDS)
    if (capped <= nowSec) {
      throw new Error('This match is about to start — try another event.')
    }
    return capped
  }

  return defaultExpiry
}

async function refreshSelectionOdds(selection: AzuroBetSelection): Promise<AzuroBetSelection> {
  const conditions = await fetchGameConditions(selection.gameId)
  const condition = conditions.find((item) => item.conditionId === selection.conditionId)
  const outcome = condition?.outcomes.find((item) => item.outcomeId === selection.outcomeId)

  if (!condition || !outcome) {
    throw new Error('This market is no longer available. Pull to refresh and pick again.')
  }
  if (outcome.state !== 'Active') {
    throw new Error(`Outcome "${outcome.title}" is no longer active (${outcome.state}).`)
  }

  const refreshed: AzuroBetSelection = {
    ...selection,
    conditionTitle: condition.title,
    outcomeTitle: outcome.title,
    rawOdds: outcome.odds,
    decimalOdds: formatAzuroOdds(outcome.odds),
  }

  logAzuroBetDebug('refreshed odds', {
    gameId: refreshed.gameId,
    conditionId: refreshed.conditionId,
    outcomeId: refreshed.outcomeId,
    rawOdds: refreshed.rawOdds,
    decimalOdds: refreshed.decimalOdds,
  })

  return refreshed
}

export async function quoteAzuroBet(params: {
  bettor: Address
  conditionId: string
  outcomeId: string
  amount: string
}) {
  const stake = Number(params.amount)
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error('Enter a valid stake amount')
  }

  const [limits, fee] = await Promise.all([
    getBetCalculation({
      chainId: AZURO_CHAIN_ID,
      selections: [{ conditionId: params.conditionId, outcomeId: params.outcomeId }],
      account: params.bettor,
    }),
    getBetFee(AZURO_CHAIN_ID),
  ])

  return { limits, fee }
}

export async function placeAzuroBet(params: PlaceBetParams): Promise<AzuroPlacedBetRecord> {
  const notify = (stage: BetPlacementStage) => params.onStage?.(stage)

  const stake = Number(params.amount)
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error('Enter a valid stake amount')
  }

  notify('quoting')
  const selection = await refreshSelectionOdds(params.selection)

  await assertAzuroMarketIsOnChain({
    gameId: selection.gameId,
    conditionId: selection.conditionId,
    outcomeId: selection.outcomeId,
  })

  const { limits, fee } = await quoteAzuroBet({
    bettor: params.bettor,
    conditionId: selection.conditionId,
    outcomeId: selection.outcomeId,
    amount: params.amount,
  })

  const minStake = limits.minBet ?? 0
  const maxStake = limits.maxBet
  if (stake < minStake) {
    throw new Error(`Minimum stake is ${minStake} ${azuroBetToken.symbol}`)
  }
  if (stake > maxStake) {
    throw new Error(
      `Maximum stake for this outcome is ${maxStake.toFixed(2)} ${azuroBetToken.symbol} right now.`
    )
  }

  const requiredAmount =
    BigInt(fee.relayerFeeAmount) + parseUnits(params.amount, azuroBetToken.decimals)

  notify('approving')
  const approval = await ensureBetTokenApproval({
    tokenAddress: azuroBetToken.address,
    spender: azuroContracts.relayer.address,
    owner: params.bettor,
    requiredAmount,
    decimals: azuroBetToken.decimals,
    symbol: azuroBetToken.symbol,
  })
  if (approval === 'confirmed') {
    notify('waiting-approval')
  }

  const decimalOdds = resolveDecimalOdds(selection)
  const minOdds = calcMinOddsScaled(decimalOdds)
  const expiresAt = resolveBetExpiresAt(selection.gameStartsAt)

  const clientData: BetClientData = {
    attention: BET_ATTENTION,
    affiliate: AZURO_ZERO_AFFILIATE,
    core: azuroContracts.core.address,
    expiresAt,
    chainId: AZURO_CHAIN_ID,
    relayerFeeAmount: fee.relayerFeeAmount,
    isBetSponsored: false,
    isFeeSponsored: false,
    isSponsoredBetReturnable: false,
  }

  const bet = {
    conditionId: selection.conditionId,
    outcomeId: selection.outcomeId,
    minOdds,
    amount: parseUnits(params.amount, azuroBetToken.decimals).toString(),
    nonce: String(Date.now()),
  }

  logAzuroBetDebug('payload', {
    approval,
    clientData,
    bet,
    decimalOdds,
    maxStake,
  })

  notify('signing')
  const typedData = getBetTypedData({
    account: params.bettor,
    clientData,
    bet,
  })

  const signature = await signAzuroTypedData(typedData)

  notify('submitting')
  const result = await createBet({
    account: params.bettor,
    clientData,
    bet,
    signature: signature as Hex,
  })

  logAzuroBetDebug('createBet response', result)

  if (
    result.state === BetOrderState.Rejected ||
    result.error ||
    result.errorMessage
  ) {
    throw new Error(formatAzuroOrderError(result))
  }

  notify('confirming')
  const settled = await waitForBetOrderResult(params.bettor, result.id)
  logAzuroBetDebug('settled order', settled)

  if (settled.state === BetOrderState.Rejected) {
    const detail = settled.order ?? settled
    throw new Error(formatAzuroOrderError(detail))
  }

  return {
    id: settled.id,
    state: settled.state,
    createdAt: Date.now(),
    amount: bet.amount,
    selection,
    bettor: params.bettor,
    errorMessage: settled.errorMessage,
  }
}

const ORDER_POLL_MS = 1500
const ORDER_POLL_ATTEMPTS = 16

async function waitForBetOrderResult(bettor: Address, orderId: string) {
  for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
    const order = await getBet({ chainId: AZURO_CHAIN_ID, orderId })
    if (
      order &&
      order.state !== BetOrderState.Created &&
      order.state !== BetOrderState.Placed &&
      order.state !== BetOrderState.Sent
    ) {
      return {
        id: order.id,
        state: order.state,
        error: order.error,
        errorMessage: order.errorMessage,
        order,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_MS))
  }

  const order = await getBet({ chainId: AZURO_CHAIN_ID, orderId })
  return {
    id: orderId,
    state: order?.state ?? BetOrderState.Sent,
    error: order?.error,
    errorMessage: order?.errorMessage,
    order,
  }
}
