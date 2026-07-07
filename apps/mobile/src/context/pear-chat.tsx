import { PEAR_RPC_COMMANDS } from '@/rpc/pear-commands'
import {
  assertTipsterHandleExists,
  assertWalletOwnsHandle,
  normalizeTipsterHandle,
} from '@/services/tipster-handle'
import type {
  JoinChannelResult,
  PearChannel,
  PearContactsState,
  PearHandleLookup,
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
  syncOnChainPresence: (handle: string, walletAddress: string) => Promise<PearHandleLookup>
  lookupHandle: (handle: string) => Promise<PearHandleLookup>
  sendContactRequest: (handle: string, note?: string) => Promise<{ id: string }>
  listContacts: () => Promise<PearContactsState>
  respondContactRequest: (requestId: string, accept: boolean) => Promise<void>
  listDms: () => Promise<PearChannel[]>
  refreshContacts: () => Promise<void>
  onMessage: (listener: (message: PearMessage) => void) => () => void
  onContactsChanged: (listener: () => void) => () => void
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
  timeoutMs = 30000
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
  const contactsListenersRef = useRef<Set<() => void>>(new Set())
  const bootPromiseRef = useRef<Promise<void> | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<PearIdentity | null>(null)
  const [channels, setChannels] = useState<PearChannel[]>([])
  const [tipsterProfile, setTipsterProfileState] = useState<TipsterProfile | null>(null)
  const [contacts, setContacts] = useState<PearContactsState>({
    pendingIncoming: [],
    pendingOutgoing: [],
    accepted: [],
  })
  const [dms, setDms] = useState<PearChannel[]>([])

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

    // Wait for pear-end to finish Corestore boot before RPC calls.
    await new Promise((resolve) => setTimeout(resolve, 300))

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
        return
      }

      if (req.command === PEAR_RPC_COMMANDS.CONTACTS_CHANGED_EVENT) {
        contactsListenersRef.current.forEach((listener) => listener())
        req.reply('ok')
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
    const nextContacts = await callRpc<PearContactsState>(rpc, PEAR_RPC_COMMANDS.LIST_CONTACTS)
    const nextDms = await callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_DMS)

    setIdentity(nextIdentity)
    setChannels(nextChannels)
    setTipsterProfileState(profile)
    setContacts(nextContacts)
    setDms(nextDms)
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

  const refreshContacts = useCallback(async () => {
    const rpc = rpcRef.current
    if (!rpc) return
    const [nextContacts, nextDms] = await Promise.all([
      callRpc<PearContactsState>(rpc, PEAR_RPC_COMMANDS.LIST_CONTACTS),
      callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_DMS),
    ])
    setContacts(nextContacts)
    setDms(nextDms)
  }, [])

  const refreshChannels = useCallback(async () => {
    const rpc = rpcRef.current
    if (!rpc) return
    const [nextChannels, nextDms] = await Promise.all([
      callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_CHANNELS),
      callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_DMS),
    ])
    setChannels(nextChannels)
    setDms(nextDms)
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

  const registerHandle = useCallback(
    async (handle: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const normalized = normalizeTipsterHandle(handle)
      const result = await callRpc<PearHandleLookup>(rpc, PEAR_RPC_COMMANDS.REGISTER_HANDLE, {
        handle: normalized,
      })
      const nextIdentity = await callRpc<PearIdentity>(rpc, PEAR_RPC_COMMANDS.GET_IDENTITY)
      setIdentity(nextIdentity)
      return result
    },
    [ensureStarted]
  )

  const syncOnChainPresence = useCallback(
    async (handle: string, walletAddress: string) => {
      await assertWalletOwnsHandle(handle, walletAddress)
      return registerHandle(handle)
    },
    [registerHandle]
  )

  const lookupHandle = useCallback(
    async (handle: string) => {
      await assertTipsterHandleExists(handle)
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      return callRpc<PearHandleLookup>(rpc, PEAR_RPC_COMMANDS.LOOKUP_HANDLE, {
        handle: normalizeTipsterHandle(handle),
      })
    },
    [ensureStarted]
  )

  const sendContactRequest = useCallback(
    async (handle: string, note?: string) => {
      const normalized = normalizeTipsterHandle(handle)
      await assertTipsterHandleExists(normalized)
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const result = await callRpc<{ id: string }>(rpc, PEAR_RPC_COMMANDS.SEND_CONTACT_REQUEST, {
        handle: normalized,
        note,
      })
      await refreshContacts()
      return result
    },
    [ensureStarted, refreshContacts]
  )

  const listContacts = useCallback(async () => {
    await ensureStarted()
    const rpc = rpcRef.current
    if (!rpc) throw new Error('Pear chat is not ready')
    return callRpc<PearContactsState>(rpc, PEAR_RPC_COMMANDS.LIST_CONTACTS)
  }, [ensureStarted])

  const respondContactRequest = useCallback(
    async (requestId: string, accept: boolean) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      await callRpc(rpc, PEAR_RPC_COMMANDS.RESPOND_CONTACT_REQUEST, { requestId, accept })
      await refreshContacts()
      await refreshChannels()
    },
    [ensureStarted, refreshChannels, refreshContacts]
  )

  const listDms = useCallback(async () => {
    await ensureStarted()
    const rpc = rpcRef.current
    if (!rpc) throw new Error('Pear chat is not ready')
    return callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_DMS)
  }, [ensureStarted])

  const onContactsChanged = useCallback((listener: () => void) => {
    contactsListenersRef.current.add(listener)
    return () => {
      contactsListenersRef.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    return onContactsChanged(() => {
      void refreshContacts()
    })
  }, [onContactsChanged, ready, refreshContacts])

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
      contacts,
      dms,
      createChannel,
      joinChannel,
      sendMessage,
      getHistory,
      shareChannelKey,
      setTipsterProfile,
      syncOnChainPresence,
      lookupHandle,
      sendContactRequest,
      listContacts,
      respondContactRequest,
      listDms,
      refreshChannels,
      refreshProfile,
      refreshContacts,
      onMessage,
      onContactsChanged,
      ensureStarted,
    }),
    [
      ready,
      error,
      identity,
      channels,
      tipsterProfile,
      contacts,
      dms,
      createChannel,
      joinChannel,
      sendMessage,
      getHistory,
      shareChannelKey,
      setTipsterProfile,
      syncOnChainPresence,
      lookupHandle,
      sendContactRequest,
      listContacts,
      respondContactRequest,
      listDms,
      refreshChannels,
      refreshProfile,
      refreshContacts,
      onMessage,
      onContactsChanged,
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
