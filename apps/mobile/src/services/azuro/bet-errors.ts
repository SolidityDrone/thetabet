type AzuroOrderError = {
  error?: string | null
  errorMessage?: string | null
  state?: string
  amount?: number
  odds?: number
  conditions?: Array<{
    gameId?: string
    price?: string
    potentialLoss?: string
  }>
}

export function formatAzuroOrderError(order: AzuroOrderError): string {
  const raw = [order.errorMessage, order.error].filter(Boolean).join(' · ')
  const lower = raw.toLowerCase()

  if (lower.includes('transferfrom failed')) {
    return [
      'USDT could not be pulled from your wallet.',
      'Wait for the approval transaction to confirm, then retry.',
      'You need USDT on Polygon and POL for gas.',
    ].join(' ')
  }

  if (lower.includes('game is not active')) {
    return [
      'Azuro rejected this bet because the match is not active for on-chain betting.',
      'Pull to refresh and pick another market.',
    ].join(' ')
  }

  if (lower.includes('execution reverted')) {
    const price = order.conditions?.[0]?.price
    const hints = [
      'Azuro relayer reverted the bet on-chain.',
      price ? `Market price when processed: ${price}.` : null,
      'Common causes: market not deployed yet, odds moved after signing, or the line closed.',
      'Pull to refresh and try again, or pick another outcome.',
    ].filter(Boolean)
    return hints.join(' ')
  }

  if (raw) return raw
  if (order.state === 'Rejected') return 'Bet order was rejected by Azuro.'
  return 'Bet could not be placed.'
}

export function logAzuroBetDebug(label: string, payload: unknown) {
  if (__DEV__) {
    console.log(`[Azuro bet] ${label}`, payload)
  }
}
