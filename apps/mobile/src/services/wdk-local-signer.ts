import { WDK_NETWORK_KEY } from '@/config/chains'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'
import { getWdkManager } from '@/services/wdk-bare-api'
import { WDKService } from '@tetherto/wdk-react-native-provider'
import { getUniqueId } from 'react-native-device-info'
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  formatEther,
  hexToBytes,
  http,
  type Address,
  type Hex,
  type SignTypedDataParameters,
} from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'

const WDK_ACCOUNT_INDEX = 0
const GAS_BUFFER_NUMERATOR = 150n
const GAS_BUFFER_DENOMINATOR = 100n

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

function evmDerivationPath(accountIndex: number) {
  return `m/44'/60'/0'/0/${accountIndex}` as const
}

async function resolveWalletMnemonic(): Promise<string> {
  const prf = await getUniqueId()
  const mnemonic = await WDKService.retrieveSeed(prf)
  if (!mnemonic?.trim()) {
    throw new Error('Wallet seed is not available. Unlock or recreate your wallet.')
  }
  return mnemonic.trim()
}

function getViemAccount(mnemonic: string, accountIndex = WDK_ACCOUNT_INDEX) {
  return mnemonicToAccount(mnemonic, { path: evmDerivationPath(accountIndex) })
}

function secp256k1PublicKeyToCoords(publicKey: Hex): { x: Hex; y: Hex } {
  const bytes = hexToBytes(publicKey)
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error('Wallet public key must be an uncompressed secp256k1 key.')
  }

  return {
    x: bytesToHex(bytes.slice(1, 33), { size: 32 }),
    y: bytesToHex(bytes.slice(33, 65), { size: 32 }),
  }
}

export async function getWalletSecp256k1PublicKeyCoords(
  accountIndex = WDK_ACCOUNT_INDEX
): Promise<{ x: Hex; y: Hex }> {
  const mnemonic = await resolveWalletMnemonic()
  const account = getViemAccount(mnemonic, accountIndex)

  const { address: walletAddress } = await getWdkManager().getAddress({
    network: WDK_NETWORK_KEY,
    accountIndex,
  })
  if (walletAddress.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('Local signer address does not match the WDK wallet.')
  }

  return secp256k1PublicKeyToCoords(account.publicKey)
}

export async function sendSignedEvmTransaction(params: {
  to: Address
  data: Hex
  value?: bigint
  accountIndex?: number
}): Promise<{ hash: Hex }> {
  const accountIndex = params.accountIndex ?? WDK_ACCOUNT_INDEX
  const mnemonic = await resolveWalletMnemonic()
  const account = getViemAccount(mnemonic, accountIndex)

  const { address: walletAddress } = await getWdkManager().getAddress({
    network: WDK_NETWORK_KEY,
    accountIndex,
  })
  if (walletAddress.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('Local signer address does not match the WDK wallet.')
  }

  const rpc = getPublicClient()
  const gasEstimate = await rpc.estimateGas({
    account: account.address,
    to: params.to,
    data: params.data,
    value: params.value ?? 0n,
  })
  const gas = (gasEstimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR
  const gasPrice = await rpc.getGasPrice()
  const maxCost = gas * gasPrice + (params.value ?? 0n)
  const balance = await rpc.getBalance({ address: account.address })

  if (balance < maxCost) {
    throw new Error(
      `Insufficient POL for gas. Balance: ${formatEther(balance)} POL, needed: ~${formatEther(maxCost)} POL. ` +
        'Vault creation deploys a contract and costs more than a simple transfer — fund the wallet with POL on Polygon, then retry.'
    )
  }

  const nonce = await rpc.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })

  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(THETA_DEPLOYMENT.rpcUrl),
  })

  const hash = await client.sendTransaction({
    account,
    chain: polygon,
    to: params.to,
    data: params.data,
    value: params.value ?? 0n,
    gas,
    gasPrice,
    nonce,
    type: 'legacy',
  })

  return { hash }
}

export async function waitForEvmTransaction(hash: Hex) {
  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 90_000,
  })
  if (receipt.status === 'reverted') {
    throw new Error(`Transaction reverted on-chain (${hash})`)
  }
  return receipt
}

export async function signEvmTypedData(
  typedData: SignTypedDataParameters
): Promise<Hex> {
  const mnemonic = await resolveWalletMnemonic()
  const account = getViemAccount(mnemonic)

  const { address: walletAddress } = await getWdkManager().getAddress({
    network: WDK_NETWORK_KEY,
    accountIndex: WDK_ACCOUNT_INDEX,
  })
  if (walletAddress.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('Local signer address does not match the WDK wallet.')
  }

  if (
    typedData.account &&
    account.address.toLowerCase() !== typedData.account.toLowerCase()
  ) {
    throw new Error('Typed data account does not match the unlocked wallet.')
  }

  return account.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
}
