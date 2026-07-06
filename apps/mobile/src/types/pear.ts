export interface PearIdentity {
  pubkey: string
  handle: string
}

export interface PearChannel {
  id: string
  name: string
  topicKey: string
  ownerPubkey: string
  isPrivate: boolean
  createdAt: number
}

export interface PearMessage {
  id: string
  channelId: string
  author: string
  authorPubkey: string
  text: string
  timestamp: number
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
