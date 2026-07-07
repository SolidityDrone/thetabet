import { ponderQuery } from '@/services/ponder/client'

export type TipsterNameRecord = {
  address: string
  name: string
  nameKey: string
  pubKeyX: string
  pubKeyY: string
}

type TipsterByNameResponse = {
  tipsterNames: { items: TipsterNameRecord[] }
}

type TipsterByAddressResponse = {
  tipsterNames: { items: TipsterNameRecord[] }
}

const TIPSTER_BY_NAME_QUERY = `
  query TipsterByName($nameKey: String!) {
    tipsterNames(where: { nameKey: $nameKey }, limit: 1) {
      items {
        address
        name
        nameKey
        pubKeyX
        pubKeyY
      }
    }
  }
`

const TIPSTER_BY_ADDRESS_QUERY = `
  query TipsterByAddress($address: String!) {
    tipsterNames(where: { address: $address }, limit: 1) {
      items {
        address
        name
        nameKey
        pubKeyX
        pubKeyY
      }
    }
  }
`

export function normalizeTipsterHandle(handle: string) {
  return handle.trim().toLowerCase().replace(/^@/, '')
}

export async function fetchTipsterByHandle(handle: string) {
  const nameKey = normalizeTipsterHandle(handle)
  if (!nameKey) return null

  const data = await ponderQuery<TipsterByNameResponse>(TIPSTER_BY_NAME_QUERY, { nameKey })
  return data.tipsterNames.items[0] ?? null
}

export async function fetchTipsterByAddress(address: string) {
  if (!address) return null

  const data = await ponderQuery<TipsterByAddressResponse>(TIPSTER_BY_ADDRESS_QUERY, {
    address: address.toLowerCase(),
  })
  return data.tipsterNames.items[0] ?? null
}
