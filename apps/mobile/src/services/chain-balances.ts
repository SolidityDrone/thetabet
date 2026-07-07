import type { ThetaAssetDefinition, ThetaChainDefinition } from '@/config/chains'

const ERC20_BALANCE_OF_SELECTOR = '0x70a08231'

function padAddress(address: string) {
  return address.toLowerCase().replace('0x', '').padStart(64, '0')
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  const json = (await response.json()) as { result?: T; error?: { message: string } }
  if (json.error) {
    throw new Error(json.error.message)
  }
  return json.result as T
}

function hexToBigInt(hex: string) {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

function formatUnits(value: bigint, decimals: number) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = absolute / base
  const fraction = absolute % base
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  const result = fractionText ? `${whole}.${fractionText}` : whole.toString()
  return negative ? `-${result}` : result
}

export async function fetchNativeBalance(rpcUrl: string, address: string) {
  const hex = await rpcCall<string>(rpcUrl, 'eth_getBalance', [address, 'latest'])
  return formatUnits(hexToBigInt(hex), 18)
}

export async function fetchErc20Balance(
  rpcUrl: string,
  contractAddress: string,
  walletAddress: string,
  decimals: number
) {
  const data = ERC20_BALANCE_OF_SELECTOR + padAddress(walletAddress)
  const hex = await rpcCall<string>(rpcUrl, 'eth_call', [
    { to: contractAddress, data },
    'latest',
  ])
  return formatUnits(hexToBigInt(hex), decimals)
}

export interface ChainAssetBalance {
  asset: ThetaAssetDefinition
  balance: string
  balanceNumber: number
}

export async function fetchChainBalances(
  chain: ThetaChainDefinition,
  address: string
): Promise<ChainAssetBalance[]> {
  if (!address) {
    return chain.assets.map((asset) => ({
      asset,
      balance: '0',
      balanceNumber: 0,
    }))
  }

  return Promise.all(
    chain.assets.map(async (asset) => {
      const balance = asset.contractAddress
        ? await fetchErc20Balance(chain.rpcUrl, asset.contractAddress, address, asset.decimals)
        : await fetchNativeBalance(chain.rpcUrl, address)
      const balanceNumber = Number.parseFloat(balance)
      return {
        asset,
        balance,
        balanceNumber: Number.isFinite(balanceNumber) ? balanceNumber : 0,
      }
    })
  )
}
