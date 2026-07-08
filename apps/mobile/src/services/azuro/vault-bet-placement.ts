import {
  BetOrderState,
  getBet,
  getBetFee,
  getBetTypedData,
  ODDS_DECIMALS,
  type BetClientData,
} from '@azuro-org/toolkit'
import {
  AZURO_CHAIN_ID,
  AZURO_ZERO_AFFILIATE,
  azuroBetToken,
  azuroContracts,
  formatAzuroOdds,
} from '@/config/azuro'
import {
  BET_TOKEN_DECIMALS,
  THETA_SINGLETON_ADDRESS,
  formatBetToken,
  thetaSingletonAbi,
} from '@/config/theta'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'
import { formatAzuroOrderError, logAzuroBetDebug } from '@/services/azuro/bet-errors'
import { quoteAzuroBet, type BetPlacementStage } from '@/services/azuro/bet-placement'
import { createVaultBetOrder } from '@/services/azuro/vault-bet-api'
import { assertAzuroMarketIsOnChain } from '@/services/azuro/onchain-feed'
import { fetchGameConditions } from '@/services/azuro/feed'
import { sendWdkTransaction, signAzuroTypedData } from '@/services/wdk-evm'
import { waitForEvmTransaction } from '@/services/wdk-local-signer'
import { readVaultIdOfTipster } from '@/services/theta-vault'
import type { AzuroBetSelection } from '@/types/azuro'
import getErrorMessage from '@/utils/get-error-message'
import {
  createPublicClient,
  encodeFunctionData,
  hashTypedData,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { polygon } from 'viem/chains'

const BET_ATTENTION =
  'By signing this transaction, I agree to place this vault bet on Azuro Protocol.'

const ORDER_TTL_SECONDS = 5 * 60
const PREMATCH_EXPIRY_BUFFER_SECONDS = 30
const DEFAULT_SLIPPAGE_PERCENT = 10
const ORDER_POLL_MS = 1500
const ORDER_POLL_ATTEMPTS = 16
const ORDER_BET_ID_POLL_ATTEMPTS = 20

const CONTRACT_UPGRADE_MESSAGE =
  'Vault betting needs an updated ThetaSingleton contract on Polygon (prepareVaultBet + ERC-1271). ' +
  'Redeploy contracts and sync addresses, then try again.'

let publicClient: ReturnType<typeof createPublicClient> | null = null

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: polygon,
      transport: http(THETA_DEPLOYMENT.rpcUrl),
    })
  }
  return publicClient
}

export type VaultBetPlacementStage =
  | BetPlacementStage
  | 'preparing-vault'
  | 'confirming-vault'
  | 'completing-vault'
  | 'canceling-vault'

type PlaceVaultBetParams = {
  tipster: Address
  selection: AzuroBetSelection
  /** Stake in USDT (human-readable, e.g. "2.5"). */
  amountUsdt: string
  onStage?: (stage: VaultBetPlacementStage) => void
}

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
  const conditions = await fetchGameConditions(selection.gameId, { verify: true })
  const condition = conditions.find((item) => item.conditionId === selection.conditionId)
  const outcome = condition?.outcomes.find((item) => item.outcomeId === selection.outcomeId)

  if (!condition || !outcome) {
    throw new Error('This market is no longer available. Pull to refresh and pick again.')
  }
  if (outcome.state !== 'Active') {
    throw new Error(`Outcome "${outcome.title}" is no longer active (${outcome.state}).`)
  }

  return {
    ...selection,
    conditionTitle: condition.title,
    outcomeTitle: outcome.title,
    rawOdds: outcome.odds,
    decimalOdds: formatAzuroOdds(outcome.odds),
  }
}

async function readVaultFreeBalance(vaultId: bigint): Promise<bigint> {
  return getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'vaultFreeBalance',
    args: [vaultId],
  })
}

async function assertPrepareVaultBetAvailable(
  vaultId: bigint,
  stakeRaw: bigint,
  relayerFeeRaw: bigint,
  orderHash: Hex,
  expiresAt: number,
  tipster: Address
) {
  const data = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'prepareVaultBet',
    args: [vaultId, stakeRaw, relayerFeeRaw, orderHash, BigInt(expiresAt)],
  })

  try {
    await getPublicClient().call({
      account: tipster,
      to: THETA_SINGLETON_ADDRESS,
      data,
    })
  } catch (error) {
    const message = getErrorMessage(error, 'prepareVaultBet simulation failed')
    if (
      message.includes('execution reverted') &&
      !message.includes('InsufficientFreeBalance') &&
      !message.includes('OnlyTipster') &&
      !message.includes('ZeroAmount') &&
      !message.includes('PendingVaultBetExpired') &&
      !message.includes('InvalidVaultBetAuthorization')
    ) {
      throw new Error(CONTRACT_UPGRADE_MESSAGE)
    }
    throw error
  }
}

async function cancelVaultBetPreparation(vaultId: bigint) {
  const data = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'cancelVaultBetPreparation',
    args: [vaultId],
  })

  const { hash } = await sendWdkTransaction({
    to: THETA_SINGLETON_ADDRESS,
    data,
  })
  await waitForEvmTransaction(hash)
}

type AzuroOrderBetIdSource = {
  betId?: string | number | null
  tokenId?: string | number | null
  tokenIds?: Array<string | number> | null
  meta?: { betId?: string | number | null } | null
}

function readAzuroBetTokenId(order: AzuroOrderBetIdSource | null | undefined): bigint | null {
  if (!order) return null

  const direct =
    order.betId ??
    order.meta?.betId ??
    order.tokenId ??
    order.tokenIds?.[0]

  if (direct === undefined || direct === null || direct === '') {
    return null
  }

  return BigInt(direct)
}

function resolveAzuroTokenId(order: AzuroOrderBetIdSource): bigint {
  const tokenId = readAzuroBetTokenId(order)
  if (tokenId === null) {
    throw new Error('Azuro accepted the bet but no bet NFT id was returned. Try again in a moment.')
  }
  return tokenId
}

async function waitForVaultBetOrderResult(bettor: Address, orderId: string) {
  const maxAttempts = ORDER_POLL_ATTEMPTS + ORDER_BET_ID_POLL_ATTEMPTS

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const order = await getBet({ chainId: AZURO_CHAIN_ID, orderId })
    if (!order) {
      await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_MS))
      continue
    }

    const stillPending =
      order.state === BetOrderState.Created ||
      order.state === BetOrderState.Placed ||
      order.state === BetOrderState.Sent

    const betTokenId = readAzuroBetTokenId(order)
    const terminal = !stillPending
    const rejected = order.state === BetOrderState.Rejected
    const acceptedWithBetId =
      order.state === BetOrderState.Accepted && betTokenId !== null

    if (terminal && (rejected || acceptedWithBetId || order.state === BetOrderState.Settled)) {
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

export async function placeVaultAzuroBet(params: PlaceVaultBetParams) {
  const notify = (stage: VaultBetPlacementStage) => params.onStage?.(stage)
  const stake = Number(params.amountUsdt)

  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error('Enter a valid vault stake amount.')
  }

  notify('quoting')
  const selection = await refreshSelectionOdds(params.selection)

  await assertAzuroMarketIsOnChain({
    gameId: selection.gameId,
    conditionId: selection.conditionId,
    outcomeId: selection.outcomeId,
  })

  const vaultId = await readVaultIdOfTipster(params.tipster)
  if (vaultId === 0n) {
    throw new Error('Set up your tipster vault in Profile before betting as a tipster.')
  }

  const [freeBalance, { limits }, fee] = await Promise.all([
    readVaultFreeBalance(vaultId),
    quoteAzuroBet({
      bettor: THETA_SINGLETON_ADDRESS,
      conditionId: selection.conditionId,
      outcomeId: selection.outcomeId,
      amount: params.amountUsdt,
    }),
    getBetFee(AZURO_CHAIN_ID),
  ])

  const amountRaw = parseUnits(params.amountUsdt, BET_TOKEN_DECIMALS)
  const relayerFeeRaw = BigInt(fee.relayerFeeAmount)
  const totalReserved = amountRaw + relayerFeeRaw

  if (totalReserved > freeBalance) {
    throw new Error(
      `Vault only has ${formatBetToken(freeBalance)} USDT free to bet (stake + relayer fee). ` +
        'Some liquidity may be locked in open bets or pending withdrawals.'
    )
  }

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

  const minOdds = calcMinOddsScaled(selection.decimalOdds)
  const expiresAt = resolveBetExpiresAt(selection.gameStartsAt)
  const nonce = String(Date.now())

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
    amount: amountRaw.toString(),
    nonce,
  }

  const typedData = getBetTypedData({
    account: THETA_SINGLETON_ADDRESS,
    clientData,
    bet,
  })

  const orderHash = hashTypedData(
    typedData as Parameters<typeof hashTypedData>[0]
  )

  await assertPrepareVaultBetAvailable(
    vaultId,
    amountRaw,
    relayerFeeRaw,
    orderHash,
    expiresAt,
    params.tipster
  )

  notify('preparing-vault')
  const prepareData = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'prepareVaultBet',
    args: [vaultId, amountRaw, relayerFeeRaw, orderHash, BigInt(expiresAt)],
  })

  const { hash: prepareHash } = await sendWdkTransaction({
    to: THETA_SINGLETON_ADDRESS,
    data: prepareData,
  })

  notify('confirming-vault')
  await waitForEvmTransaction(prepareHash)

  let prepared = true
  let azuroAccepted = false

  try {
    notify('signing')
    const signature = await signAzuroTypedData(typedData)

    logAzuroBetDebug('vault bet payload', {
      vaultId: vaultId.toString(),
      bettor: THETA_SINGLETON_ADDRESS,
      betOwner: THETA_SINGLETON_ADDRESS,
      orderHash,
      amount: amountRaw.toString(),
      relayerFee: relayerFeeRaw.toString(),
      clientData,
      bet,
    })

    notify('submitting')
    const result = await createVaultBetOrder({
      bettor: THETA_SINGLETON_ADDRESS,
      betOwner: THETA_SINGLETON_ADDRESS,
      clientData,
      bet,
      signature: signature as Hex,
    })

    logAzuroBetDebug('createVaultBet response', result)

    if (
      result.state === BetOrderState.Rejected ||
      result.error ||
      result.errorMessage
    ) {
      throw new Error(formatAzuroOrderError(result))
    }

    notify('confirming')
    const settled = await waitForVaultBetOrderResult(THETA_SINGLETON_ADDRESS, result.id)
    logAzuroBetDebug('settled vault order', settled)

    if (settled.state === BetOrderState.Rejected) {
      const detail = settled.order ?? settled
      throw new Error(formatAzuroOrderError(detail))
    }

    if (settled.state === BetOrderState.Accepted || settled.state === BetOrderState.Settled) {
      azuroAccepted = true
    }

    const azuroTokenId = resolveAzuroTokenId(settled.order ?? settled)
    prepared = false

    notify('completing-vault')
    const completeData = encodeFunctionData({
      abi: thetaSingletonAbi,
      functionName: 'completeVaultBet',
      args: [
        vaultId,
        azuroContracts.core.address,
        azuroTokenId,
        BigInt(selection.conditionId),
        BigInt(selection.outcomeId),
        amountRaw,
      ],
    })

    const { hash: completeHash } = await sendWdkTransaction({
      to: THETA_SINGLETON_ADDRESS,
      data: completeData,
    })

    const receipt = await waitForEvmTransaction(completeHash)

    return {
      hash: receipt.transactionHash,
      prepareHash,
      completeHash: receipt.transactionHash,
      orderId: settled.id,
      azuroTokenId: azuroTokenId.toString(),
      vaultId: vaultId.toString(),
      amount: amountRaw.toString(),
      selection,
    }
  } catch (error) {
    if (prepared && !azuroAccepted) {
      try {
        notify('canceling-vault')
        await cancelVaultBetPreparation(vaultId)
      } catch (cancelError) {
        console.error('Failed to cancel prepared vault bet:', cancelError)
      }
    }
    throw error
  }
}

/** Recover a vault bet NFT minted to the singleton after a failed `completeVaultBet`. */
export async function recoverOrphanVaultBet(params: {
  tipster: Address
  vaultId: bigint
  azuroTokenId: bigint
  conditionId: string
  outcomeId: string
  stakeRaw: bigint
  relayerFeeRaw: bigint
}) {
  const data = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'recoverOrphanVaultBet',
    args: [
      params.vaultId,
      azuroContracts.core.address,
      params.azuroTokenId,
      BigInt(params.conditionId),
      BigInt(params.outcomeId),
      params.stakeRaw,
      params.relayerFeeRaw,
    ],
  })

  const { hash } = await sendWdkTransaction({
    to: THETA_SINGLETON_ADDRESS,
    data,
  })

  return waitForEvmTransaction(hash)
}
