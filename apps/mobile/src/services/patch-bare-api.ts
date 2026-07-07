import { LegacyWdkHrpc } from '@/services/legacy-wdk-hrpc'

type BareWorkletApiShape = {
  bareInstances: Record<string, { IPC: unknown } | undefined>
  hrpcInstances: Record<string, unknown>
  startWorklet: (instance: string, fileName: string, source: string) => unknown
}

let patched = false

/** Use legacy HRPC command IDs that match the prebuilt wdk-worklet.mobile.bundle.js */
export function patchBareWorkletApi(): void {
  if (patched) return

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bareApiModule = require('@tetherto/wdk-react-native-provider/lib/module/services/wdk-service/bare-api') as {
    BareWorkletApi: BareWorkletApiShape
    InstanceEnum: { wdkManager: string }
  }

  const { BareWorkletApi, InstanceEnum } = bareApiModule
  const originalStart = BareWorkletApi.startWorklet.bind(BareWorkletApi)

  BareWorkletApi.startWorklet = (instance, fileName, source) => {
    const worklet = originalStart(instance, fileName, source)
    if (instance === InstanceEnum.wdkManager) {
      const ipc = BareWorkletApi.bareInstances[instance]?.IPC
      if (ipc) {
        BareWorkletApi.hrpcInstances[instance] = new LegacyWdkHrpc(ipc)
      }
    }
    return worklet
  }

  patched = true
}
