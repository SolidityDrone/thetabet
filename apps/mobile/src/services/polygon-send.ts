import { THETA_DEPLOYMENT } from '@/config/contracts.generated'
import { getChain } from '@/config/chains'
import {
  getWalletEvmAddress,
  sendSignedEvmTransaction,
  waitForEvmTransaction,
} from '@/services/wdk-local-signer'
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  http,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { polygon } from 'viem/chains'

const GAS_BUFFER_NUMERATOR = 150n
const GAS_BUFFER_DENOMINATOR = 100n
const QUOTE_RECIPIENT = '0x0000000000000000000000000000000000000001' as Address

const chain = getChain('polygon')
const usdtDecimals = chain.assets.find((asset) => asset.id === 'betToken')?.decimals ?? 6

let publicClient: ReturnType<typeof createPublicClient> | null = null

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: polygon,
      transport: http(chain.rpcUrl),
    })
  }
  return publicClient
}

export function isNativeSendToken(tokenId: string) {
  const id = tokenId.toLowerCase()
  return id === 'pol' || id === 'matic'
}

export function isPolygonSendToken(tokenId: string) {
  const id = tokenId.toLowerCase()
  return isNativeSendToken(id) || id === 'usdt'
}

function parseTokenAmount(tokenId: string, amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid amount')
  }
  if (isNativeSendToken(tokenId)) {
    return parseEther(amount.toString())
  }
  return parseUnits(amount.toString(), usdtDecimals)
}

function buildTransferRequest(tokenId: string, recipient: Address, amount: bigint) {
  if (isNativeSendToken(tokenId)) {
    return {
      to: recipient,
      data: '0x' as Hex,
      value: amount,
    }
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient, amount],
  })

  return {
    to: THETA_DEPLOYMENT.betToken,
    data,
    value: 0n,
  }
}

async function estimateGasCostPol(params: {
  from: Address
  to: Address
  data: Hex
  value: bigint
}) {
  const rpc = getPublicClient()
  const gasEstimate = await rpc.estimateGas({
    account: params.from,
    to: params.to,
    data: params.data,
    value: params.value,
  })
  const gas = (gasEstimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR
  const gasPrice = await rpc.getGasPrice()
  const feeWei = gas * gasPrice
  return {
    feePol: Number(formatEther(feeWei)),
    feeWei,
  }
}

export async function estimatePolygonSendFee(params: {
  tokenId: string
  amount?: number
  recipientAddress?: string
}): Promise<{ fee?: number; error?: string }> {
  try {
    const recipient = params.recipientAddress?.trim()
    const to =
      recipient && isAddress(recipient) ? (recipient as Address) : QUOTE_RECIPIENT
    const from = await getWalletEvmAddress()
    const amount = parseTokenAmount(params.tokenId, params.amount ?? (isNativeSendToken(params.tokenId) ? 0.001 : 1))
    const request = buildTransferRequest(params.tokenId, to, amount)
    const { feePol } = await estimateGasCostPol({
      from,
      to: request.to,
      data: request.data,
      value: request.value,
    })
    return { fee: feePol }
  } catch (error) {
    console.error('Polygon gas fee pre-calculation failed:', error)
    return {
      fee: undefined,
      error: error instanceof Error ? error.message : 'Failed to calculate fee',
    }
  }
}

export async function sendPolygonTransfer(params: {
  tokenId: string
  recipientAddress: string
  amount: number
}): Promise<{ hash: Hex; fee: string }> {
  if (!isAddress(params.recipientAddress)) {
    throw new Error('Invalid recipient address')
  }

  const recipient = params.recipientAddress as Address
  const amount = parseTokenAmount(params.tokenId, params.amount)
  const request = buildTransferRequest(params.tokenId, recipient, amount)
  const from = await getWalletEvmAddress()

  const { feeWei } = await estimateGasCostPol({
    from,
    to: request.to,
    data: request.data,
    value: request.value,
  })

  if (isNativeSendToken(params.tokenId)) {
    const balance = await getPublicClient().getBalance({ address: from })
    if (balance < amount + feeWei) {
      throw new Error('Insufficient POL balance for amount and gas')
    }
  }

  const { hash } = await sendSignedEvmTransaction({
    to: request.to,
    data: request.data,
    value: request.value === 0n ? undefined : request.value,
  })

  const receipt = await waitForEvmTransaction(hash)
  const effectiveGasPrice = receipt.effectiveGasPrice ?? 0n
  const fee = receipt.gasUsed * effectiveGasPrice

  return {
    hash,
    fee: fee.toString(),
  }
}
