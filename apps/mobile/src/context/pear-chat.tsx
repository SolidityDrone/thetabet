import { PEAR_RPC_COMMANDS } from '@/rpc/pear-commands'
import type {
  JoinChannelResult,
  PearChannel,
  PearIdentity,
  PearMessage,
  TipsterProfile,
} from '@/types/pear'
import { documentDirectory } from 'expo-file-system/legacy'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import RPC from 'bare-rpc'
import { Worklet } from 'react-native-bare-kit'
import pearBundle from '../../pear-end.bundle.js'

type PearChatContextValue = {
  ready: boolean
  error: string | null
  identity: PearIdentity | null
  channels: PearChannel[]
  tipsterProfile: TipsterProfile | null
  createChannel: (name: string, isPrivate: boolean) => Promise<PearChannel>
  joinChannel: (topicKey: string, name?: string) => Promise<JoinChannelResult>
  sendMessage: (channelId: string, text: string) => Promise<PearMessage>
  getHistory: (channelId: string) => Promise<PearMessage[]>
  shareChannelKey: (channelId: string, peerPubkey: string) => Promise<PearMessage>
  setTipsterProfile: (
    profile: Partial<TipsterProfile> & { displayName: string }
  ) => Promise<TipsterProfile>
  refreshChannels: () => Promise<void>
  refreshProfile: () => Promise<void>
  onMessage: (listener: (message: PearMessage) => void) => () => void
  ensureStarted: () => Promise<void>
}

const PearChatContext = createContext<PearChatContextValue | null>(null)

function decodeJson<T>(buffer: unknown): T {
  if (!buffer) {
    throw new Error('Empty RPC reply')
  }
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBufferLike)
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function toBareStoragePath(uri: string) {
  // Bare fs expects a plain absolute path, not a file:// URI.
  const path = uri.replace(/^file:\/\//, '')
  return path.endsWith('/') ? path.slice(0, -1) : path
}

async function callRpc<T>(
  rpc: RPC,
  command: number,
  payload?: unknown,
  timeoutMs = 15000
): Promise<T> {
  const req = rpc.request(command)
  req.send(Buffer.from(payload ? JSON.stringify(payload) : '') as never)

  const reply = await Promise.race([
    req.reply(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Pear RPC command ${command} timed out`)), timeoutMs)
    ),
  ])

  const data = decodeJson<T & { error?: string }>(reply)
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error)
  }
  return data
}

export function PearChatProvider({ children }: { children: React.ReactNode }) {
  const workletRef = useRef<Worklet | null>(null)
  const rpcRef = useRef<RPC | null>(null)
  const messageListenersRef = useRef<Set<(message: PearMessage) => void>>(new Set())
  const bootPromiseRef = useRef<Promise<void> | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<PearIdentity | null>(null)
  const [channels, setChannels] = useState<PearChannel[]>([])
  const [tipsterProfile, setTipsterProfileState] = useState<TipsterProfile | null>(null)

  const boot = useCallback(async () => {
    if (!documentDirectory) {
      throw new Error('documentDirectory is unavailable')
    }
    if (workletRef.current && rpcRef.current) {
      return
    }

    const storagePath = toBareStoragePath(documentDirectory)
    if (!storagePath) {
      throw new Error('Invalid documentDirectory path')
    }

    // Let WDK worklets finish booting before starting Pear (3rd bare worklet).
    await new Promise((resolve) => setTimeout(resolve, 500))

    const worklet = new Worklet()
    worklet.start('/pear-end.bundle', pearBundle, [storagePath])
    workletRef.current = worklet

    const rpc = new RPC(worklet.IPC as never, async (req) => {
      if (req.command === PEAR_RPC_COMMANDS.MESSAGE_EVENT) {
        try {
          const message = decodeJson<PearMessage>(req.data)
          messageListenersRef.current.forEach((listener) => listener(message))
          req.reply('ok')
        } catch (bootError) {
          req.reply(JSON.stringify({ error: String(bootError) }))
        }
      }
    })
    rpcRef.current = rpc

    await callRpc(rpc, PEAR_RPC_COMMANDS.READY)
    const nextIdentity = await callRpc<PearIdentity>(rpc, PEAR_RPC_COMMANDS.GET_IDENTITY)
    const nextChannels = await callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_CHANNELS)
    const profile = await callRpc<TipsterProfile | null>(
      rpc,
      PEAR_RPC_COMMANDS.GET_TIPSTER_PROFILE
    )

    setIdentity(nextIdentity)
    setChannels(nextChannels)
    setTipsterProfileState(profile)
    setReady(true)
    setError(null)
  }, [])

  const ensureStarted = useCallback(async () => {
    if (ready) return
    if (!bootPromiseRef.current) {
      bootPromiseRef.current = boot().catch((bootError) => {
        bootPromiseRef.current = null
        setReady(false)
        setError(bootError instanceof Error ? bootError.message : String(bootError))
        throw bootError
      })
    }
    return bootPromiseRef.current
  }, [boot, ready])

  useEffect(() => {
    return () => {
      workletRef.current?.terminate()
      workletRef.current = null
      rpcRef.current = null
      bootPromiseRef.current = null
    }
  }, [])

  const refreshChannels = useCallback(async () => {
    const rpc = rpcRef.current
    if (!rpc) return
    const nextChannels = await callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_CHANNELS)
    setChannels(nextChannels)
  }, [])

  const refreshProfile = useCallback(async () => {
    const rpc = rpcRef.current
    if (!rpc) return
    const profile = await callRpc<TipsterProfile | null>(
      rpc,
      PEAR_RPC_COMMANDS.GET_TIPSTER_PROFILE
    )
    setTipsterProfileState(profile)
  }, [])

  const createChannel = useCallback(
    async (name: string, isPrivate: boolean) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const channel = await callRpc<PearChannel>(rpc, PEAR_RPC_COMMANDS.CREATE_CHANNEL, {
        name,
        isPrivate,
      })
      await refreshChannels()
      return channel
    },
    [ensureStarted, refreshChannels]
  )

  const joinChannel = useCallback(
    async (topicKey: string, name?: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const result = await callRpc<JoinChannelResult>(rpc, PEAR_RPC_COMMANDS.JOIN_CHANNEL, {
        topicKey,
        name,
      })
      await refreshChannels()
      return result
    },
    [ensureStarted, refreshChannels]
  )

  const sendMessage = useCallback(
    async (channelId: string, text: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      return callRpc<PearMessage>(rpc, PEAR_RPC_COMMANDS.SEND_MESSAGE, { channelId, text })
    },
    [ensureStarted]
  )

  const getHistory = useCallback(
    async (channelId: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      return callRpc<PearMessage[]>(rpc, PEAR_RPC_COMMANDS.GET_HISTORY, { channelId })
    },
    [ensureStarted]
  )

  const shareChannelKey = useCallback(
    async (channelId: string, peerPubkey: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      return callRpc<PearMessage>(rpc, PEAR_RPC_COMMANDS.SHARE_CHANNEL_KEY, {
        channelId,
        peerPubkey,
      })
    },
    [ensureStarted]
  )

  const setTipsterProfile = useCallback(
    async (profile: Partial<TipsterProfile> & { displayName: string }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const nextProfile = await callRpc<TipsterProfile>(
        rpc,
        PEAR_RPC_COMMANDS.SET_TIPSTER_PROFILE,
        profile
      )
      setTipsterProfileState(nextProfile)
      return nextProfile
    },
    [ensureStarted]
  )

  const onMessage = useCallback((listener: (message: PearMessage) => void) => {
    messageListenersRef.current.add(listener)
    return () => {
      messageListenersRef.current.delete(listener)
    }
  }, [])

  const value = useMemo(
    () => ({
      ready,
      error,
      identity,
      channels,
      tipsterProfile,
      createChannel,
      joinChannel,
      sendMessage,
      getHistory,
      shareChannelKey,
      setTipsterProfile,
      refreshChannels,
      refreshProfile,
      onMessage,
      ensureStarted,
    }),
    [
      ready,
      error,
      identity,
      channels,
      tipsterProfile,
      createChannel,
      joinChannel,
      sendMessage,
      getHistory,
      shareChannelKey,
      setTipsterProfile,
      refreshChannels,
      refreshProfile,
      onMessage,
      ensureStarted,
    ]
  )

  return <PearChatContext.Provider value={value}>{children}</PearChatContext.Provider>
}

export function usePearChat() {
  const context = useContext(PearChatContext)
  if (!context) {
    throw new Error('usePearChat must be used within PearChatProvider')
  }
  return context
}
