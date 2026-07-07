import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  maxUint256,
  type Address,
  type Hex,
  type SignTypedDataParameters,
} from 'viem'
import { sendSignedEvmTransaction, signEvmTypedData, waitForEvmTransaction } from '@/services/wdk-local-signer'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'

export async function signAzuroTypedData(
  typedData: SignTypedDataParameters
): Promise<Hex> {
  return signEvmTypedData(typedData)
}

export async function sendWdkTransaction(params: {
  to: Address
  data?: Hex
  value?: string
}) {
  if (!params.data || params.data === '0x') {
    throw new Error('sendWdkTransaction requires contract calldata')
  }

  const value = params.value ? BigInt(params.value) : 0n
  return sendSignedEvmTransaction({
    to: params.to,
    data: params.data,
    value,
  })
}

export async function ensureBetTokenApproval(params: {
  tokenAddress: Address
  spender: Address
  owner: Address
  requiredAmount?: bigint
  decimals?: number
  symbol?: string
}): Promise<'skipped' | 'confirmed'> {
  const decimals = params.decimals ?? 6
  const symbol = params.symbol ?? 'USDT'

  const allowanceData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'allowance',
    args: [params.owner, params.spender],
  })
  const balanceData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [params.owner],
  })

  const rpcUrl = THETA_DEPLOYMENT.rpcUrl

  const rpcResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: params.tokenAddress,
          data: allowanceData,
        },
        'latest',
      ],
    }),
  })

  const rpcJson = (await rpcResponse.json()) as { result?: string }
  const allowance = BigInt(rpcJson.result ?? '0x0')
  const required = params.requiredAmount ?? 0n

  const balanceResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_call',
      params: [
        {
          to: params.tokenAddress,
          data: balanceData,
        },
        'latest',
      ],
    }),
  })
  const balanceJson = (await balanceResponse.json()) as { result?: string }
  const balance = BigInt(balanceJson.result ?? '0x0')

  if (balance < required) {
    throw new Error(
      `Insufficient ${symbol}. Balance: ${formatUnits(balance, decimals)} · needed: ${formatUnits(required, decimals)}.`
    )
  }

  if (allowance >= required && allowance > 0n) {
    return 'skipped'
  }

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.spender, maxUint256],
  })

  const { hash } = await sendWdkTransaction({
    to: params.tokenAddress,
    data: approveData,
  })
  await waitForEvmTransaction(hash)
  return 'confirmed'
}
