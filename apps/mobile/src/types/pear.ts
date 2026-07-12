export interface PearIdentity {
  pubkey: string
  /** Short Pear device id — internal only */
  deviceId: string
  /** On-chain @handle when announced for chat */
  onChainHandle?: string | null
  avatarUri?: string | null
  avatarData?: string | null
}

export type PearChannelKind = 'channel' | 'dm' | 'vault'

export interface PearChannel {
  id: string
  kind?: PearChannelKind
  name: string
  topicKey: string
  coreKey?: string
  ownerPubkey: string
  peerPubkey?: string | null
  peerHandle?: string | null
  peerAvatarData?: string | null
  isPrivate: boolean
  canonicalPublic?: boolean
  createdAt: number
  vaultAddress?: string | null
  tipsterAddress?: string | null
  minShares?: string | null
  devBypassTag?: string | null
}

export interface PearMessage {
  id: string
  channelId: string
  kind?: PearChannelKind
  author: string
  authorPubkey: string
  text: string
  timestamp: number
  isMine?: boolean
  wallet?: string
  walletSignature?: string
  sharesSnapshot?: string
  signedAt?: number
  gateBypass?: string
  vaultAddress?: string
  walletVerified?: boolean
  avatarData?: string | null
}

export interface TipsterProfile {
  displayName: string
  bio: string
  walletAddress: string | null
  publicChannelId: string | null
  privateChannelId: string | null
  createdAt: number
}

export interface JoinChannelResult {
  channel: PearChannel
  history: PearMessage[]
}

export interface PearContactRequest {
  id: string
  fromPubkey?: string
  fromHandle?: string | null
  toHandle?: string
  toPubkey?: string
  note?: string
  fromAvatarData?: string | null
  timestamp: number
}

export interface PearAcceptedContact {
  dmId: string
  peerPubkey: string
  peerHandle?: string | null
  peerAvatarData?: string | null
  acceptedAt: number
}

export interface PearContactsState {
  pendingIncoming: PearContactRequest[]
  pendingOutgoing: PearContactRequest[]
  accepted: PearAcceptedContact[]
}

export interface PearHandleLookup {
  handle: string
  pubkey: string
  avatarData?: string | null
}

export interface PearOnlinePeer {
  author: string
  authorPubkey: string
  wallet?: string | null
  role?: string | null
  lastSeen: number
}
