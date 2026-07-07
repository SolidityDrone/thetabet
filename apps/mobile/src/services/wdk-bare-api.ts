type WdkManager = {
  callMethod?: (args: {
    methodName: string
    network: string
    accountIndex: number
    args?: string
    options?: string
  }) => Promise<{ result: string }>
  sendTransaction: (args: {
    network: string
    accountIndex: number
    options: { to: string; value: string }
  }) => Promise<{ hash?: string | null; fee?: string | null }>
  abstractedSendTransaction?: (args: {
    network: string
    accountIndex: number
    options: string
    config?: { paymasterToken?: { address: string } }
  }) => Promise<{ hash?: string | null; fee?: string | null }>
}

type BareWorkletApiShape = {
  hrpcInstances: {
    wdkManager: WdkManager | null
  }
}

// Deep import is intentional — BareWorkletApi is not part of the public WDK package API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bareApi = require('@tetherto/wdk-react-native-provider/lib/module/services/wdk-service/bare-api') as {
  BareWorkletApi: BareWorkletApiShape
}

export function getWdkManager() {
  const manager = bareApi.BareWorkletApi.hrpcInstances.wdkManager
  if (!manager) {
    throw new Error('WDK wallet is not initialized')
  }
  return manager
}

export type { WdkManager }
