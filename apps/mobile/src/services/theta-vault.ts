import type { IndexedVault } from '@/types/indexed-vault'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'
import { sendWdkTransaction, ensureBetTokenApproval } from '@/services/wdk-evm'
import { getWalletSecp256k1PublicKeyCoords, waitForEvmTransaction } from '@/services/wdk-local-signer'
import {
  BET_TOKEN_ADDRESS,
  BET_TOKEN_DECIMALS,
  THETA_SINGLETON_ADDRESS,
  formatBetToken,
  thetaSingletonAbi,
  tipsterVaultAbi,
} from '@/config/theta'
import { getWdkManager } from '@/services/wdk-bare-api'
import { WDK_NETWORK_KEY } from '@/config/chains'
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { polygon } from 'viem/chains'

let publicClient: PublicClient | null = null

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: polygon,
      transport: http(THETA_DEPLOYMENT.rpcUrl),
    })
  }
  return publicClient
}

function decodeRevert(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.reason ?? revert.data?.errorName ?? null
  }
  return null
}

async function resolveSigningAddress(accountIndex = 0): Promise<Address> {
  const { address } = await getWdkManager().getAddress({
    network: WDK_NETWORK_KEY,
    accountIndex,
  })
  return address as Address
}

async function simulateContractCall(params: {
  from: Address
  to: Address
  data: Hex
}) {
  const signer = await resolveSigningAddress()
  if (signer.toLowerCase() !== params.from.toLowerCase()) {
    throw new Error('Wallet address mismatch. Pull to refresh on Profile and try again.')
  }

  try {
    await getPublicClient().call({
      account: signer,
      to: params.to,
      data: params.data,
    })

    const gasEstimate = await getPublicClient().estimateGas({
      account: signer,
      to: params.to,
      data: params.data,
    })
    const gasPrice = await getPublicClient().getGasPrice()
    const balance = await getPublicClient().getBalance({ address: signer })
    const needed = (gasEstimate * gasPrice * 15n) / 10n
    if (balance < needed) {
      throw new Error(
        `Insufficient POL for gas. Balance: ${formatEther(balance)} POL, needed: ~${formatEther(needed)} POL. ` +
          'Vault creation deploys a contract — fund the wallet with POL on Polygon, then retry.'
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Insufficient POL for gas')) {
      throw error
    }

    const revert = decodeRevert(error)
    if (revert?.includes('OneVaultPerTipster')) {
      throw new Error('You already have a tipster vault for this wallet.')
    }
    if (revert?.includes('TipsterNameTaken')) {
      throw new Error('That @handle is already taken. Pick another one.')
    }
    if (revert?.includes('InvalidTipsterName')) {
      throw new Error('Invalid handle. Use 3–20 lowercase letters, numbers, or underscores (not at the ends).')
    }
    if (revert?.includes('NotWhitelisted')) {
      throw new Error('This wallet is not whitelisted for vault deposits yet.')
    }

    const gasEstimate = await getPublicClient()
      .estimateGas({
        account: signer,
        to: params.to,
        data: params.data,
      })
      .catch(() => null)
    const gasPrice = await getPublicClient().getGasPrice()
    const balance = await getPublicClient().getBalance({ address: signer })
    if (gasEstimate) {
      const needed = (gasEstimate * gasPrice * 15n) / 10n
      if (balance < needed) {
        throw new Error(
          `Insufficient POL for gas. Balance: ${formatEther(balance)} POL, needed: ~${formatEther(needed)} POL. ` +
            'Vault creation deploys a contract — fund the wallet with POL on Polygon, then retry.'
        )
      }
    }

    if (message.includes('execution reverted')) {
      throw new Error(
        `Contract would reject this transaction${revert ? `: ${revert}` : ''}. If you already set up before, pull to refresh on Profile.`
      )
    }
    throw error
  }
}

export async function readOnChainTipsterProfile(tipster: Address) {
  const [vaultId, handle] = await Promise.all([
    readVaultIdOfTipster(tipster),
    readTipsterName(tipster),
  ])

  return {
    vaultId,
    handle: handle.length > 0 ? handle : null,
    hasVault: vaultId > 0n,
  }
}

export async function readOnChainVaultSnapshot(
  tipster: Address,
  handle?: string | null
): Promise<IndexedVault | null> {
  const vaultId = await readVaultIdOfTipster(tipster)
  if (vaultId === 0n) return null

  const vaultAddress = await getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'vaultOf',
    args: [vaultId],
  })

  const [name, symbol, totalSupply, freeBalance, totalAssets] = await Promise.all([
    getPublicClient().readContract({
      address: vaultAddress,
      abi: tipsterVaultAbi,
      functionName: 'name',
    }),
    getPublicClient().readContract({
      address: vaultAddress,
      abi: tipsterVaultAbi,
      functionName: 'symbol',
    }),
    getPublicClient().readContract({
      address: vaultAddress,
      abi: tipsterVaultAbi,
      functionName: 'totalSupply',
    }),
    getPublicClient().readContract({
      address: THETA_SINGLETON_ADDRESS,
      abi: thetaSingletonAbi,
      functionName: 'vaultFreeBalance',
      args: [vaultId],
    }),
    getPublicClient().readContract({
      address: THETA_SINGLETON_ADDRESS,
      abi: thetaSingletonAbi,
      functionName: 'vaultTotalAssets',
      args: [vaultId],
    }),
  ])

  return {
    id: vaultId.toString(),
    address: vaultAddress.toLowerCase(),
    tipster: tipster.toLowerCase(),
    tipsterHandle: handle ?? '',
    name,
    symbol,
    freeBalance: freeBalance.toString(),
    totalAssets: totalAssets.toString(),
    shareSupply: totalSupply.toString(),
    openBets: 0,
    pendingClaimable: '0',
    settledWins: 0,
    settledLosses: 0,
    totalStaked: '0',
    totalPayout: '0',
  }
}

export async function readVaultIdOfTipster(tipster: Address): Promise<bigint> {
  return getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'vaultIdOfTipster',
    args: [tipster],
  })
}

export async function readTipsterName(tipster: Address): Promise<string> {
  return getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'tipsterNames',
    args: [tipster],
  })
}

export async function createTipsterVault(
  from: Address,
  name: string,
  symbol: string
) {
  const data = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'createVault',
    args: [name.trim(), symbol.trim().toUpperCase()],
  })

  const existingVaultId = await readVaultIdOfTipster(from)
  if (existingVaultId > 0n) {
    throw new Error('You already have a tipster vault for this wallet.')
  }

  await simulateContractCall({ from, to: THETA_SINGLETON_ADDRESS, data })

  return sendWdkTransaction({
    to: THETA_SINGLETON_ADDRESS,
    data,
  })
}

export async function registerTipsterName(from: Address, handle: string) {
  const normalized = handle.trim().toLowerCase()
  const { x: pubKeyX, y: pubKeyY } = await getWalletSecp256k1PublicKeyCoords()
  const data = encodeFunctionData({
    abi: thetaSingletonAbi,
    functionName: 'registerTipsterName',
    args: [normalized, pubKeyX, pubKeyY],
  })

  await simulateContractCall({ from, to: THETA_SINGLETON_ADDRESS, data })

  return sendWdkTransaction({
    to: THETA_SINGLETON_ADDRESS,
    data,
  })
}

export async function readVaultDepositWhitelist(account: Address) {
  return getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'isWhitelisted',
    args: [account],
  })
}

export async function previewVaultDeposit(vaultAddress: Address, amount: string) {
  const assets = parseUnits(amount, BET_TOKEN_DECIMALS)
  if (assets <= 0n) return 0n

  return getPublicClient().readContract({
    address: vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'previewDeposit',
    args: [assets],
  })
}

export type VaultDepositStage = 'approving' | 'waiting-approval' | 'depositing' | 'confirming'

export async function depositIntoVault(params: {
  from: Address
  vaultAddress: Address
  amount: string
  onStage?: (stage: VaultDepositStage) => void
}) {
  const assets = parseUnits(params.amount, BET_TOKEN_DECIMALS)
  if (assets <= 0n) {
    throw new Error('Enter a valid stake amount.')
  }

  const whitelisted = await readVaultDepositWhitelist(params.from)
  if (!whitelisted) {
    throw new Error(
      'This wallet is not whitelisted for vault deposits yet. Ask the deployer to whitelist your address on Polygon.'
    )
  }

  const shares = await getPublicClient().readContract({
    address: params.vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'previewDeposit',
    args: [assets],
  })

  params.onStage?.('approving')
  const approval = await ensureBetTokenApproval({
    tokenAddress: BET_TOKEN_ADDRESS,
    spender: params.vaultAddress,
    owner: params.from,
    requiredAmount: assets,
    decimals: BET_TOKEN_DECIMALS,
    symbol: 'USDT',
  })
  if (approval === 'confirmed') {
    params.onStage?.('waiting-approval')
  }

  const data = encodeFunctionData({
    abi: tipsterVaultAbi,
    functionName: 'deposit',
    args: [assets, params.from],
  })

  await simulateContractCall({
    from: params.from,
    to: params.vaultAddress,
    data,
  })

  params.onStage?.('depositing')
  const { hash } = await sendWdkTransaction({
    to: params.vaultAddress,
    data,
  })

  params.onStage?.('confirming')
  await waitForEvmTransaction(hash)

  return { hash, shares }
}

export async function readVaultShareBalance(vaultAddress: Address, owner: Address) {
  return getPublicClient().readContract({
    address: vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'balanceOf',
    args: [owner],
  })
}

export async function readVaultMaxWithdraw(vaultAddress: Address, owner: Address) {
  return getPublicClient().readContract({
    address: vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'maxWithdraw',
    args: [owner],
  })
}

export async function previewVaultWithdraw(vaultAddress: Address, amount: string) {
  const assets = parseUnits(amount, BET_TOKEN_DECIMALS)
  if (assets <= 0n) return 0n

  return getPublicClient().readContract({
    address: vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'previewWithdraw',
    args: [assets],
  })
}

export async function previewVaultRedeemAssets(vaultAddress: Address, shares: bigint) {
  if (shares <= 0n) return 0n

  return getPublicClient().readContract({
    address: vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'previewRedeem',
    args: [shares],
  })
}

export type VaultWithdrawStage = 'withdrawing' | 'confirming'

export async function withdrawFromVault(params: {
  from: Address
  vaultAddress: Address
  amount: string
  onStage?: (stage: VaultWithdrawStage) => void
}) {
  const assets = parseUnits(params.amount, BET_TOKEN_DECIMALS)
  if (assets <= 0n) {
    throw new Error('Enter a valid withdrawal amount.')
  }

  const whitelisted = await readVaultDepositWhitelist(params.from)
  if (!whitelisted) {
    throw new Error('This wallet is not whitelisted for vault withdrawals yet.')
  }

  const maxWithdraw = await readVaultMaxWithdraw(params.vaultAddress, params.from)
  if (assets > maxWithdraw) {
    throw new Error(
      `Cannot withdraw ${params.amount} USDT right now. Max available: ${formatBetToken(maxWithdraw)} USDT (limited by vault free liquidity).`
    )
  }

  const shares = await getPublicClient().readContract({
    address: params.vaultAddress,
    abi: tipsterVaultAbi,
    functionName: 'previewWithdraw',
    args: [assets],
  })

  const data = encodeFunctionData({
    abi: tipsterVaultAbi,
    functionName: 'withdraw',
    args: [assets, params.from, params.from],
  })

  await simulateContractCall({
    from: params.from,
    to: params.vaultAddress,
    data,
  })

  params.onStage?.('withdrawing')
  const { hash } = await sendWdkTransaction({
    to: params.vaultAddress,
    data,
  })

  params.onStage?.('confirming')
  await waitForEvmTransaction(hash)

  return { hash, shares, assets }
}
