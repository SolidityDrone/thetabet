export interface PearIdentity {
  pubkey: string
  /** Short Pear device id — internal only */
  deviceId: string
  /** On-chain @handle when announced for chat */
  onChainHandle?: string | null
}

export type PearChannelKind = 'channel' | 'dm'

export interface PearChannel {
  id: string
  kind?: PearChannelKind
  name: string
  topicKey: string
  ownerPubkey: string
  peerPubkey?: string | null
  peerHandle?: string | null
  isPrivate: boolean
  createdAt: number
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
  timestamp: number
}

export interface PearAcceptedContact {
  dmId: string
  peerPubkey: string
  peerHandle?: string | null
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
}
