import { PEAR_RPC_COMMANDS } from '@/rpc/pear-commands'
import {
  assertTipsterHandleExists,
  assertWalletOwnsHandle,
  normalizeTipsterHandle,
} from '@/services/tipster-handle'
import {
  buildVaultChannelSignMessage,
  checkVaultChannelAccess,
  verifyVaultChannelMessageSignature,
} from '@/services/vault-channel-gate'
import { signEvmPersonalMessage } from '@/services/wdk-local-signer'
import { getPolygonWalletAddress } from '@/services/wdk-address'
import type {
  JoinChannelResult,
  PearChannel,
  PearContactsState,
  PearHandleLookup,
  PearIdentity,
  PearMessage,
  PearOnlinePeer,
  PeerInferenceEvent,
  PeerInferencePeer,
  PeerInferenceProviderEvent,
  PeerInferenceRequest,
  PeerInferenceResult,
  TipsterProfile,
} from '@/types/pear'
import type { MatchScoutInput } from '@/services/qvac/match-scout'
import { runMatchScout, type MatchDossier } from '@/services/qvac/match-scout'
import { attachReasonsToPicks, type MatchPickSuggestion } from '@/services/qvac/match-outcomes'
import { buildTipsterHintsPrompt } from '@/services/tipster-notes/storage'
import { isQvacModelMarkedInstalled } from '@/services/qvac/qvac-model-manager'
import { loadQvacSettings } from '@/services/qvac/qvac-settings'
import { unloadQvacModel, warmQvacWorklet } from '@/services/qvac/qvac-client'
import {
  acquireInference,
  releaseInference,
  subscribeInferenceOwner,
} from '@/services/qvac/inference-coordinator'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import { AppState } from 'react-native'
import { toast } from 'sonner-native'
import pearBundle from '../../pear-end.bundle.js'

const VAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const INFERENCE_OPT_IN_KEY = 'thetabet.peer-inference.opt-in.v1'

type VaultSessionProof = {
  wallet: string
  walletSignature: string
  sharesSnapshot: string
  signedAt: number
  expiresAt: number
}

type PearChatContextValue = {
  ready: boolean
  error: string | null
  identity: PearIdentity | null
  channels: PearChannel[]
  contacts: PearContactsState
  dms: PearChannel[]
  tipsterProfile: TipsterProfile | null
  createChannel: (name: string, isPrivate: boolean) => Promise<PearChannel>
  createVaultChannel: (params: {
    name: string
    vaultAddress: string
    tipsterAddress: string
    minShares?: string
  }) => Promise<PearChannel>
  joinVaultChannel: (params: {
    vaultAddress: string
    tipsterAddress: string
    name?: string
    minShares?: string
    devBypassTag?: string
  }) => Promise<JoinChannelResult>
  ensureVaultSessionProof: (channel: PearChannel) => Promise<void>
  joinChannel: (topicKey: string, name?: string) => Promise<JoinChannelResult>
  sendMessage: (channelId: string, text: string) => Promise<PearMessage>
  checkVaultChannelAccessForWallet: (
    channel: PearChannel,
    walletAddress: string
  ) => Promise<Awaited<ReturnType<typeof checkVaultChannelAccess>>>
  getHistory: (channelId: string) => Promise<PearMessage[]>
  pingChannelPresence: (
    channelId: string,
    params?: { wallet?: string; role?: string; label?: string }
  ) => Promise<void>
  getChannelOnline: (channelId: string) => Promise<PearOnlinePeer[]>
  shareChannelKey: (channelId: string, peerPubkey: string) => Promise<PearMessage>
  setTipsterProfile: (
    profile: Partial<TipsterProfile> & { displayName: string }
  ) => Promise<TipsterProfile>
  setChatAvatar: (
    params: { imageBase64: string; mimeType?: string } | { clear: true }
  ) => Promise<PearIdentity>
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
  inferenceStatus: PeerInferencePeer | null
  inferenceOptIn: boolean
  activeProviderRequest: PeerInferenceRequest | null
  providerStage: 'loading-model' | 'web' | 'synthesis' | null
  providerActivity: string | null
  providerError: string | null
  setInferenceOptIn: (enabled: boolean) => Promise<void>
  setInferenceEnabled: (enabled: boolean) => Promise<PeerInferencePeer>
  setInferenceRuntimeBusy: (busy: boolean) => Promise<PeerInferencePeer>
  listInferencePeers: () => Promise<PeerInferencePeer[]>
  requestPeerInference: (
    providerPubkey: string,
    input: Omit<MatchScoutInput, 'tipsterHintsBlock'>
  ) => Promise<{ requestId: string; provider: PeerInferencePeer }>
  sendInferenceProgress: (params: {
    requestId: string
    stage?: string
    message?: string
  }) => Promise<void>
  completeInferenceRequest: (params: {
    requestId: string
    result?: PeerInferenceResult
    error?: string
  }) => Promise<void>
  cancelPeerInference: (requestId: string) => Promise<void>
  onInferenceProviderRequest: (listener: (request: PeerInferenceRequest) => void) => () => void
  onInferenceEvent: (listener: (event: PeerInferenceEvent) => void) => () => void
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

const PEAR_LOCK_ERROR = /could not be locked/i
const PEAR_BOOT_ATTEMPTS = 4
const PEAR_WDK_BOOT_DELAY_MS = 800
const PEAR_WORKLET_SETTLE_MS = 600

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPearLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return PEAR_LOCK_ERROR.test(message)
}

async function callRpc<T>(
  rpc: RPC,
  command: number,
  payload?: unknown,
  timeoutMs = 30000
): Promise<T> {
  const req = rpc.request(command)
  req.send(Buffer.from(payload ? JSON.stringify(payload) : '') as never)

  let timeout: ReturnType<typeof setTimeout> | undefined
  let reply: Awaited<ReturnType<typeof req.reply>>
  try {
    reply = await Promise.race([
      req.reply(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Pear RPC command ${command} timed out`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }

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
  const inferenceProviderListenersRef = useRef<Set<(request: PeerInferenceRequest) => void>>(
    new Set()
  )
  const inferenceEventListenersRef = useRef<Set<(event: PeerInferenceEvent) => void>>(new Set())
  const bootPromiseRef = useRef<Promise<void> | null>(null)
  const readyRef = useRef(false)
  const vaultSessionProofsRef = useRef<Map<string, VaultSessionProof>>(new Map())
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
  const [inferenceStatus, setInferenceStatus] = useState<PeerInferencePeer | null>(null)
  const [inferenceOptIn, setInferenceOptInState] = useState(false)
  const [activeProviderRequest, setActiveProviderRequest] = useState<PeerInferenceRequest | null>(
    null
  )
  const [providerStage, setProviderStage] = useState<'loading-model' | 'web' | 'synthesis' | null>(
    null
  )
  const [providerActivity, setProviderActivity] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [appForeground, setAppForeground] = useState(AppState.currentState === 'active')
  const remoteAbortRef = useRef<Map<string, AbortController>>(new Map())
  const remoteCancelReasonRef = useRef<Map<string, string>>(new Map())

  const stopWorklet = useCallback(async () => {
    const worklet = workletRef.current
    workletRef.current = null
    rpcRef.current = null
    readyRef.current = false
    setReady(false)

    if (!worklet) return

    try {
      worklet.terminate()
    } catch (_) {}

    // Corestore needs the old bare thread to release its file lock.
    await sleep(PEAR_WORKLET_SETTLE_MS)
  }, [])

  const waitForPearReady = useCallback(async (rpc: RPC) => {
    const deadline = Date.now() + 45_000

    while (Date.now() < deadline) {
      try {
        await callRpc(rpc, PEAR_RPC_COMMANDS.READY, undefined, 8_000)
        return
      } catch (readyError) {
        if (!isPearLockError(readyError)) {
          throw readyError
        }
        await sleep(400)
      }
    }

    throw new Error('Pear chat worklet did not become ready in time')
  }, [])

  const boot = useCallback(async () => {
    if (workletRef.current && rpcRef.current && readyRef.current) {
      return
    }

    if (!documentDirectory) {
      throw new Error('documentDirectory is unavailable')
    }

    const storagePath = toBareStoragePath(documentDirectory)
    if (!storagePath) {
      throw new Error('Invalid documentDirectory path')
    }

    let lastError: unknown = null

    for (let attempt = 1; attempt <= PEAR_BOOT_ATTEMPTS; attempt++) {
      await stopWorklet()

      try {
        // Let wallet/QVAC bare worklets finish before opening Corestore.
        await sleep(PEAR_WDK_BOOT_DELAY_MS + (attempt - 1) * 300)

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
            return
          }

          if (req.command === PEAR_RPC_COMMANDS.CONTACTS_CHANGED_EVENT) {
            contactsListenersRef.current.forEach((listener) => listener())
            req.reply('ok')
            return
          }

          if (req.command === PEAR_RPC_COMMANDS.INFERENCE_PROVIDER_REQUEST_EVENT) {
            try {
              const event = decodeJson<PeerInferenceProviderEvent>(req.data)
              if (event.type === 'cancel') {
                if (event.reason) {
                  remoteCancelReasonRef.current.set(event.requestId, event.reason)
                }
                remoteAbortRef.current.get(event.requestId)?.abort()
              } else {
                inferenceProviderListenersRef.current.forEach((listener) => listener(event))
              }
              req.reply('ok')
            } catch (bootError) {
              req.reply(JSON.stringify({ error: String(bootError) }))
            }
            return
          }

          if (req.command === PEAR_RPC_COMMANDS.INFERENCE_REQUESTER_EVENT) {
            try {
              const event = decodeJson<PeerInferenceEvent>(req.data)
              inferenceEventListenersRef.current.forEach((listener) => listener(event))
              req.reply('ok')
            } catch (bootError) {
              req.reply(JSON.stringify({ error: String(bootError) }))
            }
            return
          }

          if (req.command === PEAR_RPC_COMMANDS.INFERENCE_STATUS_EVENT) {
            try {
              setInferenceStatus(decodeJson<PeerInferencePeer>(req.data))
              req.reply('ok')
            } catch (bootError) {
              req.reply(JSON.stringify({ error: String(bootError) }))
            }
          }
        })
        rpcRef.current = rpc

        await waitForPearReady(rpc)

        const nextIdentity = await callRpc<PearIdentity>(rpc, PEAR_RPC_COMMANDS.GET_IDENTITY)
        const nextChannels = await callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_CHANNELS)
        const profile = await callRpc<TipsterProfile | null>(
          rpc,
          PEAR_RPC_COMMANDS.GET_TIPSTER_PROFILE
        )
        const nextContacts = await callRpc<PearContactsState>(rpc, PEAR_RPC_COMMANDS.LIST_CONTACTS)
        const nextDms = await callRpc<PearChannel[]>(rpc, PEAR_RPC_COMMANDS.LIST_DMS)
        const nextInferenceStatus = await callRpc<PeerInferencePeer>(
          rpc,
          PEAR_RPC_COMMANDS.GET_INFERENCE_STATUS
        )

        setIdentity(nextIdentity)
        setChannels(nextChannels)
        setTipsterProfileState(profile)
        setContacts(nextContacts)
        setDms(nextDms)
        setInferenceStatus(nextInferenceStatus)
        readyRef.current = true
        setReady(true)
        setError(null)
        return
      } catch (bootError) {
        lastError = bootError
        await stopWorklet()

        if (!isPearLockError(bootError) || attempt === PEAR_BOOT_ATTEMPTS) {
          throw bootError
        }

        await sleep(attempt * 500)
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }, [stopWorklet, waitForPearReady])

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
      void stopWorklet()
      bootPromiseRef.current = null
    }
  }, [stopWorklet])

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

  const checkVaultChannelAccessForWallet = useCallback(
    async (channel: PearChannel, walletAddress: string) => {
      if (channel.kind !== 'vault' || !channel.vaultAddress || !channel.tipsterAddress) {
        return { allowed: true, role: 'owner' as const, shares: 0n }
      }
      return checkVaultChannelAccess(
        channel.vaultAddress as `0x${string}`,
        channel.tipsterAddress as `0x${string}`,
        walletAddress as `0x${string}`,
        BigInt(channel.minShares ?? '1')
      )
    },
    []
  )

  const ensureVaultSessionProof = useCallback(
    async (channel: PearChannel) => {
      if (channel.kind !== 'vault' || !channel.vaultAddress || !channel.tipsterAddress) return

      const cached = vaultSessionProofsRef.current.get(channel.id)
      if (cached && cached.expiresAt > Date.now()) return

      const wallet = await getPolygonWalletAddress()
      if (!wallet) throw new Error('Unlock your wallet to join the vault channel')

      const access = await checkVaultChannelAccess(
        channel.vaultAddress as `0x${string}`,
        channel.tipsterAddress as `0x${string}`,
        wallet as `0x${string}`,
        BigInt(channel.minShares ?? '1')
      )
      if (!access.allowed) {
        throw new Error(access.reason ?? 'You need vault shares to join this channel')
      }

      const signedAt = Date.now()
      const walletSignature = await signEvmPersonalMessage(
        buildVaultChannelSignMessage({
          channelId: channel.id,
          vaultAddress: channel.vaultAddress,
          wallet: wallet as `0x${string}`,
          shares: access.shares,
          timestamp: signedAt,
        })
      )

      vaultSessionProofsRef.current.set(channel.id, {
        wallet,
        walletSignature,
        sharesSnapshot: access.shares.toString(),
        signedAt,
        expiresAt: signedAt + VAULT_SESSION_TTL_MS,
      })
    },
    []
  )

  const createVaultChannel = useCallback(
    async (params: {
      name: string
      vaultAddress: string
      tipsterAddress: string
      minShares?: string
    }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const channel = await callRpc<PearChannel>(rpc, PEAR_RPC_COMMANDS.CREATE_VAULT_CHANNEL, params)
      await ensureVaultSessionProof(channel)
      await refreshChannels()
      return channel
    },
    [ensureStarted, ensureVaultSessionProof, refreshChannels]
  )

  const joinVaultChannel = useCallback(
    async (params: {
      vaultAddress: string
      tipsterAddress: string
      name?: string
      minShares?: string
      devBypassTag?: string
    }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const result = await callRpc<JoinChannelResult>(rpc, PEAR_RPC_COMMANDS.JOIN_VAULT_CHANNEL, params)
      await ensureVaultSessionProof(result.channel)
      await refreshChannels()
      return result
    },
    [ensureStarted, ensureVaultSessionProof, refreshChannels]
  )

  const sendMessage = useCallback(
    async (channelId: string, text: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')

      const channel = channels.find((entry) => entry.id === channelId)
      if (channel?.kind === 'vault' && channel.vaultAddress && channel.tipsterAddress) {
        let proof = vaultSessionProofsRef.current.get(channelId)
        if (!proof || proof.expiresAt <= Date.now()) {
          await ensureVaultSessionProof(channel)
          proof = vaultSessionProofsRef.current.get(channelId)
        }
        if (!proof) throw new Error('Vault chat session is not ready — reopen the channel')

        return callRpc<PearMessage>(rpc, PEAR_RPC_COMMANDS.SEND_MESSAGE, {
          channelId,
          text,
          wallet: proof.wallet,
          walletSignature: proof.walletSignature,
          sharesSnapshot: proof.sharesSnapshot,
          signedAt: proof.signedAt,
        })
      }

      return callRpc<PearMessage>(rpc, PEAR_RPC_COMMANDS.SEND_MESSAGE, { channelId, text })
    },
    [channels, ensureStarted, ensureVaultSessionProof]
  )

  const decorateVaultMessages = useCallback(async (channel: PearChannel, history: PearMessage[]) => {
    if (channel.kind !== 'vault' || !channel.vaultAddress) return history
    return Promise.all(
      history.map(async (message) => {
        if (message.gateBypass) {
          return { ...message, walletVerified: true }
        }
        if (!message.wallet || !message.walletSignature) {
          return { ...message, walletVerified: false }
        }
        const walletVerified = await verifyVaultChannelMessageSignature({
          channelId: message.channelId,
          vaultAddress: channel.vaultAddress!,
          wallet: message.wallet,
          walletSignature: message.walletSignature,
          sharesSnapshot: message.sharesSnapshot,
          signedAt: message.signedAt,
        })
        return { ...message, walletVerified }
      })
    )
  }, [])

  const getHistory = useCallback(
    async (channelId: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const history = await callRpc<PearMessage[]>(rpc, PEAR_RPC_COMMANDS.GET_HISTORY, { channelId })
      const channel = channels.find((entry) => entry.id === channelId)
      if (!channel || channel.kind !== 'vault') return history
      return decorateVaultMessages(channel, history)
    },
    [channels, decorateVaultMessages, ensureStarted]
  )

  const pingChannelPresence = useCallback(
    async (channelId: string, params?: { wallet?: string; role?: string; label?: string }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      await callRpc(rpc, PEAR_RPC_COMMANDS.PING_CHANNEL_PRESENCE, {
        channelId,
        wallet: params?.wallet,
        role: params?.role,
        label: params?.label,
      })
    },
    [ensureStarted]
  )

  const getChannelOnline = useCallback(
    async (channelId: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      return callRpc<PearOnlinePeer[]>(rpc, PEAR_RPC_COMMANDS.GET_CHANNEL_ONLINE, { channelId })
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

  const setChatAvatar = useCallback(
    async (params: { imageBase64: string; mimeType?: string } | { clear: true }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear chat is not ready')
      const nextIdentity = await callRpc<PearIdentity>(
        rpc,
        PEAR_RPC_COMMANDS.SET_CHAT_AVATAR,
        params
      )
      setIdentity(nextIdentity)
      return nextIdentity
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

  const setInferenceEnabled = useCallback(
    async (enabled: boolean) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear network is not ready')
      const status = await callRpc<PeerInferencePeer>(
        rpc,
        PEAR_RPC_COMMANDS.SET_INFERENCE_ENABLED,
        { enabled }
      )
      setInferenceStatus(status)
      return status
    },
    [ensureStarted]
  )

  const setInferenceRuntimeBusy = useCallback(
    async (busy: boolean) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear network is not ready')
      const status = await callRpc<PeerInferencePeer>(
        rpc,
        PEAR_RPC_COMMANDS.SET_INFERENCE_RUNTIME_BUSY,
        { busy }
      )
      setInferenceStatus(status)
      return status
    },
    [ensureStarted]
  )

  const listInferencePeers = useCallback(async () => {
    await ensureStarted()
    const rpc = rpcRef.current
    if (!rpc) throw new Error('Pear network is not ready')
    return callRpc<PeerInferencePeer[]>(rpc, PEAR_RPC_COMMANDS.LIST_INFERENCE_PEERS, {
      timeoutMs: 30_000,
    }, 35_000)
  }, [ensureStarted])

  const requestPeerInference = useCallback(
    async (
      providerPubkey: string,
      input: Omit<MatchScoutInput, 'tipsterHintsBlock'>
    ) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear network is not ready')
      return callRpc<{ requestId: string; provider: PeerInferencePeer }>(
        rpc,
        PEAR_RPC_COMMANDS.REQUEST_PEER_INFERENCE,
        { providerPubkey, input },
        35_000
      )
    },
    [ensureStarted]
  )

  const sendInferenceProgress = useCallback(
    async (params: { requestId: string; stage?: string; message?: string }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear network is not ready')
      await callRpc(rpc, PEAR_RPC_COMMANDS.SEND_INFERENCE_PROGRESS, params)
    },
    [ensureStarted]
  )

  const completeInferenceRequest = useCallback(
    async (params: {
      requestId: string
      result?: PeerInferenceResult
      error?: string
    }) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) throw new Error('Pear network is not ready')
      await callRpc(rpc, PEAR_RPC_COMMANDS.COMPLETE_INFERENCE_REQUEST, params)
    },
    [ensureStarted]
  )

  const cancelPeerInference = useCallback(
    async (requestId: string) => {
      await ensureStarted()
      const rpc = rpcRef.current
      if (!rpc) return
      await callRpc(rpc, PEAR_RPC_COMMANDS.CANCEL_PEER_INFERENCE, { requestId })
    },
    [ensureStarted]
  )

  const onInferenceProviderRequest = useCallback(
    (listener: (request: PeerInferenceRequest) => void) => {
      inferenceProviderListenersRef.current.add(listener)
      return () => {
        inferenceProviderListenersRef.current.delete(listener)
      }
    },
    []
  )

  const onInferenceEvent = useCallback((listener: (event: PeerInferenceEvent) => void) => {
    inferenceEventListenersRef.current.add(listener)
    return () => {
      inferenceEventListenersRef.current.delete(listener)
    }
  }, [])

  const setInferenceOptIn = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const settings = await loadQvacSettings()
        if (!(await isQvacModelMarkedInstalled(settings.modelPreset))) {
          throw new Error('Download the Local AI model before offering peer inference')
        }
        await ensureStarted()
        await warmQvacWorklet()
      }
      await AsyncStorage.setItem(INFERENCE_OPT_IN_KEY, enabled ? '1' : '0')
      setInferenceOptInState(enabled)
      if (readyRef.current && rpcRef.current) {
        const status = await callRpc<PeerInferencePeer>(
          rpcRef.current,
          PEAR_RPC_COMMANDS.SET_INFERENCE_ENABLED,
          { enabled: enabled && appForeground }
        )
        setInferenceStatus(status)
      }
    },
    [appForeground, ensureStarted]
  )

  useEffect(() => {
    AsyncStorage.getItem(INFERENCE_OPT_IN_KEY)
      .then((value) => setInferenceOptInState(value === '1'))
      .catch(() => setInferenceOptInState(false))
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppForeground(state === 'active')
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!inferenceOptIn || !appForeground) return
    void ensureStarted()
      .then(() => warmQvacWorklet())
      .catch(() => {})
  }, [appForeground, ensureStarted, inferenceOptIn])

  useEffect(() => {
    if (!ready || !rpcRef.current) return
    let cancelled = false
    void (async () => {
      if (cancelled || !rpcRef.current) return
      const status = await callRpc<PeerInferencePeer>(
        rpcRef.current,
        PEAR_RPC_COMMANDS.SET_INFERENCE_ENABLED,
        { enabled: inferenceOptIn && appForeground }
      )
      if (!cancelled) setInferenceStatus(status)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [appForeground, inferenceOptIn, ready])

  useEffect(() => {
    if (!ready) return
    return subscribeInferenceOwner((owner) => {
      const rpc = rpcRef.current
      if (!rpc) return
      void callRpc<PeerInferencePeer>(
        rpc,
        PEAR_RPC_COMMANDS.SET_INFERENCE_RUNTIME_BUSY,
        { busy: owner !== null }
      ).then(setInferenceStatus).catch(() => {})
    })
  }, [ready])

  const runProviderInference = useCallback(
    async (request: PeerInferenceRequest) => {
      const owner = `peer:${request.requestId}` as const
      setActiveProviderRequest(request)
      setProviderStage('loading-model')
      setProviderActivity('Peer requested match analysis…')
      setProviderError(null)
      toast.info('Peer inference request', {
        description: request.input.matchTitle,
        duration: 6000,
      })

      let failedMessage: string | null = null

      try {
        await warmQvacWorklet()
      } catch (error) {
        failedMessage = error instanceof Error ? error.message : String(error)
        setProviderError(failedMessage)
        await completeInferenceRequest({
          requestId: request.requestId,
          error: failedMessage,
        }).catch(() => {})
        toast.error('Peer inference failed', { description: failedMessage })
        setTimeout(() => {
          setActiveProviderRequest(null)
          setProviderStage(null)
          setProviderActivity(null)
          setProviderError(null)
        }, 8000)
        return
      }

      if (!acquireInference(owner)) {
        await completeInferenceRequest({
          requestId: request.requestId,
          error: 'Inference engine is busy',
        })
        setActiveProviderRequest(null)
        setProviderStage(null)
        setProviderActivity(null)
        return
      }

      const controller = new AbortController()
      remoteAbortRef.current.set(request.requestId, controller)
      let answer = ''
      let dossier: MatchDossier | null = null
      let picks: MatchPickSuggestion[] = []
      let lastProgressAt = 0

      try {
        const settings = await loadQvacSettings()
        if (!(await isQvacModelMarkedInstalled(settings.modelPreset))) {
          throw new Error('Provider model is not installed')
        }

        const wallet = await getPolygonWalletAddress()
        const tipsterHintsBlock = wallet
          ? await buildTipsterHintsPrompt(wallet, {
              gameId: request.input.gameId,
              matchTitle: request.input.matchTitle,
              league: request.input.league,
            })
          : ''

        for await (const event of runMatchScout(
          { ...request.input, tipsterHintsBlock },
          { signal: controller.signal, peerMode: true }
        )) {
          if (controller.signal.aborted) {
            throw new Error(
              remoteCancelReasonRef.current.get(request.requestId) || 'Inference cancelled'
            )
          }
          if (event.type === 'answer-reset') answer = ''
          if (event.type === 'answer-delta') answer += event.text
          if (event.type === 'picks') picks = event.picks
          if (event.type === 'dossier' || event.type === 'done') dossier = event.dossier

          if (event.type === 'stage') {
            setProviderStage(event.stage)
          }
          if (event.type === 'activity') {
            setProviderActivity(event.message)
          }

          const message =
            event.type === 'activity'
              ? event.message
              : event.type === 'stage'
                ? event.stage === 'web'
                  ? 'Searching public match sources…'
                  : event.stage === 'synthesis'
                    ? 'Running peer model…'
                    : 'Loading peer model…'
                : null
          if (message && Date.now() - lastProgressAt > 700) {
            lastProgressAt = Date.now()
            await sendInferenceProgress({
              requestId: request.requestId,
              stage: event.type === 'stage' ? event.stage : undefined,
              message,
            })
          }
        }

        if (!dossier) throw new Error('Peer analysis produced no dossier')
        const suggestions = attachReasonsToPicks(answer, picks, request.input.matchTitle)
        await completeInferenceRequest({
          requestId: request.requestId,
          result: { dossier, answer, suggestions },
        })
        toast.success('Peer inference complete', {
          description: request.input.matchTitle,
        })
      } catch (error) {
        failedMessage = error instanceof Error ? error.message : String(error)
        setProviderError(failedMessage)
        await completeInferenceRequest({
          requestId: request.requestId,
          error: failedMessage,
        }).catch(() => {})
        toast.error('Peer inference failed', {
          description: failedMessage,
        })
      } finally {
        remoteAbortRef.current.delete(request.requestId)
        remoteCancelReasonRef.current.delete(request.requestId)
        try {
          await unloadQvacModel()
        } catch {}
        releaseInference(owner)
        if (failedMessage) {
          setTimeout(() => {
            setActiveProviderRequest(null)
            setProviderStage(null)
            setProviderActivity(null)
            setProviderError(null)
          }, 8000)
        } else {
          setActiveProviderRequest(null)
          setProviderStage(null)
          setProviderActivity(null)
          setProviderError(null)
        }
      }
    },
    [completeInferenceRequest, sendInferenceProgress]
  )

  useEffect(() => {
    const listeners = inferenceProviderListenersRef.current
    const listener = (request: PeerInferenceRequest) => {
      void runProviderInference(request)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [runProviderInference])

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
      inferenceStatus,
      inferenceOptIn,
      activeProviderRequest,
      providerStage,
      providerActivity,
      providerError,
      createChannel,
      createVaultChannel,
      joinVaultChannel,
      ensureVaultSessionProof,
      joinChannel,
      sendMessage,
      checkVaultChannelAccessForWallet,
      getHistory,
      pingChannelPresence,
      getChannelOnline,
      shareChannelKey,
      setTipsterProfile,
      setChatAvatar,
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
      setInferenceEnabled,
      setInferenceRuntimeBusy,
      listInferencePeers,
      requestPeerInference,
      sendInferenceProgress,
      completeInferenceRequest,
      cancelPeerInference,
      onInferenceProviderRequest,
      onInferenceEvent,
      setInferenceOptIn,
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
      inferenceStatus,
      inferenceOptIn,
      activeProviderRequest,
      providerStage,
      providerActivity,
      providerError,
      createChannel,
      createVaultChannel,
      joinVaultChannel,
      ensureVaultSessionProof,
      joinChannel,
      sendMessage,
      checkVaultChannelAccessForWallet,
      getHistory,
      pingChannelPresence,
      getChannelOnline,
      shareChannelKey,
      setTipsterProfile,
      setChatAvatar,
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
      setInferenceEnabled,
      setInferenceRuntimeBusy,
      listInferencePeers,
      requestPeerInference,
      sendInferenceProgress,
      completeInferenceRequest,
      cancelPeerInference,
      onInferenceProviderRequest,
      onInferenceEvent,
      setInferenceOptIn,
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
